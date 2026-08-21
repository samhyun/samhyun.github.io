---
title: '대화형 여행 계획 에이전트 (Trip Agent)'
description: '대화로 여행지를 좁히고 명소·항공·숙소를 검색한 뒤 동선과 일정, 예약 시뮬레이션까지 하나의 채팅 화면에서 처리하는 멀티턴 에이전트. LangGraph supervisor 구조로 워커를 오케스트레이션한다.'
period: '2026.07'
role: '풀스택 개발자 (개인)'
type: personal
techStack: ['Python 3.12', 'FastAPI', 'LangGraph', 'LangChain', 'React 18', 'Vite', 'PostgreSQL (pgvector)', 'SQLAlchemy 2.0', 'LangSmith']
highlights:
  - 'turns/type/payload 렌더 계약을 도입해 프론트 reducer의 카드 변환 로직 제거'
  - '골든셋 10케이스와 LLM judge로 비결정적 응답의 회귀 테스트 구성'
  - 'provider별 서킷브레이커와 FAQ 시맨틱 캐시로 외부 장애·중복 호출 대응'
links:
  - label: 'GitHub — trip-agent'
    url: 'https://github.com/samhyun/trip-agent'
order: 13
---

## 프로젝트 개요

이어드림스쿨 8주차 개인 프로젝트다. "제주도 갈까 하는데"라고 말하면 기간과 인원을 되묻고, 명소 추천에서 일정, 항공, 숙소, 결제까지 하나의 채팅 화면 안에서 이어진다. 검색과 예약 확인을 별도 화면으로 나누지 않고 대화 스트림에 카드로 쌓는 구조로 잡았다.

실제 발권이나 결제는 하지 않는 학습·시연용 프로젝트다.

![Trip Agent 대화 화면 시안](/blog/claude-design/trip-agent-canvas.png)

*대화와 여행 카드가 한 흐름에 쌓이는 구조를 정리한 화면 시안*

## 구조

LangGraph supervisor 구조를 썼다. coordinator가 의도를 나누고 명소·항공·숙소·일정·결제·FAQ 워커가 이어서 처리한다. 각 워커는 발화에서 검색 조건을 판단하고, 실제 필터링과 정렬은 코드가 맡는다.

중개 서비스를 따로 두지 않고 FastAPI 백엔드 안에 그래프를 바로 얹었다. 응답은 노드별 발화 리스트(`turns`)로 내려가며 각 발화에 렌더 타입과 카드 데이터가 함께 담긴다. 프론트는 그 타입만 보고 어떤 카드 컴포넌트로 그릴지 고른다.

## 주요 기능

- 목적지·날짜·인원을 턴마다 누적하고 "제주 말고 부산" 같은 정정도 반영
- 등록되지 않은 해외 도시는 영문명과 좌표를 조회해 런타임에 등록
- 두 도시를 여행할 때 방문 순서·숙박 배분·이동 수단이 다른 A/B 안 비교
- FAQ 33건을 pgvector 유사도 검색으로 찾아 근거로만 답하고 출처 표기
- 텍스트는 토큰 단위로 스트리밍하고 구조화된 카드는 완성된 뒤 한 번에 전송
- JWT 기반 회원가입·로그인, 여행·예약·결제 내역을 계정에 저장

## 테스트와 운영

같은 입력에도 응답이 달라지는 구조라 테스트를 계층으로 나눴다. 날짜 계산이나 총액 합산 같은 결정론적 로직은 오프라인 유닛 테스트로, LLM이 하는 판단은 골든셋 10케이스와 LLM judge로 확인한다. 케이스마다 여러 번 돌려 통과율로 판정하고 임계 미달이면 종료코드로 회귀를 알린다.

운영 쪽으로는 LangSmith 트레이싱으로 노드별 지연을 보고, provider별 서킷브레이커로 죽은 외부 API의 타임아웃을 반복해서 기다리지 않게 했다. FAQ 답변에는 시맨틱 캐시를 얹어 거의 같은 질문의 재계산을 줄였다.

## 관련 글

- [대화형 여행 에이전트의 렌더 계약 — 응답을 turns/type/payload로 나눈 이유](/blog/conversational-ui-turns-contract)
- [골든셋과 LLM judge로 에이전트 회귀 테스트 만들기](/blog/llm-agent-testing-golden-set)
- [LLM 에이전트에 트레이싱·서킷브레이커·시맨틱 캐시 붙이기](/blog/llm-service-resilience-cost)
