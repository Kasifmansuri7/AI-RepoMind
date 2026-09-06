import os
from qdrant_client import QdrantClient
from dotenv import load_dotenv

load_dotenv()

QDRANT_URL = os.getenv("QDRANT_URL", "http://localhost:6333")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")

# We use a global client instance
client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY)

def get_qdrant_client() -> QdrantClient:
    """Returns the configured Qdrant client."""
    return client
