from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from backend.db.postgres import get_db
from backend.db.models import Repository
from backend.ingestion.pipeline import async_ingest_repository_generator

router = APIRouter()

class IngestRequest(BaseModel):
    url: str

@router.get("/repos")
async def get_repos(request: Request, db = Depends(get_db)):
    tenant_id = request.state.tenant_id
    repos = db.query(Repository).filter(Repository.tenant_id == tenant_id).all()
    return [{"id": r.id, "name": r.name, "url": r.url} for r in repos]

@router.post("/repos/ingest")
async def ingest_repo(request: Request, body: IngestRequest, db = Depends(get_db)):
    tenant_id = request.state.tenant_id
    return EventSourceResponse(async_ingest_repository_generator(body.url, tenant_id, db))
