---
title: 'Google ADK 생활 비서 챗봇'
description: '건강 기록, 일정 관리, 회고 등 개인 생활 전반을 지원하는 AI 멀티 에이전트 챗봇. 계층적 에이전트 아키텍처와 시맨틱 메모리 검색을 적용했습니다.'
period: '2025 — 현재'
role: '풀스택 개발자 (개인)'
techStack: ['Kotlin', 'Python 3.12', 'Spring Boot 4.0 (WebFlux)', 'Google ADK', 'PostgreSQL (pgvector)', 'R2DBC', 'Keycloak', 'Swift (iOS)']
highlights:
  - 'Router → LifeAgent + ReflectAgent 계층적 에이전트 아키텍처 설계'
  - 'LLM 기반 의도 분류(15종) + 신뢰도 기반 동적 라우팅'
  - 'pgvector 시맨틱 메모리 검색 및 iOS 앱 개발'
order: 12
---

## 프로젝트 개요

건강 기록, 일정 관리, 회고 등 개인 생활 전반을 지원하는 AI 멀티 에이전트 챗봇을 풀스택으로 개발하고 있습니다.

## 아키텍처

- **Router Agent**: 사용자 입력을 15종 의도로 분류하고 신뢰도 기반 동적 라우팅
- **LifeAgent**: 기록, 미션, 메모 등 생활 관련 작업 처리
- **ReflectAgent**: 회고, 통계 분석 등 메타 인지 작업 처리

## 기술적 특징

- pgvector 기반 시맨틱 메모리 검색
- 듀얼 인증 (JWT + API Key)
- iOS 네이티브 앱 (Swift) 개발
