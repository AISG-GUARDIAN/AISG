"""
컴퓨터 비전 서비스.
Azure AI Vision API를 호출하여 안전모/안전조끼 착용 여부를 판별한다.
개별 항목(helmet/vest) 각각의 pass/fail과 전체 신뢰도를 반환한다.
"""

import json
import logging

from azure.ai.vision.imageanalysis import ImageAnalysisClient
from azure.ai.vision.imageanalysis.models import VisualFeatures
from azure.core.credentials import AzureKeyCredential

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# 안전모 관련 키워드
HELMET_KEYWORDS = [
    "hard hat", "helmet", "safety helmet", "construction helmet",
    "protective helmet", "head protection",
]

# 안전조끼 관련 키워드
VEST_KEYWORDS = [
    "safety vest", "high visibility vest", "reflective vest",
    "hi-vis vest", "fluorescent vest", "visibility jacket",
]


def _get_vision_client() -> ImageAnalysisClient:
    """Azure AI Vision 클라이언트를 생성한다."""
    settings = get_settings()
    return ImageAnalysisClient(
        endpoint=settings.AZURE_VISION_ENDPOINT,
        credential=AzureKeyCredential(settings.AZURE_VISION_KEY),
    )


def analyze_safety_image(image_data: bytes) -> dict:
    """
    촬영된 이미지를 Azure AI Vision으로 분석하여 안전모/조끼 착용 여부를 판별한다.

    분석 흐름:
    1. Azure Vision API에 이미지를 전송하여 캡션과 태그를 추출
    2. 캡션·태그에서 안전모/조끼 키워드를 각각 매칭
    3. 항목별 pass/fail과 전체 신뢰도를 반환

    Args:
        image_data: 이미지 바이너리 데이터

    Returns:
        dict: {
            "helmet_pass": bool — 안전모 착용 여부,
            "vest_pass": bool — 안전조끼 착용 여부,
            "cv_confidence": float — AI 신뢰도 (0.0~1.0),
            "status": "pass" 또는 "fail" — 둘 다 통과해야 pass,
        }
    """
    settings = get_settings()

    # Azure Vision 키가 설정되지 않은 경우 — 개발 모드
    if not settings.AZURE_VISION_KEY:
        logger.warning("Azure Vision 키 미설정 — 개발 모드(항상 pass)")
        return {
            "helmet_pass": True,
            "vest_pass": True,
            "cv_confidence": 1.0,
            "status": "pass",
        }

    try:
        client = _get_vision_client()

        # 캡션 + 태그 분석 요청
        analysis = client.analyze(
            image_data=image_data,
            visual_features=[VisualFeatures.CAPTION, VisualFeatures.TAGS],
        )

        # 캡션 텍스트 추출
        caption_text = ""
        confidence = 0.0
        if analysis.caption:
            caption_text = analysis.caption.text.lower()
            confidence = analysis.caption.confidence

        # 태그 이름 추출
        tag_names = []
        if analysis.tags:
            tag_names = [tag.name.lower() for tag in analysis.tags.values]

        # 모든 텍스트를 합쳐서 키워드 매칭
        all_text = caption_text + " " + " ".join(tag_names)

        # 안전모/조끼 각각 판정
        helmet_pass = any(kw in all_text for kw in HELMET_KEYWORDS)
        vest_pass = any(kw in all_text for kw in VEST_KEYWORDS)

        # 둘 다 통과해야 최종 pass
        status = "pass" if (helmet_pass and vest_pass) else "fail"

        return {
            "helmet_pass": helmet_pass,
            "vest_pass": vest_pass,
            "cv_confidence": round(confidence, 3),
            "status": status,
        }

    except Exception as e:
        logger.error(f"Azure Vision API 호출 실패: {e}")
        return {
            "helmet_pass": False,
            "vest_pass": False,
            "cv_confidence": 0.0,
            "status": "fail",
        }
