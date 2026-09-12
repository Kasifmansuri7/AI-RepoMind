from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
from qdrant_client.models import FilterSelector, Filter, FieldCondition, MatchValue
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage

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


@router.get("/repos/{repo_id:path}/rules")
async def generate_rules(repo_id: str, request: Request, format: str = "cursor", db = Depends(get_db)):
    tenant_id = request.state.tenant_id
    
    repo = db.query(Repository).filter(
        (Repository.id == repo_id) | (Repository.name == repo_id),
        Repository.tenant_id == tenant_id
    ).first()
    
    if not repo:
        raise HTTPException(status_code=404, detail=f"Repository '{repo_id}' not found")
        
    actual_repo_id = repo.id
    q_client = get_qdrant_client()
    
    TECH_STACK_FILES = [
        "package.json", "requirements.txt", "pyproject.toml", 
        "go.mod", "Cargo.toml", "docker-compose.yml", "tsconfig.json", "pom.xml", "build.gradle",
        "README.md", "index.html", "app.py", "main.py", "index.js", "app.js", "main.go", "Makefile"
    ]
    
    found_files = {}
    fallback_files = {} # Store up to 5 files if no tech stack files are found
    
    if q_client.collection_exists(collection_name=COLLECTION_NAME):
        offset = None
        while True:
            records, next_offset = q_client.scroll(
                collection_name=COLLECTION_NAME,
                scroll_filter=Filter(
                    must=[
                        FieldCondition(key="tenant_id", match=MatchValue(value=tenant_id)),
                        FieldCondition(key="repo_id", match=MatchValue(value=actual_repo_id))
                    ]
                ),
                with_payload=True,
                with_vectors=False,
                limit=100,
                offset=offset
            )
            
            for record in records:
                file_path = record.payload.get("file_path", "")
                filename = file_path.split("/")[-1]
                
                # Check for recognized tech stack files
                if filename in TECH_STACK_FILES:
                    if file_path not in found_files:
                        found_files[file_path] = []
                    found_files[file_path].append((record.payload.get("chunk_index", 0), record.payload.get("content", "")))
                
                # Save as fallback if we haven't reached 5 fallback files
                elif len(fallback_files) < 5 and file_path not in fallback_files:
                    fallback_files[file_path] = []
                
                if file_path in fallback_files:
                    fallback_files[file_path].append((record.payload.get("chunk_index", 0), record.payload.get("content", "")))
            
            offset = next_offset
            if offset is None:
                break
                
    if not found_files:
        if fallback_files:
            found_files = fallback_files
        else:
            raise HTTPException(status_code=404, detail="Repository appears to be empty or contains no readable files.")
        
    file_contents = ""
    for path, chunks in found_files.items():
        chunks.sort(key=lambda x: x[0])
        content = "\n".join(c[1] for c in chunks)
        # Truncate content to avoid blowing up the token limit
        if len(content) > 15000:
            content = content[:15000] + "\n...[TRUNCATED]"
        file_contents += f"\n\n--- {path} ---\n{content}"
        
    # Hard limit on total file contents length (approx 20,000 tokens)
    if len(file_contents) > 80000:
        file_contents = file_contents[:80000] + "\n...[OVERALL TRUNCATED]"
        
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.2)
    
    format_map = {
        "cursor": {
            "name": "Cursor",
            "filename": ".cursorrules",
            "extra_instructions": "Focus on formatting the rules exactly for Cursor's `.cursorrules` convention."
        },
        "windsurf": {
            "name": "Windsurf",
            "filename": ".windsurfrules",
            "extra_instructions": "Focus on formatting the rules exactly for Windsurf's `.windsurfrules` convention."
        },
        "copilot": {
            "name": "GitHub Copilot",
            "filename": "copilot-instructions.md",
            "extra_instructions": "Focus on formatting the rules as custom instructions for GitHub Copilot."
        },
        "generic": {
            "name": "Generic Markdown",
            "filename": "rules.md",
            "extra_instructions": "Format the rules as a generic markdown guide for any AI assistant."
        },
        "antigravity": {
            "name": "Google Antigravity",
            "filename": "AGENTS.md",
            "extra_instructions": "Focus on formatting the rules as custom agent behavior constraints for Google Antigravity. Emphasize tool usage constraints, system boundaries, and project-specific guidelines."
        }
    }
    
    target = format_map.get(format, format_map["cursor"])
    
    sys_msg = SystemMessage(content=f"You are an expert software architect and AI assistant. Your task is to analyze repository configuration files and generate a comprehensive {target['filename']} file for {target['name']}.")
    
    human_msg = HumanMessage(content=f"""
Analyze the following configuration files from a codebase. Generate a comprehensive {target['filename']} file (in Markdown format) detailing the tech stack, code style, conventions, and architectural patterns of this project. Be specific and actionable for an AI assistant.
{target['extra_instructions']}

Files:
{file_contents}

Output ONLY the markdown content of the {target['filename']} file without any surrounding markdown code block syntax (do not add ```markdown at the beginning or ``` at the end).
""")

    response = llm.invoke([sys_msg, human_msg])
    
    return {
        "rules": response.content.strip(),
        "filename": target['filename']
    }

