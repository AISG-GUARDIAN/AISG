from sqlalchemy.orm import Session
from app.core.config import settings
from app.services.stats_service import get_statistics

def generate_report(db: Session, period: str):
    """Azure OpenAI로 안전 점검 보고서 생성 (BackgroundTasks)."""
    from app.models.report import Report
    from openai import AzureOpenAI

    stats = get_statistics(db, period)
    client = AzureOpenAI(
        azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
        api_key=settings.AZURE_OPENAI_KEY,
        api_version="2024-02-01",
    )
    response = client.chat.completions.create(
        model=settings.AZURE_OPENAI_DEPLOYMENT,
        messages=[
            {"role": "system", "content": "당신은 산업안전 전문가입니다. 안전 점검 보고서를 작성해 주세요."},
            {"role": "user", "content": f"다음 통계를 바탕으로 {period} 보고서를 작성하세요:\n{stats}"},
        ],
    )
    content = response.choices[0].message.content
    report = Report(period=period, content=content)
    db.add(report)
    db.commit()
