---
title: 'LG전자 HVAC AI 챗봇 플랫폼'
description: 'LG전자 HVAC 고객을 위한 AI 챗봇 플랫폼. Google ADK 멀티 에이전트, WebFlux API, 실시간 STT와 멀티 클라우드 인프라를 설계하고 개발했다.'
period: '2025.09 — 2026.03'
role: '백엔드 / AI Agent 개발자'
techStack: ['Java 21', 'Python 3.13', 'Spring Boot 3.5 (WebFlux)', 'Google ADK', 'LangChain4j', 'FastAPI', 'React 19', 'MySQL', 'Milvus', 'AWS', 'GCP', 'Azure', 'Terraform', 'Docker']
highlights:
  - '필리핀 서비스를 론칭하고 10개국 확산을 고려한 멀티 클라우드 구조 설계'
  - 'Google ADK 기반 멀티 에이전트 시스템 — IntentAgent(8종) + 7개 도메인 Agent 오케스트레이션'
  - 'Terraform 모듈로 AWS·GCP·Azure 환경의 배포 구성을 관리'
links:
  - label: 'LG 필리핀 HVAC 페이지 (HVAC AI Assistant 버튼)'
    url: 'https://www.lg.com/ph/business/hvac/homeowner/'
order: 1
featured: true
---

## 프로젝트 개요

LG전자 HVAC 고객을 위한 AI 챗봇 플랫폼이다. 고객이 제품 문의, 기술 지원, FAQ를 자연어로 요청하면 AI가 내부 지식 베이스에서 관련 내용을 찾아 답한다. 에이전트, 코어 API, 관리자 서비스, 벡터 검색 서비스와 웹 클라이언트로 구성했으며 백엔드 아키텍처 설계와 주요 구현을 맡았다.

## 아키텍처

### 멀티 에이전트 시스템 (Google ADK)

단순 Q&A를 넘어 복잡한 도메인 질의를 처리하기 위해 Google ADK 기반 멀티 에이전트 아키텍처를 설계했다.

- **IntentAgent**: 사용자 입력을 8종 의도로 분류
- **7개 도메인 Agent**: 제품 스펙, FAQ, 마케팅, 기술 지원 등 전문 영역별 Agent
- **오케스트레이션**: IntentAgent가 의도를 파악한 후 적절한 도메인 Agent에 위임

### 리액티브 API 서버

Spring WebFlux + R2DBC 기반의 리액티브 API 서버를 구축했다.

- SSE(Server-Sent Events) 스트리밍으로 실시간 AI 응답 제공
- Resilience4j 서킷 브레이커/재시도 패턴으로 외부 API 장애 대응
- 외부 API와 스트리밍 응답을 비동기 흐름으로 처리

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

국가와 운영 환경에 따라 클라우드를 선택할 수 있도록 Terraform 구성을 모듈화했다.

- **AWS**: ECS, CloudFront, RDS, S3
- **GCP**: GKE 기반 배포 환경 설계
- **Azure**: 컨테이너 기반 배포 환경 구성
- 환경별(dev/staging/prod) 설정과 리소스 분리

## 성과

- 필리핀 대상 HVAC AI 챗봇 서비스 론칭
- 에이전트와 코어 API, 관리자·벡터 검색 서비스의 연동 구조 설계
- 10개국 확장을 고려해 클라우드별 배포 구성을 Terraform 모듈로 관리

## 관련 글

- [Terraform으로 멀티 클라우드 챗봇 인프라 구성하기](/blog/chatbot-infra-multicloud-terraform)
- [멀티 에이전트에서 사용자 의도를 분류하고 라우팅하기](/blog/multi-agent-intent-routing)
- [RAG 문서 전처리 파이프라인 설계](/blog/rag-document-preprocessing-pipeline)
