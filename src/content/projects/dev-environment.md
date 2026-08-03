---
title: '백엔드 개발 환경 개선'
description: '공용 API 문서 서버, Spring Cloud Config 설정 중앙화, 사내 Maven Repository, 프로젝트 보일러플레이트 등 개발 환경 전반을 단독으로 설계·구축한 프로젝트.'
period: '2021.05 — 2024.05'
role: '백엔드 TechLead (단독 수행)'
techStack: ['Kotlin', 'Java', 'Spring Boot', 'Spring Cloud', 'SwaggerUI', 'AWS', 'Docker', 'Jenkins', 'GitHub Packages']
highlights:
  - '공용 API 문서 서버 구축 + CI/CD 배포 자동화로 API 문서 일원화'
  - '서비스별 설정을 Spring Cloud Config와 Git으로 중앙 관리'
  - 'S3 기반 사내 Maven Repository를 구축하고 GitHub Packages로 이전'
order: 4
featured: true
---

## 프로젝트 개요

(주)일루미나리안에서 시스템 설계와 개발, 문서화, 팀원 교육을 단독으로 진행했다.

## 공용 API 문서 서버 구축 및 자동화

- 프로젝트 증가에 따른 분산된 REST Docs 문서 접근, 중복 문서화, Postman 의존 등 협업 비효율 문제 파악
- Swagger UI + Docker Compose 기반 API 문서 통합 서버 구축
- epages-restdocs 플러그인을 활용하여 기존 REST Docs 기반 테스트 코드에서 OpenAPI Spec 자동 생성
- Jenkins 파이프라인 연동으로 API 명세 변경 시 EC2 서버에 자동 배포
- 한곳에서 API 문서를 확인하고 직접 호출할 수 있어 API 확인과 협업에 드는 시간을 줄였다

## Spring Cloud Config 설정 중앙화

- Spring Cloud Config Server 도입으로 다수의 분산 서비스 설정을 중앙 통합 관리
- Git 기반 설정 저장소 구성: 서비스명·프로파일·브랜치 기준의 유연한 검색 로직 구현
- 운영/스테이지/테스트 환경 분리 적용, AWS Parameter Store 기반 민감정보 암호화/복호화 적용
- 환경별 설정을 한곳에서 관리하고 Git 이력으로 이전 설정을 복원할 수 있게 했다

## 사내 공용 라이브러리 레포지토리

- AWS S3 기반 사내 공용 Maven Repository 구축 후 GitHub Packages로 이전
- 버전 관리·시각화·보안 정책을 개선하고 build.gradle 환경변수 기반 인증 주입으로 보안성을 강화했다
- 사내 전 프로젝트에서 중복 구현되던 공통 라이브러리의 관리 효율성과 재사용성을 높였다

## Java 기반 프로젝트 보일러플레이트

- Spring Boot 기반 표준 프로젝트 구조 설계(공통 패키지, 예외 처리, 응답 포맷, 로깅 설정 사전 정의)
- 인증 처리, 페이징, API 응답 포맷, 에러 코드 관리 등 자주 쓰이는 기능 모듈화
- 사내 템플릿으로 배포해 3개 이상의 프로젝트에서 공통 초기 구성을 재사용했다

## 관련 글

- [Swagger UI로 여러 프로젝트의 API 문서 통합하기](/blog/swagger-ui-centralized-api-docs)
- [Spring Cloud Config로 서비스 설정 중앙화하기](/blog/spring-cloud-config-centralized-management)
- [GitHub Packages로 사내 Java 라이브러리 배포하기](/blog/github-packages-java-library)
