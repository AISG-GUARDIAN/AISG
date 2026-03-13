"""
애플리케이션 설정 모듈.
pydantic-settings를 사용하여 .env 파일에서 환경변수를 로드한다.
Settings 인스턴스는 싱글턴으로 관리되며 앱 전역에서 사용된다.
"""

from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    환경변수 기반 앱 설정.

    Attributes:
        SECRET_KEY: JWT 서명에 사용되는 비밀키
        ALGORITHM: JWT 서명 알고리즘 (기본 HS256)
        ACCESS_TOKEN_EXPIRE_MINUTES: 액세스 토큰 만료 시간(분)
        AZURE_VISION_ENDPOINT: Azure AI Vision API 엔드포인트
        AZURE_VISION_KEY: Azure AI Vision API 키
        AZURE_BLOB_CONNECTION_STRING: Azure Blob Storage 연결 문자열
        AZURE_BLOB_CONTAINER: Blob 컨테이너 이름
        AZURE_OPENAI_ENDPOINT: Azure OpenAI 엔드포인트
        AZURE_OPENAI_KEY: Azure OpenAI API 키
        AZURE_OPENAI_DEPLOYMENT: Azure OpenAI 배포 모델명
        DATABASE_URL: SQLite 데이터베이스 경로
        DEFAULT_EMP_NO: 초기 관리자 사원번호
    """

    # JWT 설정
    SECRET_KEY: str = "change-this-secret-key"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8시간

    # Azure AI Vision
    AZURE_VISION_ENDPOINT: str = ""
    AZURE_VISION_KEY: str = ""

    # Azure Blob Storage
    AZURE_BLOB_CONNECTION_STRING: str = ""
    AZURE_BLOB_CONTAINER: str = "safety-images"

    # Azure OpenAI (보고서 생성)
    AZURE_OPENAI_ENDPOINT: str = ""
    AZURE_OPENAI_KEY: str = ""
    AZURE_OPENAI_DEPLOYMENT: str = "gpt-4o"

    # 데이터베이스
    DATABASE_URL: str = "sqlite:///./safety_check.db"

    # 초기 관리자 계정 — 사원번호만으로 로그인
    DEFAULT_EMP_NO: str = "20260312"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )


@lru_cache()
def get_settings() -> Settings:
    """
    Settings 싱글턴을 반환한다.
    lru_cache로 .env 파일 파싱을 최초 1회만 수행한다.

    Returns:
        Settings: 앱 전역 설정 인스턴스
    """
    return Settings()
