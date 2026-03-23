"""
보고서 서비스.
Azure OpenAI를 사용하여 안전 점검 통계 기반 보고서를 자동 생성한다.
"""

import json
import logging
from pathlib import Path
from datetime import date

from openai import AzureOpenAI
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.report import Report
from app.services.stats_service import get_stats_for_period

logger = logging.getLogger(__name__)


def _get_openai_client() -> AzureOpenAI:
    """Azure OpenAI 클라이언트를 생성한다."""
    settings = get_settings()
    return AzureOpenAI(
        azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
        api_key=settings.AZURE_OPENAI_KEY,
        api_version="2024-08-01-preview",
    )


def generate_report(
    db: Session, admin_id: int, period_type: str, period_from: date, period_to: date
) -> Report:
    """
    지정된 기간의 통계 데이터를 수집하고 LLM으로 보고서를 생성한다.

    흐름:
    1. 보고서 레코드를 processing 상태로 생성
    2. stats_service에서 해당 기간 통계를 조회
    3. Azure OpenAI에 요청하여 보고서 생성
    4. 상태를 done으로 업데이트

    Args:
        db: DB 세션
        admin_id: 요청 관리자 ID
        period_type: 기간 유형
        period_from: 기간 시작일
        period_to: 기간 종료일

    Returns:
        Report: 생성된 보고서 ORM 객체
    """
    # 보고서 레코드 생성 (processing 상태)
    report = Report(
        admin_id=admin_id,
        period_type=period_type,
        period_from=period_from,
        period_to=period_to,
        status="processing",
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    try:
        # 통계 데이터 수집
        stats_data = get_stats_for_period(db, period_from, period_to)
        stats_json = json.dumps(stats_data, ensure_ascii=False, indent=2)

        settings = get_settings()

        # LLM 보고서 생성
        if settings.AZURE_OPENAI_KEY:
            content = _generate_llm_report(stats_json, period_type, period_from, period_to)
        else:
            logger.warning("Azure OpenAI 키 미설정 — 기본 보고서 생성")
            content = _generate_fallback_report(stats_data, period_type, period_from, period_to)

        report.content = content
        report.status = "done"

    except Exception as e:
        logger.error(f"보고서 생성 실패: {e}")
        report.content = f"보고서 생성 중 오류: {str(e)}"
        report.status = "error"

    db.commit()
    db.refresh(report)
    return report


def _generate_llm_report(
    stats_json: str, period_type: str, period_from: date, period_to: date
) -> str:
    settings = get_settings()

    # 🚀 1. 프롬프트 파일들이 있는 디렉토리 경로
    prompts_dir = Path(__file__).parent.parent / "prompts"
    
    # 🚀 2. 시스템 프롬프트 읽기
    try:
        with open(prompts_dir / "report_system.md", "r", encoding="utf-8") as f:
            system_prompt = f.read()
    except FileNotFoundError:
        logger.error("system_prompt.md 파일을 찾을 수 없습니다.")
        return "시스템 프롬프트 파일 누락으로 보고서를 생성할 수 없습니다."

    # 🚀 3. 유저 프롬프트(템플릿) 읽기
    try:
        with open(prompts_dir / "report_user.md", "r", encoding="utf-8") as f:
            user_prompt_template = f.read()
    except FileNotFoundError:
        logger.error("report_prompt.md 파일을 찾을 수 없습니다.")
        return "유저 프롬프트 파일 누락으로 보고서를 생성할 수 없습니다."

    # 🚀 4. 유저 프롬프트에 변수 채워넣기
    user_prompt = user_prompt_template.format(
        period_from=period_from,
        period_to=period_to,
        stats_json=stats_json
    )

    # 🚀 5. LLM API 호출 (코드가 정말 깔끔해집니다!)
    try:
        client = _get_openai_client()
        response = client.chat.completions.create(
            model=settings.AZURE_OPENAI_DEPLOYMENT,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.3,
            max_tokens=2500,
        )
        return response.choices[0].message.content
    except Exception as e:
        logger.error(f"LLM 보고서 생성 실패: {e}")
        return f"보고서 생성 중 오류가 발생했습니다: {str(e)}"


def _generate_fallback_report(
    stats_data: dict, period_type: str, period_from: date, period_to: date
) -> str:
    """LLM 없이 기본 보고서를 생성한다."""
    period_label = {"daily": "일간", "weekly": "주간", "monthly": "월간"}.get(
        period_type, period_type
    )
    total = stats_data.get("total_checks", 0)
    passed = stats_data.get("total_passed", 0)
    failed = stats_data.get("total_failed", 0)
    rate = stats_data.get("pass_rate", 0)

    return (
        f"# {period_label} 안전 점검 보고서\n"
        f"## 기간: {period_from} ~ {period_to}\n\n"
        f"## 요약\n"
        f"- 총 체크인: {total}건\n"
        f"- 통과: {passed}건 / 실패: {failed}건\n"
        f"- 통과율: {rate}%\n\n"
        f"*Azure OpenAI 키가 설정되지 않아 기본 보고서로 생성되었습니다.*"
    )
