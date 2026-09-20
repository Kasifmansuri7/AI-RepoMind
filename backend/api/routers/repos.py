import json
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
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

class ArchitectureNode(BaseModel):
    id: str = Field(description="a unique string identifier (e.g. 'frontend', 'backend', 'db')")
    label: str = Field(description="a short title (e.g. 'React Frontend', 'Postgres DB')")
    description: str = Field(description="a 1-2 line description of what this node does")
    icon: str = Field(description='exactly one of these strings matching a Lucide icon: "Monitor", "Server", "Database", "BrainCircuit", "HardDriveDownload", "TerminalSquare", "Globe", "Cloud"')
    iconBg: str = Field(description='a Tailwind class string for colors, like "bg-blue-500/20 text-blue-400"')

class ArchitectureEdge(BaseModel):
    id: str = Field(description="a unique string (e.g. 'e-front-back')")
    source: str = Field(description="the id of the source node")
    target: str = Field(description="the id of the target node")

class ArchitectureGraph(BaseModel):
    nodes: List[ArchitectureNode]
    edges: List[ArchitectureEdge]

class RepoSuggestions(BaseModel):
    suggestions: List[str] = Field(description="Exactly 4 tailored suggestions/questions for this repository.", min_length=4, max_length=4)

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

@router.get("/repos/{repo_id:path}/architecture")
async def generate_architecture(repo_id: str, request: Request, force_refresh: bool = False, db = Depends(get_db)):
    tenant_id = request.state.tenant_id
    
    repo = db.query(Repository).filter(
        (Repository.id == repo_id) | (Repository.name == repo_id),
        Repository.tenant_id == tenant_id
    ).first()
    
    if not repo:
        raise HTTPException(status_code=404, detail=f"Repository '{repo_id}' not found")
        
    if not force_refresh and repo.architecture_graph:
        return json.loads(repo.architecture_graph)
        
    actual_repo_id = repo.id
    q_client = get_qdrant_client()
    
    TECH_STACK_FILES = [
        "package.json", "requirements.txt", "pyproject.toml", 
        "go.mod", "Cargo.toml", "docker-compose.yml", "tsconfig.json", "pom.xml", "build.gradle",
        "README.md", "index.html", "app.py", "main.py", "index.js", "app.js", "main.go", "Makefile",
        "next.config.js", "next.config.ts", "vite.config.ts", "vite.config.js"
    ]
    
    found_files = {}
    fallback_files = {}
    
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
                
                if filename in TECH_STACK_FILES:
                    if file_path not in found_files:
                        found_files[file_path] = []
                    found_files[file_path].append((record.payload.get("chunk_index", 0), record.payload.get("content", "")))
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
        if len(content) > 15000:
            content = content[:15000] + "\n...[TRUNCATED]"
        file_contents += f"\n\n--- {path} ---\n{content}"
        
    if len(file_contents) > 80000:
        file_contents = file_contents[:80000] + "\n...[OVERALL TRUNCATED]"
        
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.0)
    
    sys_msg = SystemMessage(content="""You are an expert software architect. Analyze the provided repository configuration files and deduce the high-level architecture. 
CRITICAL RULES:
1. ONLY include components that are EXPLICITLY mentioned in the provided files.
2. If this is a frontend-only application, DO NOT hallucinate backend servers, databases, AWS, Vercel, etc.
3. However, your graph MUST contain a minimum of 3 nodes to be visually meaningful. 
4. To achieve this for a frontend-only app, break down the frontend architecture into logical client-side layers based on the dependencies (e.g., "UI Components (React)", "State Management (Zustand/Redux)", "Client Routing (Next.js/React Router)", "Styling (Tailwind/CSS)").""")
    
    human_msg = HumanMessage(content=f"""
Analyze the following configuration files from a codebase. Generate a high-level architecture diagram based STRICTLY and ONLY on the evidence in these files. Do not guess or assume any missing pieces.

Files:
{file_contents}
""")

    structured_llm = llm.with_structured_output(ArchitectureGraph)

    try:
        response = structured_llm.invoke([sys_msg, human_msg])
        graph_dict = response.model_dump() if hasattr(response, "model_dump") else response.dict()
        
        # Save to DB
        repo.architecture_graph = json.dumps(graph_dict)
        db.commit()
        
        return graph_dict
    except Exception as e:
        print(f"Error generating architecture: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to generate architecture diagram")

@router.get("/repos/{repo_id:path}/suggestions")
async def get_suggestions(repo_id: str, request: Request, force_refresh: bool = False, db = Depends(get_db)):
    tenant_id = request.state.tenant_id
    
    repo = db.query(Repository).filter(
        (Repository.id == repo_id) | (Repository.name == repo_id),
        Repository.tenant_id == tenant_id
    ).first()
    
    if not repo:
        raise HTTPException(status_code=404, detail=f"Repository '{repo_id}' not found")
        
    if not force_refresh and repo.suggestions:
        return json.loads(repo.suggestions)
        
    fallback = [
        "Explain the architecture",
        "How do I get started with this repo?",
        "Find potential bugs or edge cases",
        "Suggest areas for refactoring"
    ]
        
    if not repo.architecture_graph:
        return {"suggestions": fallback}
        
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0.7)
    
    sys_msg = SystemMessage(content="""You are an AI coding assistant helping a user explore a code repository.
Based on the provided architecture graph of the repository, generate exactly 4 dynamic, highly contextual prompt suggestions that the user could click to ask you.
CRITICAL RULES:
1. Make the suggestions relevant to the specific components found in the architecture graph.
2. If there is NO database mentioned in the graph, DO NOT suggest anything about databases or schemas.
3. If it's a frontend-only app, suggest things about state management, UI components, etc.
4. Keep each suggestion concise (max 8 words).""")
    
    human_msg = HumanMessage(content=f"Architecture Graph:\n{repo.architecture_graph}")
    
    structured_llm = llm.with_structured_output(RepoSuggestions)
    
    try:
        response = structured_llm.invoke([sys_msg, human_msg])
        suggestions_list = response.suggestions if hasattr(response, "suggestions") else response.get("suggestions", fallback)
        
        # Save to DB
        repo.suggestions = json.dumps({"suggestions": suggestions_list})
        db.commit()
        
        return {"suggestions": suggestions_list}
    except Exception as e:
        print(f"Error generating suggestions: {e}")
        db.rollback()
        return {"suggestions": fallback}
