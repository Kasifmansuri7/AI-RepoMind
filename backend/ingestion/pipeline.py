import os
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
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

# In-memory cancellation tokens: { tenant_id: True/False }
_active_ingestions: dict[str, bool] = {}


def cancel_ingestion(tenant_id: str):
    """Signal the running ingestion for a tenant to stop."""
    _active_ingestions[tenant_id] = True


def _is_cancelled(tenant_id: str) -> bool:
    return _active_ingestions.get(tenant_id, False)


def _clear_cancellation(tenant_id: str):
    _active_ingestions.pop(tenant_id, None)


def ingest_repository_generator(source: str, tenant_id: str, db, token: str = None, branch: str = None):
    """
    Core business logic for ingesting a repository.
    Yields events so it can be consumed by both CLI and FastAPI SSE streams.
    """
    # Reset any previous cancellation flag for this tenant
    _clear_cancellation(tenant_id)

    repo_manager = RepoManager()
    is_remote = source.startswith("http") or source.startswith("git@")
    repo_path = None
    keep_cloned = os.getenv("KEEP_CLONED_REPOS", "false").lower() in ("true", "1")
    repo_name = None
    repo_id = None
    was_cancelled = False

    try:
        yield {"event": "status", "data": "Downloading repository files..."}
        if is_remote:
            repo_path = repo_manager.clone_remote_repo(source, token=token, tenant_id=tenant_id, branch=branch)
        else:
            repo_path = repo_manager.load_local_repo(source)
            
        repo_name = repo_path.name
        repo_id = f"{tenant_id}_{repo_name}"
        
        if _is_cancelled(tenant_id):
            was_cancelled = True
            yield {"event": "cancelled", "data": "Ingestion cancelled."}
            return

        # Ensure tenant exists
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
        yield {"event": "status", "data": f"Reading {repo_name} files..."}
        files = repo_manager.get_files(repo_path, extensions=SUPPORTED_EXTENSIONS)
        
        if len(files) == 0:
            print("No valid files found.")
            if is_remote and repo_path and not keep_cloned:
                repo_manager.cleanup_repo(repo_path)
            yield {"event": "error", "data": "No valid files found."}
            return
            
        print(f"Found {len(files)} files. Initializing models...")
        yield {"event": "status", "data": f"Found {len(files)} files. Preparing AI models..."}
        chunker = CodeChunker()
        embedder = Embedder()
        
        q_client = get_qdrant_client()
        from qdrant_client.models import SparseVectorParams, SparseVector
        
        if not q_client.collection_exists(collection_name=COLLECTION_NAME):
            q_client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=VectorParams(size=1536, distance=Distance.COSINE),
                sparse_vectors_config={"text-sparse": SparseVectorParams()}
            )
        else:
            try:
                q_client.update_collection(
                    collection_name=COLLECTION_NAME,
                    sparse_vectors_config={"text-sparse": SparseVectorParams()}
                )
            except Exception:
                pass
            
        total_files = len(files)
        BATCH_SIZE = 100      # Accumulate chunks before flushing
        EMBED_SUB_BATCH = 20  # Texts per OpenAI call
        EMBED_WORKERS = 5     # Parallel OpenAI calls
        pending_chunks = []
        
        def flush_chunks():
            if not pending_chunks:
                return
            
            total = len(pending_chunks)
            texts = [c["content"] for c in pending_chunks]
            
            if _is_cancelled(tenant_id):
                pending_chunks.clear()
                return

            yield {"event": "status", "data": f"Analyzing {total} code snippets..."}

            # Build sub-batches
            sub_batches = [
                (start, texts[start:min(start + EMBED_SUB_BATCH, total)])
                for start in range(0, total, EMBED_SUB_BATCH)
            ]

            # Run all sub-batches concurrently for dense
            results: dict[int, list] = {}
            embed_error = None
            with ThreadPoolExecutor(max_workers=EMBED_WORKERS) as executor:
                futures = {
                    executor.submit(embedder.embed_batch, batch): start_idx
                    for start_idx, batch in sub_batches
                }
                for future in as_completed(futures):
                    if _is_cancelled(tenant_id):
                        executor.shutdown(wait=False, cancel_futures=True)
                        pending_chunks.clear()
                        return
                    start_idx = futures[future]
                    try:
                        results[start_idx] = future.result()
                    except Exception as e:
                        embed_error = str(e)
                        print(f"Embed sub-batch at {start_idx} failed: {e}")

            if embed_error:
                yield {"event": "error", "data": f"Failed to embed batch: {embed_error}"}
                return

            # Re-assemble in original order
            all_embeddings = []
            for start_idx, _ in sub_batches:
                all_embeddings.extend(results.get(start_idx, []))
                
            # Now compute sparse embeddings
            yield {"event": "status", "data": f"Extracting keywords from {total} snippets..."}
            sparse_results = []
            for start_idx, batch in sub_batches:
                 sparse_results.extend(embedder.embed_sparse_batch(batch))
            
            if _is_cancelled(tenant_id):
                pending_chunks.clear()
                return
            
            points_to_upsert = []
            for i, chunk in enumerate(pending_chunks):
                if i < len(all_embeddings) and all_embeddings[i]:
                    vecs = {"": all_embeddings[i]}
                    if i < len(sparse_results) and sparse_results[i]:
                        vecs["text-sparse"] = SparseVector(
                            indices=sparse_results[i]["indices"],
                            values=sparse_results[i]["values"]
                        )
                        
                    points_to_upsert.append(
                        PointStruct(
                            id=str(uuid.uuid4()),
                            vector=vecs,
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
            
            if points_to_upsert:
                yield {"event": "status", "data": f"Saving {len(points_to_upsert)} snippets to database..."}
                q_client.upsert(collection_name=COLLECTION_NAME, points=points_to_upsert)
            
            pending_chunks.clear()

        for idx, file_path in enumerate(files):
            if _is_cancelled(tenant_id):
                was_cancelled = True
                break
                
            if idx % 10 == 0 or idx == total_files - 1:
                yield {"event": "status", "data": f"Processing file {idx + 1}/{total_files}..."}
                
            chunks = chunker.chunk_file(file_path)
            pending_chunks.extend(chunks)
            
            if len(pending_chunks) >= BATCH_SIZE:
                yield from flush_chunks()
                if _is_cancelled(tenant_id):
                    was_cancelled = True
                    break
                
        if not was_cancelled and pending_chunks:
            yield from flush_chunks()
            if _is_cancelled(tenant_id):
                was_cancelled = True
        
        if was_cancelled:
            yield {"event": "cancelled", "data": "Ingestion cancelled."}
            return
            
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
    finally:
        # On cancellation, clean up partial data
        if was_cancelled:
            print(f"[Cancel] Cleaning up partial ingestion for tenant={tenant_id}")
            _cleanup_partial_ingestion(tenant_id, repo_id, repo_name, repo_path, db, is_remote, keep_cloned, repo_manager)
        _clear_cancellation(tenant_id)


def _cleanup_partial_ingestion(tenant_id, repo_id, repo_name, repo_path, db, is_remote, keep_cloned, repo_manager):
    """Remove partial DB records, Qdrant points, and cloned files on cancellation."""
    # 1. Remove Qdrant points
    if repo_name:
        try:
            from qdrant_client.models import FilterSelector, Filter, FieldCondition, MatchValue
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
                print(f"[Cancel] Cleaned Qdrant points for {repo_name}")
        except Exception as e:
            print(f"[Cancel] Failed to clean Qdrant: {e}")
    
    # 2. Remove partial DB record
    if repo_id:
        try:
            repo = db.query(Repository).filter(Repository.id == repo_id).first()
            if repo:
                db.delete(repo)
                db.commit()
                print(f"[Cancel] Removed DB record for {repo_id}")
        except Exception as e:
            db.rollback()
            print(f"[Cancel] Failed to clean DB: {e}")
    
    # 3. Remove cloned files
    if is_remote and repo_path and not keep_cloned:
        try:
            repo_manager.cleanup_repo(repo_path)
            print(f"[Cancel] Cleaned repo files at {repo_path}")
        except Exception as e:
            print(f"[Cancel] Failed to clean files: {e}")


async def async_ingest_repository_generator(source: str, tenant_id: str, db, token: str = None, branch: str = None):
    """Async wrapper for FastAPI EventSourceResponse"""
    for event in ingest_repository_generator(source, tenant_id, db, token=token, branch=branch):
        yield event
