import os
import jwt
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from dotenv import load_dotenv

load_dotenv()
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")

class TenantAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Exclude OPTIONS for CORS
        if request.method == "OPTIONS":
            return await call_next(request)
            
        auth_header = request.headers.get("Authorization")
        
        if not auth_header or not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=401,
                content={"detail": "Missing or invalid Authorization header. Expected Bearer token."}
            )
            
        token = auth_header.split(" ")[1]
        
        try:
            if not SUPABASE_JWT_SECRET or SUPABASE_JWT_SECRET == "your_supabase_jwt_secret_here":
                raise ValueError("SUPABASE_JWT_SECRET is not configured properly in backend/.env")
                
            payload = jwt.decode(
                token, 
                SUPABASE_JWT_SECRET, 
                algorithms=["HS256"], 
                options={"verify_aud": False}
            )
            
            tenant_id = payload.get("sub")
            if not tenant_id:
                raise ValueError("Token missing 'sub' claim")
                
        except jwt.ExpiredSignatureError:
            return JSONResponse(status_code=401, content={"detail": "Token expired"})
        except Exception as e:
            return JSONResponse(status_code=401, content={"detail": f"Invalid token: {str(e)}"})
            
        request.state.tenant_id = tenant_id
        
        response = await call_next(request)
        return response
