import uuid
import json
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from backend.db.postgres import get_db
from backend.db.models import Tenant, ChatSession, Message
from backend.agents.graph import agent_graph

router = APIRouter()

class ChatRequest(BaseModel):
    message: str
    repo_name: str
    session_id: str = None

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

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

@router.post("/chat")
async def chat(request: Request, body: ChatRequest, db = Depends(get_db)):
    tenant_id = request.state.tenant_id
    
    # 1. Ensure Tenant exists (since we skip strict JWT registration in this demo)
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        tenant = Tenant(id=tenant_id, name=f"User {tenant_id}")
        db.add(tenant)
        db.commit()
        
    repo_id = f"{tenant_id}_{body.repo_name}"
    
    # 2. Manage Chat Session
    session_id = body.session_id
    if not session_id:
        session_id = str(uuid.uuid4())
        title = generate_chat_title(body.message)
        session = ChatSession(id=session_id, tenant_id=tenant_id, repo_id=repo_id, title=title)
        db.add(session)
    
    # Save user message
    user_msg = Message(id=str(uuid.uuid4()), session_id=session_id, role="user", content=body.message)
    db.add(user_msg)
    db.commit()
    
    # 3. Stream LangGraph execution
    async def event_generator():
        initial_state = {
            "task": body.message,
            "tenant_id": tenant_id,
            "repo_name": body.repo_name,
            "revision_number": 0,
            "max_revisions": 3
        }
        
        final_answer = ""
        try:
            # We use astream to stream the state updates as nodes finish
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
                            
                # Save the final state to get the draft code
                node_name = list(chunk.keys())[0]
                if "draft_code" in chunk[node_name]:
                    final_answer = chunk[node_name]["draft_code"]
                    
            yield {"event": "message", "data": json.dumps({"content": final_answer, "session_id": session_id})}
            
            # Save assistant message to DB
            ai_msg = Message(id=str(uuid.uuid4()), session_id=session_id, role="assistant", content=final_answer)
            db.add(ai_msg)
            db.commit()
            
        except Exception as e:
            yield {"event": "error", "data": str(e)}
            
    return EventSourceResponse(event_generator())
