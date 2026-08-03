---
title: 'TV 광고 플랫폼 2.0'
description: '1.0의 운영 경험을 반영해 Kotlin과 Vue.js로 다시 구성한 TV 광고 플랫폼. MediaConvert 기반 영상 인코딩과 AWS 배포 흐름을 구현했다.'
period: '2019.06 — 2020.05'
role: '풀스택 개발자'
techStack: ['Kotlin', 'Java', 'TypeScript', 'Spring Boot', 'Vue.js', 'MySQL', 'Redis', 'AWS (S3, CloudFront, Lambda, MediaConvert)', 'Git']
highlights:
  - 'DB·프로젝트 구조 설계와 주요 도메인 서비스 초기 구축'
  - 'AWS MediaConvert/Lambda 기반 영상 인코딩 기능 구현'
  - 'S3, CloudFront, Lambda를 활용한 웹 배포 자동화'
order: 6
featured: true
---

## 배경

1.0을 운영하며 확인한 요구사항을 반영해 2세대로 다시 구성했다. 프론트엔드는 AngularJS에서 Vue.js로, 주요 백엔드 코드는 Java에서 Kotlin으로 전환했다. 영상 인코딩은 외부 SaaS인 Zencoder 대신 AWS MediaConvert를 사용했다. 풀스택 3명과 백엔드 2명이 참여했고 DB 설계부터 주요 기능과 AWS 환경 구축을 담당했다.

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
- AWS MediaConvert + CloudWatch + Lambda 기반 영상 인코딩 — 업로드부터 인코딩 상태 반영까지 AWS 서비스 안에서 이어지도록 구성
