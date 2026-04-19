from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from typing import Dict, Any, List
from core.database import supabase
from core.security import verify_api_key

router = APIRouter(
    prefix="/api/v1/patients",
    tags=["Patients"],
    dependencies=[Depends(verify_api_key)]
)

@router.post("/")
async def create_patient(data: Dict[str, Any]):
    try:
        response = supabase.table("patients").insert(data).execute()
        return JSONResponse(content={"success": True, "message": "Patient created successfully.", "data": response.data})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/")
async def get_all_patients():
    try:
        response = supabase.table("patients").select("*").order("timestamp", desc=True).execute()
        return JSONResponse(content={"success": True, "data": response.data})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{patient_id}")
async def get_patient_by_id(patient_id: str):
    try:
        response = supabase.table("patients").select("*").or_(f"id.eq.{patient_id},username.eq.{patient_id}").execute()
        if not response.data:
            raise HTTPException(status_code=404, detail="Patient not found")
        return JSONResponse(content={"success": True, "data": response.data[0]})
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{patient_id}")
async def update_patient(patient_id: str, data: Dict[str, Any]):
    try:
        response = supabase.table("patients").update(data).or_(f"id.eq.{patient_id},username.eq.{patient_id}").execute()
        return JSONResponse(content={"success": True, "message": "Patient updated successfully."})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{patient_id}")
async def delete_patient(patient_id: str):
    try:
        response = supabase.table("patients").delete().or_(f"id.eq.{patient_id},username.eq.{patient_id}").execute()
        return JSONResponse(content={"success": True, "message": "Patient deleted successfully."})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
