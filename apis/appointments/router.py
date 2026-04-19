from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from typing import Dict, Any, List
from core.database import supabase
from core.security import verify_api_key

router = APIRouter(
    prefix="/api/v1/appointments",
    tags=["Appointments"],
    dependencies=[Depends(verify_api_key)]
)

@router.get("/")
async def get_all_appointments():
    try:
        # Try fetching with joined patients data first
        try:
            response = supabase.table("appointments").select("*, patients(name, username, condition)").order("appointment_date").execute()
            if response.data:
                return JSONResponse(content={"success": True, "data": response.data})
        except Exception:
            pass
            
        # Fallback to simple select if join fails
        response = supabase.table("appointments").select("*").order("appointment_date").execute()
        return JSONResponse(content={"success": True, "data": response.data})
    except Exception as e:
        print(f"DEBUG: get_all_appointments error: {str(e)}")
        return JSONResponse(status_code=500, content={"success": False, "error": str(e)})

@router.post("/")
async def create_appointment(data: Dict[str, Any]):
    try:
        # Default status logic 
        if "status" not in data:
            data["status"] = "Pending"
        
        response = supabase.table("appointments").insert(data).execute()
        return JSONResponse(content={"success": True, "message": "Appointment created successfully."})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/doctor/{doc_id}")
async def get_doctor_appointments(doc_id: str):
    try:
        # Try with join first
        try:
            response = supabase.table("appointments").select("*, patients(name, username, condition)").eq("doctor_id", doc_id).order("appointment_date").execute()
            if response.data:
                return JSONResponse(content={"success": True, "data": response.data})
        except Exception:
            pass

        # Fallback
        response = supabase.table("appointments").select("*").eq("doctor_id", doc_id).order("appointment_date").execute()
        return JSONResponse(content={"success": True, "data": response.data})
    except Exception as e:
        print(f"DEBUG: get_doctor_appointments error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{appt_id}/status")
async def update_appointment_status(appt_id: str, data: Dict[str, Any]):
    try:
        status = data.get("status")
        if not status:
            raise HTTPException(status_code=400, detail="Status field is required")
        
        response = supabase.table("appointments").update({"status": status}).eq("id", appt_id).execute()
        return JSONResponse(content={"success": True, "message": f"Appointment marked as {status}."})
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{appt_id}")
async def update_appointment(appt_id: str, data: Dict[str, Any]):
    try:
        # Only allow updating specific fields
        update_data = {}
        if "appointment_date" in data:
            update_data["appointment_date"] = data["appointment_date"]
        if "status" in data:
            update_data["status"] = data["status"]
            
        if not update_data:
            raise HTTPException(status_code=400, detail="No valid fields provided for update")
            
        response = supabase.table("appointments").update(update_data).eq("id", appt_id).execute()
        return JSONResponse(content={"success": True, "message": "Appointment updated successfully."})
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{appt_id}")
async def delete_appointment(appt_id: str):
    try:
        response = supabase.table("appointments").delete().eq("id", appt_id).execute()
        return JSONResponse(content={"success": True, "message": "Appointment deleted successfully."})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
