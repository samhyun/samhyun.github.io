---
title: 'TV 광고 플랫폼 2.0'
description: '1.0의 기술 부채를 해소하고 AWS 네이티브 서비스로 전환한 TV 광고 플랫폼 2세대. Kotlin + Vue.js 도입, MediaConvert 기반 영상 인코딩 구현.'
period: '2019.06 — 2020.05'
role: '풀스택 개발자'
techStack: ['Kotlin', 'Java', 'TypeScript', 'Spring Boot', 'Vue.js', 'MySQL', 'Redis', 'AWS (S3, CloudFront, Lambda, MediaConvert)', 'Git']
highlights:
  - 'DB 설계·프로젝트 구조 설계 및 주요 도메인 서비스 초기 구축 (기여도 40%)'
  - 'AWS MediaConvert/Lambda 기반 영상 인코딩 기능 구현'
  - 'S3, CloudFront, Lambda를 활용한 웹 배포 자동화'
order: 6
---

## 배경

1.0을 5년간 운영하면서 쌓인 기술 부채를 해소하기 위해 2세대로 리빌드했다. AngularJS → Vue.js, Java → Kotlin으로 기술 스택을 현대화하고 외부 SaaS(Zencoder)에 의존하던 영상 인코딩을 AWS MediaConvert로 전환해 비용과 운영 복잡도를 줄이는 것이 주요 목표였다. 풀스택 3명 + 백엔드 2명 규모에서 DB 설계부터 AWS 환경 구축까지 담당했다 (기여도 40%).

## 온라인 청약 사이트

- 광고 청약 및 관리 기능·화면 개발
- 광고 영상 업로드 및 인코딩 화면 개발
- 보고서 및 실시간 분석 화면 개발, 각종 데이터 엑셀 추출 기능 개발
- 계약서 추출 기능 개발

## 관리자 사이트

- 광고 관리 화면 및 광고 영상 관리 화면 개발
- 사용자 및 업체 관리 화면, 서버 관리 화면 개발

## API 서비스 및 AWS 환경

- 광고 관리·영상 관리·사용자 관리·엑셀 추출 API 개발
- S3 + CloudFront + Lambda 조합으로 프론트엔드 배포 자동화 — 빌드 결과를 S3에 업로드하면 CloudFront 캐시가 자동 무효화
- AWS MediaConvert + CloudWatch + Lambda 기반 영상 인코딩 — Zencoder 대비 AWS 내부 연동으로 지연 시간과 비용 절감
