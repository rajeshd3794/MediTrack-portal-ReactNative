import os
from fastapi import Request, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv

load_dotenv()

security = HTTPBearer()
API_KEY = os.getenv("MEDITRACK_API_KEY", "mtk_live_48f98c8dfa42k3jds8dj23kx1")

def verify_api_key(credentials: HTTPAuthorizationCredentials = Security(security)):
    if credentials.scheme != "Bearer":
        raise HTTPException(status_code=401, detail="Invalid authentication scheme.")
    if credentials.credentials != API_KEY:
        raise HTTPException(status_code=403, detail="Invalid or expired API key.")
    return credentials.credentials
