# AISG — AI Safety Guard (현장 안전물품 착용 점검 시스템)

## 개요
작업자가 전화번호 뒷자리로 로그인 → 카메라로 안전물품 촬영 → Azure AI Vision이 착용 여부 판별 → 3회 실패 시 관리자 호출.
관리자는 그룹·인원 관리, 당일 현황, 일/주/월 통계를 조회.

## 스택
- **Backend**: FastAPI, SQLAlchemy, SQLite, Pydantic v2
- **AI/Cloud**: Azure AI Vision, Azure Blob Storage, Azure OpenAI (보고서)
- **Frontend**: Vanilla HTML/CSS/JS (PWA), Chart.js
- **Infra**: Docker, docker-compose

## 디렉토리 구조
```
AISG/
├── backend/
│   ├── app/
│   │   ├── core/          # config, security
│   │   ├── models/        # SQLAlchemy ORM
│   │   ├── schemas/       # Pydantic 요청/응답
│   │   ├── services/      # 비즈니스 로직
│   │   ├── routers/       # API 엔드포인트
│   │   │   ├── admin/
│   │   │   └── user/
│   │   ├── database.py
│   │   ├── dependencies.py
│   │   └── main.py
│   ├── migrations/
│   ├── tests/
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── admin/             # 관리자 페이지
│   ├── user/              # 작업자 페이지
│   ├── assets/
│   │   ├── css/
│   │   ├── js/
│   │   │   └── admin/
│   │   └── img/
│   └── sw.js
└── docker-compose.yml
```

## 컨벤션

### 커밋
- `feat: 한국어 설명` / `fix: 한국어 설명` / `docs: 한국어 설명`

### 주석 규칙
- 함수/클래스 위에 docstring: 기능 설명 + 파라미터 + 반환값
- 핵심 로직 인라인 주석: 왜 이 처리가 필요한지, 결과가 무엇인지
- API 엔드포인트: HTTP 메서드, 경로, 요청/응답 형태

### 보안
- `.env`, credentials, API 키는 절대 커밋 금지
- `.env.example`로 샘플만 제공

### 환경
- Python 3.11+, venv 기반
- Windows 11, bash 셸
