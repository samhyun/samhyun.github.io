---
title: 'Google ADK 생활 비서 챗봇'
description: '건강 기록, 일정 관리, 회고 등 개인 생활 전반을 지원하는 AI 멀티 에이전트 챗봇. 계층적 에이전트 아키텍처와 시맨틱 메모리 검색을 적용했다.'
period: '2025 — 현재'
role: '풀스택 개발자 (개인)'
type: personal
techStack: ['Kotlin', 'Python 3.12', 'Spring Boot 4.0 (WebFlux)', 'Google ADK', 'PostgreSQL (pgvector)', 'R2DBC', 'Keycloak', 'Swift (iOS)']
highlights:
  - 'Router → LifeAgent + ReflectAgent 계층적 에이전트 아키텍처 설계'
  - 'LLM 기반 의도 분류(15종) + 신뢰도 기반 동적 라우팅'
  - 'pgvector 시맨틱 메모리 검색 및 iOS 앱 개발'
order: 14
---

## 배경

매일 반복되는 건강 기록, 일정 확인, 회고 같은 루틴을 하나의 대화 인터페이스로 통합하고 싶었다. 기존 앱들은 기능별로 파편화돼 있어서 "토스트 먹었어"라는 한 마디로 식단 기록부터 칼로리 계산까지 처리하는 개인 비서를 직접 만들기로 했다. Google ADK의 멀티 에이전트 프레임워크를 활용해 역할별 에이전트를 분리하고 자연스러운 대화 흐름을 설계했다.

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
    Router["AuraRouter\n(최상위 라우터)"]
    Router --> Life["LifeAgent\n(생활비서)"]
    Router --> Reflect["ReflectAgent\n(회고비서)\n일간·주간·월간 회고"]
    Router --> Board["BoardAgent\n(대시보드)\n통계 데이터 제공"]

    Life --> Record["RecordAgent\n식단·운동·감정·복약 기록"]
    Life --> Schedule["ScheduleAgent\n일정 CRUD"]
    Life --> Mission["MissionManager\n반복 루틴 관리"]
    Life --> Memo["MemoAgent\n메모 저장·시맨틱 검색"]
    Life --> Goal["GoalAgent\n목표 설정·추적"]
    Life --> Executor["MissionExecutor\n앱 실행 시 미션 자동 실행"]
    Life --> Chat["ChatAgent\n일반 대화 (폴백)"]

    style Router fill:#fef3c7,stroke:#f59e0b,color:#78350f
    style Life fill:#dbeafe,stroke:#3b82f6,color:#1e3a5f
    style Reflect fill:#ede9fe,stroke:#8b5cf6,color:#4c1d95
    style Board fill:#d1fae5,stroke:#10b981,color:#064e3b
    style Record fill:#e0f2fe,stroke:#38bdf8,color:#0c4a6e
    style Schedule fill:#e0f2fe,stroke:#38bdf8,color:#0c4a6e
    style Mission fill:#e0f2fe,stroke:#38bdf8,color:#0c4a6e
    style Memo fill:#e0f2fe,stroke:#38bdf8,color:#0c4a6e
    style Goal fill:#e0f2fe,stroke:#38bdf8,color:#0c4a6e
    style Executor fill:#e0f2fe,stroke:#38bdf8,color:#0c4a6e
    style Chat fill:#e0f2fe,stroke:#38bdf8,color:#0c4a6e
```

사용자 메시지가 들어오면 AuraRouter가 assistant 유형(생활/회고)을 판단하고 LifeAgent 또는 ReflectAgent로 전달한다. LifeAgent는 LLM 기반 의도 분류기로 건강 기록·일정·미션·메모·목표 등 15종 인텐트를 식별하고 신뢰도 점수에 따라 적합한 서브 에이전트를 동적으로 선택한다.

사용자의 직접 입력뿐 아니라 앱 실행 시 미션 자동 실행, 시간대별 인사·넛지·리마인더 같은 시스템 트리거도 지원해 사용자와 능동적으로 상호작용한다.

## 기술 스택 선택 이유

- **Google ADK + Gemini 2.0 Flash**: 에이전트 간 계층적 라우팅과 세션 상태 관리가 프레임워크 수준에서 지원돼 직접 구현할 오케스트레이션 코드를 줄였다
- **Spring Boot 4.0 WebFlux + R2DBC**: 에이전트의 비동기 스트리밍 응답을 논블로킹으로 처리하기 위해 리액티브 스택 선택
- **PostgreSQL + pgvector**: 메모 검색에 시맨틱 유사도 검색을 적용해 키워드가 정확히 일치하지 않아도 관련 메모를 찾을 수 있게 했다
- **Keycloak 듀얼 인증**: 모바일 앱 사용자와 에이전트 시스템의 인증을 분리해 보안과 편의성을 모두 확보했다

## 현재 진행 상황

MVP 단계로 핵심 에이전트(Router · LifeAgent · ReflectAgent)와 건강 기록·일정 관리 기능이 동작하는 상태다. iOS 앱 프론트엔드를 Swift로 개발 중이며 넛지·리마인더 같은 능동적 상호작용 기능을 확장하고 있다.
