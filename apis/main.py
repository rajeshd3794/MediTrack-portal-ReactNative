from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import os

from patients.router import router as patients_router
from doctors.router import router as doctors_router
from appointments.router import router as appointments_router

app = FastAPI(
    title="Meditrack Portal APIs",
    description="3-Tier Backend API for Meditrack utilizing Python/FastAPI",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "Bypass-Tunnel-Reminder"],
    expose_headers=["*"],
)

@app.get("/api/v1/health")
async def health_check():
    return {"status": "OK", "message": "Meditrack FastAPI Backend is running."}

# Include routers
app.include_router(patients_router)
app.include_router(doctors_router)
app.include_router(appointments_router)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
