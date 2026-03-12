import pandas as pd
import io
from sqlalchemy.orm import Session

def import_users_from_excel(db: Session, content: bytes) -> dict:
    """엑셀 파일에서 작업자 일괄 등록.
    컬럼: system_id, name, group_id(optional)
    """
    from app.models.user import User
    df = pd.read_excel(io.BytesIO(content))
    created = 0
    for _, row in df.iterrows():
        user = User(
            system_id=str(row["system_id"]),
            name=str(row["name"]),
            group_id=int(row["group_id"]) if "group_id" in row and pd.notna(row["group_id"]) else None,
        )
        db.add(user)
        created += 1
    db.commit()
    return {"imported": created}
