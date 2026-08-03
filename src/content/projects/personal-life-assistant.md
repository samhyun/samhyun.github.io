---
title: '개인 생활 관리 어시스턴트'
description: '건강 기록, 일정, 미션과 회고를 하나의 대화 흐름에서 관리하는 개인용 AI 어시스턴트. 계층적 에이전트 구조와 시맨틱 메모리 검색을 적용했다.'
period: '2025 — 현재'
role: '풀스택 개발자 (개인)'
type: personal
techStack: ['Kotlin', 'Python 3.12', 'Spring Boot 4.0 (WebFlux)', 'Google ADK 2.2', 'Gemini 2.5 Flash', 'PostgreSQL (pgvector)', 'R2DBC', 'Keycloak', 'SwiftUI']
highlights:
  - 'Router → LifeAgent + ReflectAgent 계층적 에이전트 아키텍처 설계'
  - '생활 요청을 7개 범주로 분류하고 신뢰도에 따라 서브 에이전트로 라우팅'
  - 'pgvector 시맨틱 메모리 검색 및 SwiftUI iOS 앱 개발'
order: 14
---

## 배경

매일 반복되는 건강 기록, 일정 확인, 회고 같은 루틴을 하나의 대화 인터페이스로 통합하고 싶었다. 기존 앱들은 기능별로 나뉘어 있어 "토스트 먹었어"라는 한마디로 식단 기록부터 칼로리 계산까지 처리하는 개인 비서를 직접 만들기로 했다. Google ADK를 활용해 역할별 에이전트를 나누고 대화 흐름을 설계했다.

![온보딩 화면 시안](/blog/claude-design/onboarding-welcome.png)

*iOS 앱의 온보딩 흐름을 정리한 화면 시안*

## 에이전트 아키텍처

```mermaid
---
config:
  theme: base
  themeVariables:
    primaryColor: "#e0f2fe"
    primaryTextColor: "#0c4a6e"
    primaryBorderColor: "#38bdf8"
    lineColor: "#94a3b8"
    fontSize: "14px"
---
flowchart TD
    Router["RootRouter\n최상위 라우터"]
    Router --> Life["LifeAgent\n생활 관리"]
    Router --> Reflect["ReflectAgent\n일간·주간·월간 회고"]

    Life --> Record["RecordAgent\n식단·운동·감정·복약 기록"]
    Life --> Schedule["ScheduleAgent\n일정 관리"]
    Life --> Mission["MissionManager\n반복 루틴 관리"]
    Life --> Memo["MemoAgent\n메모 저장·시맨틱 검색"]
    Life --> Goal["GoalAgent\n목표 설정·추적"]
    Life --> Chat["ChatAgent\n일반 대화·폴백"]

    style Router fill:#fef3c7,stroke:#f59e0b,color:#78350f
    style Life fill:#dbeafe,stroke:#3b82f6,color:#1e3a5f
    style Reflect fill:#ede9fe,stroke:#8b5cf6,color:#4c1d95
    style Record fill:#e0f2fe,stroke:#38bdf8,color:#0c4a6e
    style Schedule fill:#e0f2fe,stroke:#38bdf8,color:#0c4a6e
    style Mission fill:#e0f2fe,stroke:#38bdf8,color:#0c4a6e
    style Memo fill:#e0f2fe,stroke:#38bdf8,color:#0c4a6e
    style Goal fill:#e0f2fe,stroke:#38bdf8,color:#0c4a6e
    style Chat fill:#e0f2fe,stroke:#38bdf8,color:#0c4a6e
```

사용자 메시지가 들어오면 RootRouter가 생활 관리와 회고 중 어느 흐름인지 판단해 LifeAgent 또는 ReflectAgent로 전달한다. LifeAgent는 요청을 기록, 미션, 일정, 메모, 목표, 일반 대화, 폴백의 7개 범주로 분류하고 신뢰도에 따라 서브 에이전트를 선택한다. 대시보드 데이터는 별도 에이전트를 거치지 않고 Core REST API에서 제공한다.

사용자의 직접 입력뿐 아니라 앱 실행 시 미션 자동 실행, 시간대별 인사와 넛지, 리마인더 같은 시스템 트리거도 지원한다.

## 기술 스택 선택 이유

- **Google ADK 2.2 + Gemini 2.5 Flash**: 에이전트 간 계층적 라우팅과 세션 상태 관리를 활용해 역할별 흐름을 구성했다
- **Spring Boot 4.0 WebFlux + R2DBC**: 에이전트의 비동기 스트리밍 응답을 논블로킹 흐름으로 처리한다
- **PostgreSQL + pgvector**: 키워드가 정확히 일치하지 않아도 관련 메모를 찾도록 시맨틱 유사도 검색을 적용했다
- **Keycloak 듀얼 인증**: 모바일 앱 사용자 인증과 에이전트 간 인증을 서로 다른 흐름으로 분리했다

## 현재 진행 상황

핵심 에이전트와 건강 기록, 일정, 미션, 회고 흐름이 동작한다. SwiftUI iOS 앱에서 주요 화면과 Core API를 연결하고 있으며 넛지와 리마인더 같은 능동적 상호작용을 확장하고 있다.
