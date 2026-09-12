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
from backend.utils.multimodal import parse_multimodal_content

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

def save_message(db, session_id: str, role: str, content: str) -> Message:
    msg = Message(id=str(uuid.uuid4()), session_id=session_id, role=role, content=content)
    db.add(msg)
    db.commit()
    return msg

def summarize_chat_history_task(session_id: str):
    from backend.db.postgres import SessionLocal
    db = SessionLocal()
    try:
        session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
        if not session:
            return
            
        history_msgs = db.query(Message).filter(Message.session_id == session_id).order_by(Message.created_at).all()
        
        summary_data = {"text": "", "last_msg_id": None}
        if session.summary:
            # Safely parse the existing summary JSON which stores both the text and the ID of the last summarized message
            try:
                summary_data = json.loads(session.summary)
            except:
                summary_data = {"text": session.summary, "last_msg_id": None}
                
        start_idx = 0
        if summary_data["last_msg_id"]:
            # Locate where we left off so we only summarize new, unprocessed messages
            for i, m in enumerate(history_msgs):
                if m.id == summary_data["last_msg_id"]:
                    start_idx = i + 1
                    break
                    
        # Grab all unprocessed messages except the 4 most recent ones (to keep immediate context fresh)
        msgs_to_summarize = history_msgs[start_idx:-4]
        if len(msgs_to_summarize) < 4:
            return
            
        text_to_summarize = ""
        if summary_data["text"]:
            text_to_summarize += f"Previous Summary: {summary_data['text']}\n\n"
            
        for m in msgs_to_summarize:
            text_to_summarize += f"{m.role}: {m.content}\n"
            
        # Use a lightweight LLM to roll up the old messages into the existing summary context
        llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.2)
        prompt = (
            "Summarize the following chat history concisely. "
            "Retain key technical details, decisions, and context about the codebase. "
            f"\n\n{text_to_summarize}"
        )
        new_summary_text = llm.invoke([HumanMessage(content=prompt)]).content.strip()
        
        # Save the new summary and update the pointer to the last message we included in this batch
        last_msg = msgs_to_summarize[-1]
        session.summary = json.dumps({"text": new_summary_text, "last_msg_id": last_msg.id})
        db.commit()
    except Exception as e:
        print(f"Background summarization failed: {e}")
    finally:
        db.close()

async def stream_ask_mode(body: ChatRequest, tenant_id: str, history_msgs: list, summary_text: str, result_ref: dict):
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
        "If the user asks a high-level question (e.g., 'Explain the architecture') and the codebase context is empty or limited, DO NOT give a generic refusal. Instead, explain whatever you can infer, and suggest they use **Composer mode** for a deep codebase analysis. "
        "IMPORTANT: You MUST ONLY respond to questions related to the codebase, programming, or technical topics. Do not answer general knowledge questions. "
        "When greeting the user, explicitly mention the repository name. "
    )
    if summary_text:
        system_prompt += f"\n\nPrevious Conversation Summary:\n{summary_text}"
        
    system_prompt += f"\n\nCodebase Context:\n{context_str}"
    
    messages = [SystemMessage(content=system_prompt)]
    for msg in history_msgs[:-1]:
        if msg.role == "user":
            messages.append(HumanMessage(content=parse_multimodal_content(msg.content)))
        elif msg.role == "assistant":
            messages.append(AIMessage(content=msg.content))
            
    messages.append(HumanMessage(content=parse_multimodal_content(body.message)))
    
    final_answer = ""
    async for chunk in llm.astream(messages):
        if chunk.content:
            final_answer += chunk.content
            yield {"event": "token", "data": json.dumps({"token": chunk.content})}
            
    result_ref["final_answer"] = final_answer

async def stream_plan_mode(body: ChatRequest, tenant_id: str, formatted_history: str, summary_text: str, result_ref: dict):
    if summary_text:
        formatted_history = f"Previous Conversation Summary:\n{summary_text}\n\nRecent Messages:\n{formatted_history}"
        
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

from fastapi import BackgroundTasks

@router.post("/chat")
async def chat(request: Request, body: ChatRequest, background_tasks: BackgroundTasks, db = Depends(get_db)):
    tenant_id = request.state.tenant_id
    
    ensure_tenant(db, tenant_id)
    session_id = get_or_create_session(db, body.session_id, tenant_id, body.repo_name, body.message)
    save_message(db, session_id, "user", body.message)
    
    session = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    summary_text = ""
    if session and session.summary:
        try:
            summary_data = json.loads(session.summary)
            summary_text = summary_data.get("text", "")
        except:
            summary_text = session.summary
            
    async def event_generator():
        try:
            history_msgs = db.query(Message).filter(Message.session_id == session_id).order_by(Message.created_at).all()
            
            # Limit history to the last 6 messages to save tokens if we have a summary strategy
            recent_msgs = history_msgs[-6:] if len(history_msgs) > 6 else history_msgs
            
            result_ref = {"final_answer": ""}
            
            if body.mode == "ask":
                async for event in stream_ask_mode(body, tenant_id, recent_msgs, summary_text, result_ref):
                    yield event
            else:
                formatted_history = "\n".join([f"{m.role}: {m.content}" for m in recent_msgs[:-1]])
                async for event in stream_plan_mode(body, tenant_id, formatted_history, summary_text, result_ref):
                    yield event
                    
            final_answer = result_ref["final_answer"]
            yield {"event": "message", "data": json.dumps({"content": final_answer, "session_id": session_id})}
            
            save_message(db, session_id, "assistant", final_answer)
            
            # Trigger background summarization if history is getting long
            if len(history_msgs) > 10:
                background_tasks.add_task(summarize_chat_history_task, session_id)
            
        except Exception as e:
            yield {"event": "error", "data": str(e)}
            
    return EventSourceResponse(event_generator())
