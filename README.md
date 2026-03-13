# AISG
가디언: AI 안전 체크 시스템


## 🚀 시작하기

### 사전 요구사항
```
Python 3.8 이상
Node.js 14 이상
```

### 설치 방법 및 실행 방법 (로컬)

1. 저장소 클론
```bash
git clone https://github.com/your-team/connecting-bridge.git
cd connecting-bridge
```

2. Backend 설정
```bash
cd backend
pip install -r requirements.txt
```

3. 환경 변수 설정
`.env` 파일을 생성하고 필요한 API 키를 설정합니다
```
OPENAI_API_KEY=your_api_key_here
```

4. Backend 서버 실행
```bash
> pip을 사용하셔서 가상환경을 쓰시던 아님 uv를 쓰시던 상관없습니다.

pip install -r backend/requirements.txt
또는 
uv pip install -r backend/requirements.txt

cd backend
uvicorn app.main:app --reload 
또는
uv run uvicorn app.main:app --reload
```

5. 브라우저에서 `http://localhost:8000` 접속


### Docker Compose로 실행하기

#### 사전 요구사항
- Docker 및 Docker Compose 설치

#### 실행 순서

1. 환경 변수 파일 생성
```bash
cp backend/.env.example backend/.env
# backend/.env 파일을 열어 실제 API 키와 설정값을 입력
```

2. 데이터 디렉토리 생성 (SQLite DB 영속화용)
```bash
mkdir -p data
```

3. Docker Compose 실행
```bash
docker compose up -d --build
```

4. 브라우저에서 `http://localhost:8001` 접속

#### 종료
```bash
docker compose down
```

#### 참고
- 호스트 포트 `8001`이 컨테이너 내부 `8000`으로 매핑됩니다
- `frontend/` 디렉토리는 읽기 전용으로 마운트되며, FastAPI가 정적 파일을 서빙합니다
- SQLite DB는 `data/` 디렉토리에 영속 저장됩니다
- 기본 관리자 계정은 앱 시작 시 자동 생성됩니다 (`.env`의 `DEFAULT_EMP_NO`, `DEFAULT_ADMIN_NAME` 값 사용)


## 📄 라이선스

SeSAC Microsoft AI 시스템 엔지니어 3기 프로젝트로, 교육 목적으로 개발되었습니다.
