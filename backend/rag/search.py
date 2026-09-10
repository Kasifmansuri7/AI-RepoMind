from qdrant_client import QdrantClient
from qdrant_client.http import models
from backend.ingestion.embedder import Embedder
from backend.constants import COLLECTION_NAME

class CodeSearcher:
    def __init__(self, q_client: QdrantClient, embedder: Embedder, collection_name: str = COLLECTION_NAME):
        self.q_client = q_client
        self.embedder = embedder
        self.collection_name = collection_name
        
    def search(self, query: str, tenant_id: str, repo_name: str = None, limit: int = 5) -> list[dict]:
        """
        Takes a natural language query, embeds it, and returns the top matching code chunks.
        Strictly filters by tenant_id to enforce multi-tenancy.
        """
        # 1. Embed the query
        query_vector = self.embedder.embed_text(query)
        if not query_vector:
            return []
            
        # Mandatory metadata filter for tenant_id
        must_conditions = [
            models.FieldCondition(
                key="tenant_id",
                match=models.MatchValue(value=tenant_id),
            )
        ]
        
        if repo_name:
            must_conditions.append(
                models.FieldCondition(
                    key="repo_name",
                    match=models.MatchValue(value=repo_name),
                )
            )
            
        query_filter = models.Filter(must=must_conditions)
            
        # 2. Search Qdrant
        try:
            search_results = self.q_client.query_points(
                collection_name=self.collection_name,
                query=query_vector,
                query_filter=query_filter,
                limit=limit,
                with_payload=True
            ).points
        except Exception as e:
            print(f"Search failed: {e}")
            return []
        
        # 3. Format results
        results = []
        for hit in search_results:
            results.append({
                "score": hit.score,
                "file_path": hit.payload.get("file_path"),
                "content": hit.payload.get("content"),
                "chunk_index": hit.payload.get("chunk_index")
            })
            
        return results
