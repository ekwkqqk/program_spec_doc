# 프로그램 사양서 웹 시스템

로컬 경로 또는 Git URL의 Java / Vue / XML 소스를 분석해 AI(또는 규칙 기반) 사양서 초안을 만들고, 웹에서 편집한 뒤 Word(`.docx`)로 다운로드합니다.

기능 정의서: [`docs/기능정의서.md`](docs/기능정의서.md)

## 구성

- `server` — Express + JSON 파일 저장소 (분석, AI 초안, Word 내보내기)
- `client` — Vue 3 + Vite
- `fixtures/sample-app` — 로컬 경로 테스트용 Java/Vue/XML 샘플

## 사전 요구

- Node.js 20+
- Git (Git URL 입력 시)

## 설정

```bash
cp server/.env.example server/.env
```

주요 환경변수 (`server/.env`):

| 변수 | 설명 |
|------|------|
| `ALLOWED_ROOTS` | 로컬 경로 허용 루트 (`;` 구분). 기본 예: `C:\` |
| `OPENAI_API_KEY` | 설정 시 OpenAI 호환 API로 초안 생성. 없으면 규칙 기반 초안 |
| `OPENAI_BASE_URL` / `OPENAI_MODEL` | API 엔드포인트·모델 |
| `GIT_TOKEN` | 비공개 Git HTTPS용 토큰(선택) |

## 실행

```bash
npm install
npm run install:all
npm run dev
```

- UI: http://localhost:5173
- API: http://localhost:3001

## 사용 흐름

1. 작업 생성
2. Git URL 또는 로컬 경로 입력 → 분석 시작
3. 진행 화면에서 분석·초안 생성 대기
4. 섹션 편집 · 임시 저장 · 확정
5. Word 다운로드 (`{프로젝트명}_프로그램사양서_{YYYYMMDD}.docx`)
