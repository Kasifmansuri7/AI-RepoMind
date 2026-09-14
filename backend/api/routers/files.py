from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from backend.db.postgres import get_db
from backend.db.models import Repository
from backend.ingestion.repo_manager import RepoManager
from backend.api.github_api import get_github_tree, get_github_file_content, commit_github_file

router = APIRouter()

def extract_github_owner_repo(url: str):
    clean = url.replace(".git", "").rstrip("/")
    parts = clean.split("/")
    return parts[-2], parts[-1]

class FileContentUpdate(BaseModel):
    content: str

@router.get("/repos/{repo_id:path}/files/tree")
async def get_repo_file_tree(repo_id: str, request: Request, db = Depends(get_db)):
    tenant_id = request.state.tenant_id
    
    repo = db.query(Repository).filter(
        (Repository.id == repo_id) | (Repository.name == repo_id),
        Repository.tenant_id == tenant_id
    ).first()
    
    if not repo:
        raise HTTPException(status_code=404, detail=f"Repository '{repo_id}' not found")
        
    if repo.url and repo.url.startswith("https://github.com/"):
        github_token = request.headers.get("X-GitHub-Token")
        if not github_token:
            raise HTTPException(status_code=401, detail="GitHub token required for GitHub repositories")
        
        owner, repo_name = extract_github_owner_repo(repo.url)
        # Using 'main' as default branch for now, ideally we should read it from repo settings
        try:
            tree = get_github_tree(owner, repo_name, "main", github_token)
            return tree
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
            
    rm = RepoManager()
    
    # Try tenant-isolated path first
    repo_path = rm.base_dir / tenant_id / repo.name
    if not repo_path.exists():
        # Fallback to root if it was a local unisolated repo or older format
        repo_path = rm.base_dir / repo.name
        
    if not repo_path.exists():
        raise HTTPException(status_code=404, detail="Repository files not found on disk. Did you enable KEEP_CLONED_REPOS=true?")
        
    try:
        tree = rm.get_file_tree(repo_path)
        return tree
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/repos/{repo_id:path}/files/content")
async def get_repo_file_content(repo_id: str, path: str, request: Request, db = Depends(get_db)):
    tenant_id = request.state.tenant_id
    
    repo = db.query(Repository).filter(
        (Repository.id == repo_id) | (Repository.name == repo_id),
        Repository.tenant_id == tenant_id
    ).first()
    
    if not repo:
        raise HTTPException(status_code=404, detail=f"Repository '{repo_id}' not found")
        
    if repo.url and repo.url.startswith("https://github.com/"):
        github_token = request.headers.get("X-GitHub-Token")
        if not github_token:
            raise HTTPException(status_code=401, detail="GitHub token required for GitHub repositories")
            
        owner, repo_name = extract_github_owner_repo(repo.url)
        try:
            content = get_github_file_content(owner, repo_name, path, github_token)
            return {"content": content}
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail="File not found")
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    rm = RepoManager()
    
    repo_path = rm.base_dir / tenant_id / repo.name
    if not repo_path.exists():
        repo_path = rm.base_dir / repo.name
        
    if not repo_path.exists():
        raise HTTPException(status_code=404, detail="Repository files not found on disk.")
        
    try:
        content = rm.read_file(repo_path, path)
        return {"content": content}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/repos/{repo_id:path}/files/content")
async def update_repo_file_content(repo_id: str, path: str, body: FileContentUpdate, request: Request, db = Depends(get_db)):
    tenant_id = request.state.tenant_id
    
    repo = db.query(Repository).filter(
        (Repository.id == repo_id) | (Repository.name == repo_id),
        Repository.tenant_id == tenant_id
    ).first()
    
    if not repo:
        raise HTTPException(status_code=404, detail=f"Repository '{repo_id}' not found")
        
    if repo.url and repo.url.startswith("https://github.com/"):
        github_token = request.headers.get("X-GitHub-Token")
        if not github_token:
            raise HTTPException(status_code=401, detail="GitHub token required for GitHub repositories")
            
        owner, repo_name = extract_github_owner_repo(repo.url)
        message = request.headers.get("X-Commit-Message", "Update file via AI-RepoMind")
        try:
            commit_github_file(owner, repo_name, path, body.content, github_token, message)
            return {"status": "success"}
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    rm = RepoManager()
    
    repo_path = rm.base_dir / tenant_id / repo.name
    if not repo_path.exists():
        repo_path = rm.base_dir / repo.name
        
    if not repo_path.exists():
        raise HTTPException(status_code=404, detail="Repository files not found on disk.")
        
    try:
        rm.write_file(repo_path, path, body.content)
        return {"status": "success"}
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="File not found")
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
