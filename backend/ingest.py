import os
import sys
import argparse
from pathlib import Path

# Add backend to path if running from root
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.db.client import get_qdrant_client
from backend.db.postgres import init_db, SessionLocal
from backend.db.models import Tenant, Repository
from backend.ingestion.repo_manager import RepoManager
from backend.ingestion.chunker import CodeChunker
from backend.ingestion.embedder import Embedder
from qdrant_client.models import VectorParams, Distance, PointStruct
import uuid

# Define the Qdrant collection name
COLLECTION_NAME = "codebase_chunks"

def main():
    parser = argparse.ArgumentParser(description="Ingest a repository into Qdrant.")
    parser.add_argument("source", help="Local path or git URL")
    parser.add_argument("--tenant-id", required=True, help="ID of the tenant/user")
    args = parser.parse_args()
        
    source = args.source
    tenant_id = args.tenant_id
    
    # 1. Database Setup
    print("Initializing Postgres...")
    init_db()
    db = SessionLocal()
    
    # Ensure Tenant exists
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        print(f"Creating new tenant: {tenant_id}")
        tenant = Tenant(id=tenant_id, name=f"Tenant {tenant_id}")
        db.add(tenant)
        db.commit()
    
    # 2. Acquire Repo
    repo_manager = RepoManager()
    if source.startswith("http") or source.startswith("git@"):
        repo_path = repo_manager.clone_remote_repo(source)
    else:
        repo_path = repo_manager.load_local_repo(source)
        
    repo_name = repo_path.name
    repo_id = f"{tenant_id}_{repo_name}"
    
    # Ensure Repository exists
    repo = db.query(Repository).filter(Repository.id == repo_id).first()
    if not repo:
        print(f"Registering repository {repo_name} for tenant {tenant_id}...")
        repo = Repository(id=repo_id, tenant_id=tenant_id, name=repo_name, url=source)
        db.add(repo)
        db.commit()
        
    print(f"Processing repository at: {repo_path} (Name: {repo_name})")
    
    # 3. Get Files
    files = repo_manager.get_files(repo_path, extensions=[".py", ".md", ".js", ".ts", ".tsx", ".jsx", ".txt"])
    print(f"Found {len(files)} files to process.")
    
    if len(files) == 0:
        print("No valid files found.")
        return

    # 4. Initialize Chunker and Embedder
    chunker = CodeChunker()
    try:
        embedder = Embedder()
    except ValueError as e:
        print(f"Setup Error: {e}")
        return
    
    # 5. Initialize Qdrant Collection
    q_client = get_qdrant_client()
    if not q_client.collection_exists(collection_name=COLLECTION_NAME):
        q_client.create_collection(
            collection_name=COLLECTION_NAME,
            vectors_config=VectorParams(size=1536, distance=Distance.COSINE),
        )
        print(f"Created Qdrant collection: {COLLECTION_NAME}")
        
    # 6. Process files, chunk, embed, and store
    points = []
    
    for file_path in files:
        print(f"Processing: {file_path}")
        chunks = chunker.chunk_file(file_path)
        
        for chunk in chunks:
            try:
                embedding = embedder.embed_text(chunk["content"])
                if not embedding:
                    continue
                    
                # Create a point for Qdrant
                point_id = str(uuid.uuid4())
                points.append(
                    PointStruct(
                        id=point_id,
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
            except Exception as e:
                print(f"Error embedding chunk from {file_path}: {e}")
                
        # Batch insert to avoid holding too much in memory
        if len(points) >= 50:
            print(f"Upserting {len(points)} chunks into Qdrant...")
            q_client.upsert(
                collection_name=COLLECTION_NAME,
                points=points
            )
            points = []
            
    # Insert any remaining
    if points:
        print(f"Upserting final {len(points)} chunks into Qdrant...")
        q_client.upsert(
            collection_name=COLLECTION_NAME,
            points=points
        )
        
    print("Ingestion complete!")
    db.close()

if __name__ == "__main__":
    main()
