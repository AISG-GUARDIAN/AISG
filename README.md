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
cd backend
uvicorn main:app --reload
```

5. 브라우저에서 `http://localhost:8000` 접속


# 도커로 실행하기


## 📄 라이선스

SeSAC Microsoft AI 시스템 엔지니어 3기 프로젝트로, 교육 목적으로 개발되었습니다.
