"""
정규직 사원 관리 라우터.

엔드포인트:
- GET    /admin/employees            — 정규직 사원 목록 (오늘 체크인 상태 포함)
- POST   /admin/employees            — 정규직 사원 등록
- PUT    /admin/employees/{id}       — 정규직 사원 수정 (언어, 그룹)
- DELETE /admin/employees/{id}       — 정규직 사원 삭제
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import get_current_admin
from app.models.admin import Admin
from app.models.check_session import CheckSession
from app.models.employee import Employee
from app.models.group import Group
from app.schemas.employee import EmployeeCreate, EmployeeResponse, EmployeeUpdate

router = APIRouter(prefix="/admin/employees", tags=["정규직 관리"])


def _get_today_checkin_map(db: Session, employee_ids: list[int]) -> dict[int, str]:
    """오늘 날짜 기준 사원별 최종 체크인 상태를 dict로 반환."""
    if not employee_ids:
        return {}
    today = date.today()
    sessions = (
        db.query(CheckSession)
        .filter(
            CheckSession.employee_id.in_(employee_ids),
            CheckSession.date == today,
        )
        .order_by(CheckSession.checked_at.desc())
        .all()
    )
    # 사원별 최신 세션의 status를 사용
    result = {}
    for s in sessions:
        if s.employee_id not in result:
            result[s.employee_id] = s.status
    return result


@router.get("", response_model=list[EmployeeResponse])
def list_employees(admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    """GET /admin/employees — 관리자 소속 그룹의 정규직 사원 목록 (오늘 체크인 상태 포함)."""
    admin_group_ids = [g.id for g in db.query(Group).filter(Group.admin_id == admin.id).all()]
    group_map = {g.id: g.name for g in db.query(Group).filter(Group.id.in_(admin_group_ids)).all()}

    # 관리자 소속 그룹 사원 + 미배정 사원 모두 조회
    employees = (
        db.query(Employee)
        .filter(or_(Employee.group_id.in_(admin_group_ids), Employee.group_id.is_(None)))
        .order_by(Employee.emp_no)
        .all()
    )

    checkin_map = _get_today_checkin_map(db, [e.id for e in employees])

    return [
        EmployeeResponse(
            id=e.id,
            emp_no=e.emp_no,
            language=e.language,
            group_id=e.group_id,
            group_name=group_map.get(e.group_id, ""),
            checkin_status=checkin_map.get(e.id),
            created_at=e.created_at,
        )
        for e in employees
    ]


@router.post("", response_model=EmployeeResponse, status_code=status.HTTP_201_CREATED)
def create_employee(body: EmployeeCreate, admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    """POST /admin/employees — 정규직 사원 등록."""
    # 사원번호 중복 확인
    exists = db.query(Employee).filter(Employee.emp_no == body.emp_no).first()
    if exists:
        raise HTTPException(status_code=409, detail="이미 등록된 사원번호입니다")

    # 그룹 권한 확인
    group = None
    if body.group_id:
        group = db.query(Group).filter(Group.id == body.group_id, Group.admin_id == admin.id).first()
        if not group:
            raise HTTPException(status_code=403, detail="해당 그룹에 접근 권한이 없습니다")

    emp = Employee(emp_no=body.emp_no, language=body.language, group_id=body.group_id)
    db.add(emp)
    db.commit()
    db.refresh(emp)

    return EmployeeResponse(
        id=emp.id,
        emp_no=emp.emp_no,
        language=emp.language,
        group_id=emp.group_id,
        group_name=group.name if group else "",
        checkin_status=None,
        created_at=emp.created_at,
    )


@router.put("/{employee_id}", response_model=EmployeeResponse)
def update_employee(employee_id: int, body: EmployeeUpdate, admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    """PUT /admin/employees/{id} — 정규직 사원 수정 (언어, 그룹)."""
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="사원을 찾을 수 없습니다")

    # 현재 그룹 접근 권한 확인
    if emp.group_id:
        group = db.query(Group).filter(Group.id == emp.group_id, Group.admin_id == admin.id).first()
        if not group:
            raise HTTPException(status_code=403, detail="해당 사원에 접근 권한이 없습니다")

    if body.language is not None:
        emp.language = body.language
    if body.group_id is not None:
        new_group = db.query(Group).filter(Group.id == body.group_id, Group.admin_id == admin.id).first()
        if not new_group:
            raise HTTPException(status_code=403, detail="대상 그룹에 접근 권한이 없습니다")
        emp.group_id = body.group_id

    db.commit()
    db.refresh(emp)

    group_name = ""
    if emp.group_id:
        g = db.query(Group).filter(Group.id == emp.group_id).first()
        group_name = g.name if g else ""

    checkin_map = _get_today_checkin_map(db, [emp.id])

    return EmployeeResponse(
        id=emp.id,
        emp_no=emp.emp_no,
        language=emp.language,
        group_id=emp.group_id,
        group_name=group_name,
        checkin_status=checkin_map.get(emp.id),
        created_at=emp.created_at,
    )


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_employee(employee_id: int, admin: Admin = Depends(get_current_admin), db: Session = Depends(get_db)):
    """DELETE /admin/employees/{id} — 정규직 사원 삭제."""
    emp = db.query(Employee).filter(Employee.id == employee_id).first()
    if not emp:
        raise HTTPException(status_code=404, detail="사원을 찾을 수 없습니다")
    if emp.group_id:
        group = db.query(Group).filter(Group.id == emp.group_id, Group.admin_id == admin.id).first()
        if not group:
            raise HTTPException(status_code=403, detail="해당 사원에 접근 권한이 없습니다")
    db.delete(emp)
    db.commit()
