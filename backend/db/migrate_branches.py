import os
from sqlalchemy import text
from backend.db.postgres import engine

def migrate():
    with engine.begin() as conn:
        print("Adding parent_session_id to chat_sessions...")
        try:
            conn.execute(text("ALTER TABLE chat_sessions ADD COLUMN parent_session_id VARCHAR references chat_sessions(id)"))
            print("Successfully added parent_session_id.")
        except Exception as e:
            print(f"Column parent_session_id might already exist or error: {e}")
            
        print("Adding forked_from_message_id to chat_sessions...")
        try:
            conn.execute(text("ALTER TABLE chat_sessions ADD COLUMN forked_from_message_id VARCHAR"))
            print("Successfully added forked_from_message_id.")
        except Exception as e:
            print(f"Column forked_from_message_id might already exist or error: {e}")

if __name__ == "__main__":
    migrate()
