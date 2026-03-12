"""
Azure Blob Storage 서비스.
촬영된 안전물품 이미지를 Azure Blob에 업로드하고 URL을 반환한다.
"""

import logging
import uuid
from datetime import datetime, timezone

from azure.storage.blob import BlobServiceClient, ContentSettings

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def upload_image(image_data: bytes, content_type: str = "image/jpeg") -> str:
    """
    이미지를 Azure Blob Storage에 업로드한다.

    업로드 경로: {container}/{YYYY/MM/DD}/{uuid}.jpg
    날짜별 폴더로 구분하여 관리 편의성을 높인다.

    Args:
        image_data: 이미지 바이너리 데이터
        content_type: MIME 타입 (기본 image/jpeg)

    Returns:
        업로드된 이미지의 Blob URL. 설정 미완료 시 빈 문자열 반환.
    """
    settings = get_settings()

    # Blob 연결 문자열이 없으면 로컬 개발 모드 — URL 없이 진행
    if not settings.AZURE_BLOB_CONNECTION_STRING:
        logger.warning("Azure Blob 연결 문자열 미설정 — 이미지 업로드 건너뜀")
        return ""

    try:
        blob_service = BlobServiceClient.from_connection_string(
            settings.AZURE_BLOB_CONNECTION_STRING
        )
        container_client = blob_service.get_container_client(
            settings.AZURE_BLOB_CONTAINER
        )

        # 컨테이너가 없으면 생성
        try:
            container_client.get_container_properties()
        except Exception:
            container_client.create_container()

        # 날짜 기반 경로 + UUID 파일명으로 고유성 보장
        now = datetime.now(timezone.utc)
        blob_name = f"{now.strftime('%Y/%m/%d')}/{uuid.uuid4().hex}.jpg"

        blob_client = container_client.get_blob_client(blob_name)
        blob_client.upload_blob(
            image_data,
            content_settings=ContentSettings(content_type=content_type),
            overwrite=True,
        )

        return blob_client.url

    except Exception as e:
        logger.error(f"Blob 업로드 실패: {e}")
        return ""
