import os
import jwt
from jwt import PyJWKClient
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from dotenv import load_dotenv

load_dotenv()

SUPABASE_PROJECT_ID = os.getenv("SUPABASE_PROJECT_ID")  # e.g. https://xxxx.supabase.co
JWKS_URL = f"https://{SUPABASE_PROJECT_ID}.supabase.co/auth/v1/.well-known/jwks.json"

# PyJWKClient caches keys internally and refreshes on unknown kid
_jwk_client = PyJWKClient(JWKS_URL) if JWKS_URL else None

ASYMMETRIC_ALGS = {"RS256", "RS384", "RS512", "ES256", "ES384", "ES512", "PS256", "PS384", "PS512"}


class TenantAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)

        if request.url.path in ["/docs", "/redoc", "/openapi.json", "/", "/health"]:
            return await call_next(request)

        auth_header = request.headers.get("Authorization")

        if not auth_header or not auth_header.startswith("Bearer "):
            return JSONResponse(
                status_code=401,
                content={"detail": "Missing or invalid Authorization header. Expected Bearer token."}
            )

        token = auth_header.split(" ")[1]
        jwt_secret = os.getenv("SUPABASE_JWT_SECRET")

        try:
            try:
                unverified_header = jwt.get_unverified_header(token)
                alg = unverified_header.get("alg", "HS256")
            except Exception:
                alg = "HS256"

            payload = None

            if alg in ASYMMETRIC_ALGS:
                if not _jwk_client:
                    raise ValueError("SUPABASE_URL is not configured; cannot fetch JWKS for asymmetric verification")

                signing_key = _jwk_client.get_signing_key_from_jwt(token)
                payload = jwt.decode(
                    token,
                    signing_key.key,
                    algorithms=[alg],
                    options={"verify_aud": False},
                )
            else:
                if not jwt_secret or jwt_secret == "your_supabase_jwt_secret_here":
                    raise ValueError("SUPABASE_JWT_SECRET is not configured properly in backend/.env")

                payload = jwt.decode(
                    token,
                    jwt_secret,
                    algorithms=[alg, "HS256", "HS384", "HS512"],
                    options={"verify_aud": False},
                )

            tenant_id = payload.get("sub")
            if not tenant_id:
                raise ValueError("Token missing 'sub' claim")

        except jwt.ExpiredSignatureError:
            print(f"[TenantAuthMiddleware] Token expired for {request.url.path}")
            return JSONResponse(status_code=401, content={"detail": "Token expired"})
        except Exception as e:
            print(f"[TenantAuthMiddleware] Auth error for {request.url.path}: {str(e)}")
            return JSONResponse(status_code=401, content={"detail": f"Invalid token: {str(e)}"})

        request.state.tenant_id = tenant_id

        response = await call_next(request)
        return response