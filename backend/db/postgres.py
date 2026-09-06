import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
from .models import Base

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL", 
    "postgresql://postgres:5660@localhost:5432/postgres"
)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def init_db():
    """Creates all tables if they don't exist yet."""
    Base.metadata.create_all(bind=engine)

def get_db():
    """Generator for database sessions."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
