from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from qdrant_client.models import FilterSelector, Filter, FieldCondition, MatchValue

from backend.db.postgres import get_db
from backend.db.models import Repository, ChatSession
from backend.db.client import get_qdrant_client
from backend.ingestion.pipeline import async_ingest_repository_generator, cancel_ingestion
from backend.ingestion.repo_manager import RepoManager
from backend.constants import COLLECTION_NAME

router = APIRouter()

class IngestRequest(BaseModel):
    url: str
    token: Optional[str] = None
    branch: Optional[str] = None

@router.get("/repos")
async def get_repos(request: Request, db = Depends(get_db)):
    tenant_id = request.state.tenant_id
    repos = db.query(Repository).filter(Repository.tenant_id == tenant_id).all()
    return [{"id": r.id, "name": r.name, "url": r.url} for r in repos]

@router.post("/repos/ingest")
async def ingest_repo(request: Request, body: IngestRequest, db = Depends(get_db)):
    tenant_id = request.state.tenant_id
    return EventSourceResponse(async_ingest_repository_generator(body.url, tenant_id, db, token=body.token, branch=body.branch))

@router.post("/repos/branches")
async def get_branches(body: IngestRequest):
    try:
        rm = RepoManager()
        branches = rm.get_remote_branches(body.url, token=body.token)
        return {"branches": branches}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/repos/ingest/cancel")
async def cancel_ingest(request: Request):
    tenant_id = request.state.tenant_id
    cancel_ingestion(tenant_id)
    return {"status": "success", "message": "Cancellation signal sent."}

@router.delete("/repos/{repo_id:path}")
async def delete_repo(repo_id: str, request: Request, db = Depends(get_db)):
    tenant_id = request.state.tenant_id
    
    # Look up by repo id or name within this tenant
    repo = db.query(Repository).filter(
        (Repository.id == repo_id) | (Repository.name == repo_id),
        Repository.tenant_id == tenant_id
    ).first()
    
    if not repo:
        raise HTTPException(status_code=404, detail=f"Repository '{repo_id}' not found")
        
    repo_name = repo.name
    actual_repo_id = repo.id
    
    try:
        # 1. Cascade delete ChatSessions for this repo and tenant
        sessions = db.query(ChatSession).filter(
            ChatSession.repo_id == actual_repo_id,
            ChatSession.tenant_id == tenant_id
        ).all()
        for session in sessions:
            db.delete(session)
            
        # 2. Delete Repository from PostgreSQL
        db.delete(repo)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Database transaction failed: {str(e)}")
    
    # 3. Delete points from Qdrant
    try:
        q_client = get_qdrant_client()
        if q_client.collection_exists(collection_name=COLLECTION_NAME):
            q_client.delete(
                collection_name=COLLECTION_NAME,
                points_selector=FilterSelector(
                    filter=Filter(
                        must=[
                            FieldCondition(key="tenant_id", match=MatchValue(value=tenant_id)),
                            FieldCondition(key="repo_name", match=MatchValue(value=repo_name)),
                        ]
                    )
                ),
            )
    except Exception as e:
        print(f"Warning: Failed to delete Qdrant points: {e}")
        
    # 4. Clean up any leftover cloned directory on disk
    try:
        rm = RepoManager()
        tenant_repo_path = rm.base_dir / tenant_id / repo_name
        if tenant_repo_path.exists():
            rm.cleanup_repo(tenant_repo_path)
            
        root_repo_path = rm.base_dir / repo_name
        if root_repo_path.exists():
            rm.cleanup_repo(root_repo_path)
    except Exception as e:
        print(f"Warning: Failed to cleanup repo directory: {e}")
        
    return {"status": "success", "message": f"Repository '{repo_name}' deleted successfully"}

