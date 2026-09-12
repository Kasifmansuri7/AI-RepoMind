from fastapi import APIRouter, Depends, Request, HTTPException, Query
from typing import Optional
from sqlalchemy import or_
from backend.db.postgres import get_db
from backend.db.models import ChatSession, Message

router = APIRouter()

@router.get("/chats")
async def get_chats(
    request: Request,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    repo_id: Optional[str] = None,
    db = Depends(get_db)
):
    tenant_id = request.state.tenant_id
    query = db.query(ChatSession).filter(ChatSession.tenant_id == tenant_id)
    
    if repo_id:
        query = query.filter(ChatSession.repo_id == repo_id)
        
    if search:
        query = query.outerjoin(Message, ChatSession.id == Message.session_id).filter(
            or_(
                ChatSession.title.ilike(f"%{search}%"),
                Message.content.ilike(f"%{search}%")
            )
        ).distinct()
        
    total = query.count()
    sessions = query.order_by(ChatSession.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
    
    items = [{"id": s.id, "repo_id": s.repo_id, "title": s.title, "created_at": str(s.created_at)} for s in sessions]
    
    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "has_more": (page * limit) < total
    }

@router.get("/chats/{session_id}")
async def get_chat_messages(
    session_id: str,
    request: Request,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    db = Depends(get_db)
):
    tenant_id = request.state.tenant_id
    session = db.query(ChatSession).filter(ChatSession.id == session_id, ChatSession.tenant_id == tenant_id).first()
    if not session:
        return {"items": [], "has_more": False}
    
    query = db.query(Message).filter(Message.session_id == session_id)
    total = query.count()
    
    # Order by DESC to get newest messages first for pagination
    messages = query.order_by(Message.created_at.desc()).offset((page - 1) * limit).limit(limit).all()
    
    # Reverse to send them in chronological order to the frontend
    messages.reverse()
    
    items = [{"role": m.role, "content": m.content} for m in messages]
    
    return {
        "items": items,
        "total": total,
        "page": page,
        "limit": limit,
        "has_more": (page * limit) < total
    }

@router.delete("/chats/{session_id}")
async def delete_chat_session(session_id: str, request: Request, db = Depends(get_db)):
    tenant_id = request.state.tenant_id
    session = db.query(ChatSession).filter(ChatSession.id == session_id, ChatSession.tenant_id == tenant_id).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="Chat session not found")
        
    try:
        db.delete(session)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
        
    return {"status": "success", "message": "Chat session deleted successfully"}
