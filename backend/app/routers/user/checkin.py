from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.dependencies import get_current_user

router = APIRouter()

@router.post("/checkin")
async def checkin(file: UploadFile = File(...), db: Session = Depends(get_db),
                  current_user: dict = Depends(get_current_user)):
    """POST /user/checkin — 이미지 업로드 + Azure CV 안전 착용 판별."""
    from app.services.cv_service import analyze_safety_image
    from app.services.blob_service import upload_image
    from app.models.check_session import CheckSession

    image_bytes = await file.read()
    image_url = upload_image(image_bytes, file.filename)
    cv_result = analyze_safety_image(image_bytes)

    session = CheckSession(
        user_id=int(current_user["sub"]),
        passed=cv_result.get("passed", False),
        image_url=image_url,
        cv_result=str(cv_result),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session
