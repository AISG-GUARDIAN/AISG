# Python 3.11 슬림 이미지 기반
FROM python:3.11-slim

# 작업 디렉토리 설정
WORKDIR /app

# 시스템 패키지 설치 (Pillow 빌드용)
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libjpeg-dev zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

# 의존성 먼저 설치 (Docker 캐시 활용)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 백엔드 소스코드 복사
COPY backend/ .

# 프론트엔드 복사 (Azure App Service는 볼륨 마운트 불가)
COPY frontend/ /frontend

# SQLite 데이터 디렉토리 생성
RUN mkdir -p /app/data

# 포트 노출
EXPOSE 8000

# uvicorn으로 FastAPI 실행
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
