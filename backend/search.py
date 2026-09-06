import os
import sys
import argparse

# Add backend to path if running from root
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.db.client import get_qdrant_client
from backend.ingestion.embedder import Embedder
from backend.rag.search import CodeSearcher

def main():
    parser = argparse.ArgumentParser(description="Search the Qdrant codebase chunks.")
    parser.add_argument("query", help="Your search query")
    parser.add_argument("--tenant-id", required=True, help="ID of the tenant/user")
    parser.add_argument("--repo-name", required=False, help="Optional repo name to filter by")
    args = parser.parse_args()
    
    query = args.query
    tenant_id = args.tenant_id
    repo_name = args.repo_name
    
    try:
        q_client = get_qdrant_client()
        embedder = Embedder()
        searcher = CodeSearcher(q_client=q_client, embedder=embedder)
        
        if repo_name:
            print(f"Searching for: '{query}' in repo '{repo_name}' for tenant '{tenant_id}'...\n")
        else:
            print(f"Searching for: '{query}' across all repos for tenant '{tenant_id}'...\n")
            
        results = searcher.search(query, tenant_id=tenant_id, repo_name=repo_name, limit=3)
        
        if not results:
            print("No results found or collection is empty for this tenant.")
            return
            
        for i, res in enumerate(results, 1):
            print(f"--- Result {i} (Score: {res['score']:.3f}) ---")
            print(f"File: {res['file_path']}")
            print("-" * 40)
            
            content = res['content']
            if len(content) > 500:
                print(content[:500] + "\n...[truncated]")
            else:
                print(content)
            print("\n")
            
    except Exception as e:
        print(f"Error during search: {e}")

if __name__ == "__main__":
    main()
