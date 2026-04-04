---
title: 'LGES HVAC AI 챗봇 플랫폼'
description: '마이크로서비스 기반 AI 챗봇 플랫폼 전체 아키텍처 설계 및 개발. Google ADK 멀티 에이전트, WebFlux 리액티브 API, 실시간 STT, 멀티 클라우드 인프라까지 전 과정 담당.'
period: '2025.09 — 2026.03'
role: '백엔드 TechLead / AI Agent 개발자'
techStack: ['Java 21', 'Kotlin', 'Python 3.13', 'Spring Boot 3.5 (WebFlux)', 'Google ADK', 'LangChain4j', 'FastAPI', 'React 19', 'MySQL', 'Milvus', 'AWS (ECS/CloudFront/RDS)', 'GCP (GKE)', 'Terraform', 'Docker']
highlights:
  - '필리핀 대상 AI 챗봇 서비스 성공 론칭 — 10개국 글로벌 확산 결정 확보'
  - 'Google ADK 기반 멀티 에이전트 시스템 — IntentAgent(8종) + 7개 도메인 Agent 오케스트레이션'
  - 'Terraform IaC로 AWS/GCP 멀티 클라우드 인프라 전체 코드화 및 모듈화'
order: 1
---

## 프로젝트 개요

LG Energy Solution HVAC 사업부를 위한 AI 챗봇 플랫폼이다. 고객이 제품 문의, 기술 지원, FAQ를 자연어로 요청하면 AI가 내부 지식 베이스를 기반으로 정확한 답변을 제공한다. 마이크로서비스 3개로 구성되며, 아키텍처 설계부터 개발까지 전담(기여도 100%)했다.

## 아키텍처

### 멀티 에이전트 시스템 (Google ADK)

단순 Q&A를 넘어 복잡한 도메인 질의를 처리하기 위해 Google ADK 기반 멀티 에이전트 아키텍처를 설계했다.

- **IntentAgent**: 사용자 입력을 8종 의도로 분류
- **7개 도메인 Agent**: 제품 스펙, FAQ, 마케팅, 기술 지원 등 전문 영역별 Agent
- **오케스트레이션**: IntentAgent가 의도를 파악한 후 적절한 도메인 Agent에 위임

### 리액티브 API 서버

Spring WebFlux + R2DBC 기반의 완전 논블로킹 리액티브 API 서버를 구축했다.

- SSE(Server-Sent Events) 스트리밍으로 실시간 AI 응답 제공
- Resilience4j 서킷 브레이커/재시도 패턴으로 외부 API 장애 대응
- 비동기 처리로 동시 사용자 처리 성능 최적화

### 실시간 STT (Speech-to-Text)

OpenAI Realtime API 기반 실시간 음성 인식 기능을 구현했다.

- WebSocket 양방향 스트리밍 구현
- VAD(Voice Activity Detection) 직접 개발
- 텍스트 변환 후 챗봇 파이프라인과 연계

### Admin 시스템

지식 베이스(FAQ, 제품 스펙, 마케팅 자료) 관리 체계를 구축했다.

- RBAC 기반 접근 제어로 역할별 권한 관리
- 문서 업로드 → 벡터 임베딩 자동화 파이프라인

## 인프라

Terraform IaC로 AWS/GCP 멀티 클라우드 인프라 전체를 코드화하고 모듈화했다.

- **AWS**: ECS, CloudFront, RDS, S3
- **GCP**: GKE 기반 인프라 전환 설계 (10개국 글로벌 확산 대응)
- 환경별(dev/staging/prod) 완전 분리

## 성과

- 필리핀 대상 AI 챗봇 서비스 성공 론칭, 고객사 만족으로 **10개국 글로벌 확산 결정 확보**
- 마이크로서비스 3개 전체 아키텍처 설계·개발 전담
- 멀티 클라우드 인프라 100% 코드화 달성
