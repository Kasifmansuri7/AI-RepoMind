import os
import uuid
from backend.db.client import get_qdrant_client
from backend.db.models import Tenant, Repository
from backend.ingestion.repo_manager import RepoManager
from backend.ingestion.chunker import CodeChunker
from backend.ingestion.embedder import Embedder
from qdrant_client.models import VectorParams, Distance, PointStruct
from backend.constants import COLLECTION_NAME

SUPPORTED_EXTENSIONS = [
    ".py", ".md", ".js", ".ts", ".tsx", ".jsx", ".txt",
    ".java", ".cpp", ".c", ".h", ".cs", ".go", ".rs", ".rb", ".php",
    ".html", ".css", ".json", ".yaml", ".yml", ".toml", ".sh", ".sql"
]

def ingest_repository_generator(source: str, tenant_id: str, db, token: str = None):
    """
    Core business logic for ingesting a repository.
    Yields events so it can be consumed by both CLI and FastAPI SSE streams.
    """
    repo_manager = RepoManager()
    is_remote = source.startswith("http") or source.startswith("git@")
    repo_path = None
    keep_cloned = os.getenv("KEEP_CLONED_REPOS", "false").lower() in ("true", "1")

    try:
        yield {"event": "status", "data": "Cloning repository..."}
        if is_remote:
            repo_path = repo_manager.clone_remote_repo(source, token=token, tenant_id=tenant_id)
        else:
            repo_path = repo_manager.load_local_repo(source)
            
        repo_name = repo_path.name
        repo_id = f"{tenant_id}_{repo_name}"
        
        # Ensure tenant exists (only for demo, in real life they exist via auth)
        tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        if not tenant:
            tenant = Tenant(id=tenant_id, name=f"User {tenant_id}")
            db.add(tenant)
            db.commit()
            
        repo = db.query(Repository).filter(Repository.id == repo_id).first()
        if not repo:
            repo = Repository(id=repo_id, tenant_id=tenant_id, name=repo_name, url=source)
            db.add(repo)
            db.commit()
            
        print(f"Scanning files in {repo_name}...")
        yield {"event": "status", "data": f"Scanning files in {repo_name}..."}
        files = repo_manager.get_files(repo_path, extensions=SUPPORTED_EXTENSIONS)
        
        if len(files) == 0:
            print("No valid files found.")
            if is_remote and repo_path and not keep_cloned:
                repo_manager.cleanup_repo(repo_path)
            yield {"event": "error", "data": "No valid files found."}
            return
            
        print(f"Found {len(files)} files. Initializing models...")
        yield {"event": "status", "data": f"Found {len(files)} files. Initializing models..."}
        chunker = CodeChunker()
        embedder = Embedder()
        
        q_client = get_qdrant_client()
        if not q_client.collection_exists(collection_name=COLLECTION_NAME):
            q_client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=VectorParams(size=1536, distance=Distance.COSINE),
            )
            
        points = []
        total_files = len(files)
        for idx, file_path in enumerate(files):
            print(f"Chunking & embedding {idx + 1}/{total_files}...")
            yield {"event": "status", "data": f"Chunking & embedding {idx + 1}/{total_files}..."}
            chunks = chunker.chunk_file(file_path)
            
            for chunk in chunks:
                embedding = embedder.embed_text(chunk["content"])
                if not embedding:
                    continue
                
                points.append(
                    PointStruct(
                        id=str(uuid.uuid4()),
                        vector=embedding,
                        payload={
                            "tenant_id": tenant_id,
                            "repo_id": repo_id,
                            "repo_name": repo_name,
                            "file_path": chunk["file_path"],
                            "chunk_index": chunk["chunk_index"],
                            "content": chunk["content"]
                        }
                    )
                )
            
            if len(points) >= 50:
                yield {"event": "status", "data": f"Upserting {len(points)} chunks into Qdrant..."}
                q_client.upsert(collection_name=COLLECTION_NAME, points=points)
                points = []
                
        if points:
            yield {"event": "status", "data": f"Upserting final {len(points)} chunks into Qdrant..."}
            q_client.upsert(collection_name=COLLECTION_NAME, points=points)
            
        if is_remote and repo_path and not keep_cloned:
            print(f"Cleaning up temporary cloned files for {repo_name}...")
            yield {"event": "status", "data": "Cleaning up temporary files..."}
            repo_manager.cleanup_repo(repo_path)

        yield {"event": "success", "data": repo_name}
    except Exception as e:
        if is_remote and repo_path and not keep_cloned:
            try:
                repo_manager.cleanup_repo(repo_path)
            except Exception:
                pass
        yield {"event": "error", "data": str(e)}

async def async_ingest_repository_generator(source: str, tenant_id: str, db, token: str = None):
    """Async wrapper for FastAPI EventSourceResponse"""
    for event in ingest_repository_generator(source, tenant_id, db, token=token):
        yield event
