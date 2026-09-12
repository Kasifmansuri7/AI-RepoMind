import uuid
import json
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from backend.db.postgres import get_db
from backend.db.models import Tenant, ChatSession, Message
from backend.agents.graph import agent_graph
from backend.rag.search import CodeSearcher
from backend.db.client import get_qdrant_client
from backend.ingestion.embedder import Embedder

router = APIRouter()

from typing import Optional

class ChatRequest(BaseModel):
    message: str
    repo_name: str
    session_id: Optional[str] = None
    mode: str = "ask"

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

def generate_chat_title(message: str) -> str:
    try:
        llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.2)
        messages = [
            SystemMessage(content="You are a helpful assistant that generates a very short (max 4-5 words) and concise title for a chat conversation based on the user's first message. Do not include quotes or punctuation."),
            HumanMessage(content=message)
        ]
        response = llm.invoke(messages)
        return response.content.strip()
    except Exception:
        return message[:30] + "..."

def ensure_tenant(db, tenant_id: str):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        tenant = Tenant(id=tenant_id, name=f"User {tenant_id}")
        db.add(tenant)
        db.commit()
    return tenant

def get_or_create_session(db, session_id: Optional[str], tenant_id: str, repo_name: str, initial_message: str) -> str:
    if not session_id:
        session_id = str(uuid.uuid4())
        repo_id = f"{tenant_id}_{repo_name}"
        title = generate_chat_title(initial_message)
        session = ChatSession(id=session_id, tenant_id=tenant_id, repo_id=repo_id, title=title)
        db.add(session)
        db.commit()
    return session_id

def save_message(db, session_id: str, role: str, content: str):
    msg = Message(id=str(uuid.uuid4()), session_id=session_id, role=role, content=content)
    db.add(msg)
    db.commit()

async def stream_ask_mode(body: ChatRequest, tenant_id: str, history_msgs: list, result_ref: dict):
    yield {"event": "status", "data": "Searching codebase..."}
    
    q_client = get_qdrant_client()
    embedder = Embedder()
    searcher = CodeSearcher(q_client=q_client, embedder=embedder)
    
    try:
        search_results = searcher.search(query=body.message, tenant_id=tenant_id, repo_name=body.repo_name, limit=5)
        context_chunks = [f"File: {res['file_path']}\n{res['content']}" for res in search_results]
        context_str = "\n\n".join(context_chunks) or "No relevant code found for this query."
    except Exception as e:
        print(f"Ask mode search failed: {e}")
        context_str = f"Error searching codebase: {str(e)}"
    
    yield {"event": "status", "data": "Thinking..."}
    
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.2)
    system_prompt = (
        f"You are AI-RepoMind, a helpful codebase assistant. The active repository is '{body.repo_name}'. "
        "Provide a fast, concise answer based on the provided codebase context. "
        "When greeting the user or responding to general queries, ALWAYS explicitly mention the repository name. "
        f"\n\nCodebase Context:\n{context_str}"
    )
    
    messages = [SystemMessage(content=system_prompt)]
    for msg in history_msgs[:-1]:
        if msg.role == "user":
            messages.append(HumanMessage(content=msg.content))
        elif msg.role == "assistant":
            messages.append(AIMessage(content=msg.content))
            
    messages.append(HumanMessage(content=body.message))
    
    final_answer = ""
    async for chunk in llm.astream(messages):
        if chunk.content:
            final_answer += chunk.content
            yield {"event": "token", "data": json.dumps({"token": chunk.content})}
            
    result_ref["final_answer"] = final_answer

async def stream_plan_mode(body: ChatRequest, tenant_id: str, formatted_history: str, result_ref: dict):
    initial_state = {
        "task": body.message,
        "tenant_id": tenant_id,
        "repo_name": body.repo_name,
        "chat_history": formatted_history,
        "revision_number": 0,
        "max_revisions": 3
    }
    
    final_answer = ""
    async for chunk in agent_graph.astream(initial_state):
        for node, state in chunk.items():
            if node == "planner":
                yield {"event": "status", "data": "Planning solution and searching codebase..."}
            elif node == "search":
                yield {"event": "status", "data": "Analyzing retrieved code snippets..."}
            elif node == "coder":
                yield {"event": "status", "data": "Drafting code..."}
            elif node == "reviewer":
                action = state.get('review_action')
                if action == "approve":
                    yield {"event": "status", "data": "Review passed! Sending final response..."}
                elif action == "replan":
                    yield {"event": "status", "data": "Missing context. Rethinking search strategy..."}
                else:
                    yield {"event": "status", "data": "Found issues in draft. Rewriting code..."}
                
        node_name = list(chunk.keys())[0]
        if "draft_code" in chunk[node_name]:
            final_answer = chunk[node_name]["draft_code"]
            
    result_ref["final_answer"] = final_answer

@router.post("/chat")
async def chat(request: Request, body: ChatRequest, db = Depends(get_db)):
    tenant_id = request.state.tenant_id
    
    ensure_tenant(db, tenant_id)
    session_id = get_or_create_session(db, body.session_id, tenant_id, body.repo_name, body.message)
    save_message(db, session_id, "user", body.message)
    
    async def event_generator():
        try:
            history_msgs = db.query(Message).filter(Message.session_id == session_id).order_by(Message.created_at).all()
            result_ref = {"final_answer": ""}
            
            if body.mode == "ask":
                async for event in stream_ask_mode(body, tenant_id, history_msgs, result_ref):
                    yield event
            else:
                formatted_history = "\n".join([f"{m.role}: {m.content}" for m in history_msgs[:-1]])
                async for event in stream_plan_mode(body, tenant_id, formatted_history, result_ref):
                    yield event
                    
            final_answer = result_ref["final_answer"]
            yield {"event": "message", "data": json.dumps({"content": final_answer, "session_id": session_id})}
            
            save_message(db, session_id, "assistant", final_answer)
            
        except Exception as e:
            yield {"event": "error", "data": str(e)}
            
    return EventSourceResponse(event_generator())
