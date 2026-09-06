from fastapi import APIRouter, Depends, Request
from backend.db.postgres import get_db
from backend.db.models import ChatSession, Message

router = APIRouter()

@router.get("/chats")
async def get_chats(request: Request, db = Depends(get_db)):
    tenant_id = request.state.tenant_id
    sessions = db.query(ChatSession).filter(ChatSession.tenant_id == tenant_id).order_by(ChatSession.created_at.desc()).all()
    return [{"id": s.id, "repo_id": s.repo_id, "created_at": str(s.created_at)} for s in sessions]

@router.get("/chats/{session_id}")
async def get_chat_messages(session_id: str, request: Request, db = Depends(get_db)):
    tenant_id = request.state.tenant_id
    session = db.query(ChatSession).filter(ChatSession.id == session_id, ChatSession.tenant_id == tenant_id).first()
    if not session:
        return []
    
    messages = db.query(Message).filter(Message.session_id == session_id).order_by(Message.created_at.asc()).all()
    return [{"role": m.role, "content": m.content} for m in messages]
