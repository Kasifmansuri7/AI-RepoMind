import os
import sys
import uuid
import json
from dotenv import load_dotenv

# Add backend to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Load the backend/.env file so OpenAI gets the API key
env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env')
load_dotenv(env_path)

from fastapi import FastAPI, Depends, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from backend.api.middleware import TenantAuthMiddleware
from backend.db.postgres import init_db
from backend.api.routers import chat, repos, history

app = FastAPI(title="AI RepoMind API")

# Apply our custom Tenant Auth middleware
app.add_middleware(TenantAuthMiddleware)

# Setup CORS for the Next.js frontend (registered last so it is the outermost middleware)
CLIENT_URL=os.getenv("CLIENT_URL")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[CLIENT_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def on_startup():
    init_db()

app.include_router(chat.router, prefix="/api")
app.include_router(repos.router, prefix="/api")
app.include_router(history.router, prefix="/api")
