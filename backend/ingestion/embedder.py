import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

# We only initialize the client if the API key is present
api_key = os.getenv("OPENAI_API_KEY")
client = OpenAI(api_key=api_key) if api_key else None

try:
    from fastembed import SparseTextEmbedding
    sparse_model = SparseTextEmbedding(model_name="Qdrant/bm25")
except ImportError:
    sparse_model = None

class Embedder:
    def __init__(self, model: str = "text-embedding-3-small"):
        self.model = model
        
    def embed_text(self, text: str) -> list[float]:
        """Generate embeddings for a single text string."""
        if not client:
            raise ValueError("OpenAI client not initialized. Check your OPENAI_API_KEY.")
            
        if not text.strip():
            return []
            
        response = client.embeddings.create(
            input=text,
            model=self.model
        )
        return response.data[0].embedding
        
    def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a batch of text strings."""
        if not client:
            raise ValueError("OpenAI client not initialized. Check your OPENAI_API_KEY.")
            
        # Filter out empty strings to avoid OpenAI API errors
        valid_texts = [t for t in texts if t.strip()]
        if not valid_texts:
            return []
            
        response = client.embeddings.create(
            input=valid_texts,
            model=self.model
        )
        return [data.embedding for data in response.data]

    def embed_sparse_batch(self, texts: list[str]) -> list[dict]:
        """Generate sparse embeddings for a batch of texts."""
        if not sparse_model:
            print("fastembed not installed or model failed to load.")
            return []
            
        valid_texts = [t for t in texts if t.strip()]
        if not valid_texts:
            return []
            
        embeddings = list(sparse_model.embed(valid_texts))
        return [{"indices": e.indices.tolist(), "values": e.values.tolist()} for e in embeddings]
