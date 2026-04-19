from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from typing import Dict, Any, List
from core.database import supabase
from core.security import verify_api_key

router = APIRouter(
    prefix="/api/v1/doctors",
    tags=["Doctors"],
    dependencies=[Depends(verify_api_key)]
)

@router.post("/")
async def create_doctor(data: Dict[str, Any]):
    try:
        response = supabase.table("doctors").insert(data).execute()
        return JSONResponse(content={"success": True, "message": "Doctor created successfully.", "data": response.data})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/")
async def get_all_doctors():
    try:
        response = supabase.table("doctors").select("*").order("timestamp", desc=True).execute()
        return JSONResponse(content={"success": True, "data": response.data})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{doc_id}")
async def update_doctor(doc_id: str, data: Dict[str, Any]):
    try:
        response = supabase.table("doctors").update(data).or_(f"id.eq.{doc_id},username.eq.{doc_id}").execute()
        return JSONResponse(content={"success": True, "message": "Doctor updated successfully."})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{doc_id}")
async def delete_doctor(doc_id: str):
    try:
        response = supabase.table("doctors").delete().or_(f"id.eq.{doc_id},username.eq.{doc_id}").execute()
        return JSONResponse(content={"success": True, "message": "Doctor deleted successfully."})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
