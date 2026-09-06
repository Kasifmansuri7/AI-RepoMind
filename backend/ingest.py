import os
import sys
import argparse

# Add backend to path if running from root
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.db.postgres import init_db, SessionLocal
from backend.ingestion.pipeline import ingest_repository_generator

def main():
    parser = argparse.ArgumentParser(description="Ingest a repository into Qdrant.")
    parser.add_argument("source", help="Local path or git URL")
    parser.add_argument("--tenant-id", required=True, help="ID of the tenant/user")
    args = parser.parse_args()
        
    print("Initializing Postgres...")
    init_db()
    db = SessionLocal()
    
    # Consume the shared pipeline generator
    for event in ingest_repository_generator(args.source, args.tenant_id, db):
        if event["event"] == "status":
            print(f"[STATUS] {event['data']}")
        elif event["event"] == "success":
            print(f"[SUCCESS] Successfully ingested: {event['data']}")
        elif event["event"] == "error":
            print(f"[ERROR] {event['data']}")
            break

    db.close()

if __name__ == "__main__":
    main()
