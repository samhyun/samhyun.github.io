# SamHyun Dev

Sam Hyun Kim의 개인 블로그 및 포트폴리오. Astro + Tailwind CSS 기반.

- 사이트: https://samhyun.dev
- 주제: Spring, Cloud, AI Chatbot, 개발 워크플로우

## 구조

```text
src/
├── components/   # Astro 컴포넌트
├── content/      # 블로그/프로젝트 마크다운 (content collections)
├── layouts/      # 페이지 레이아웃
├── pages/        # 라우트
├── styles/       # 전역 스타일
└── utils/        # 유틸리티
```

블로그 글은 `src/content/blog/`에 마크다운으로 추가한다. frontmatter는 `src/content.config.ts` 참고.

## 개발

Node.js 22.12 이상 필요.

| 명령 | 설명 |
| :--- | :--- |
| `npm install` | 의존성 설치 |
| `npm run dev` | 로컬 dev 서버 (`localhost:4321`) |
| `npm run build` | `./dist/`로 프로덕션 빌드 |
| `npm run preview` | 빌드 결과 로컬 미리보기 |
