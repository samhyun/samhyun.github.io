---
title: 'Spring Cloud Config 롤백 시 설정이 안 맞는 문제 해결하기'
description: '운영 환경에서 특정 버전으로 롤백했더니 설정 정보가 현재 마스터 기준으로 내려와서 서비스가 정상 동작하지 않았다. Jenkins와 Docker를 활용해 배포 버전별로 Cloud Config 라벨을 자동 지정하는 방식으로 해결한 과정을 정리한다.'
pubDate: 2023-01-10
category: 'devops'
tags: ['spring-cloud-config', 'jenkins', 'docker', 'versioning', 'rollback']
draft: false
---

## 문제 상황

미국에서 운영 중인 사내 서비스에서 특정 버전으로 롤백이 필요한 상황이 생겼다. 롤백 자체는 문제가 없었는데 **Cloud Config에서 내려오는 설정 정보가 현재 마스터 브랜치 기준**이었다. 롤백한 버전에서는 이미 변경되거나 사라진 설정값을 참조하고 있어서 서비스가 정상 동작하지 않았다.

원인은 단순했다. Cloud Config의 label이 항상 `master`로 고정되어 있었기 때문이다. 어떤 버전을 배포하든 설정은 항상 최신 마스터를 가져왔다.

### 추가 제약 조건

- **공통 Config Repository** — 모든 프로젝트가 같은 Cloud Config Repository를 사용하고 있어서 프로젝트별로 라벨이 충돌하지 않아야 했다
- **설정 변경이 없는 버전** — 모든 배포에서 설정이 바뀌는 건 아니다. 설정 변경이 없으면 마스터 기본값을 그대로 써야 했다
- **수동 개입 최소화** — 개발자가 매번 라벨을 직접 지정하면 실수가 생긴다. 자동화가 필요했다

---

## 해결 방향

배포 시 **버전(태그/브랜치)에 맞는 Cloud Config 라벨을 자동으로 지정**하고 해당 라벨의 브랜치가 Config Repository에 없으면 마스터로 폴백하는 구조를 만들었다.

```mermaid
---
config:
  theme: base
  themeVariables:
    primaryColor: "#e0f2fe"
    primaryTextColor: "#0c4a6e"
    primaryBorderColor: "#38bdf8"
    lineColor: "#94a3b8"
    secondaryColor: "#f0fdf4"
    tertiaryColor: "#fef3c7"
    nodeTextColor: "#1e293b"
    edgeLabelBackground: "#ffffff"
    fontSize: "14px"
---
graph TD
    A(["🏷️ 배포 태그 v1.2.0"]) --> B(["📋 Config 라벨\nMYPROJECT-v1.2.0"])
    B --> C{"🔍 Config Repository에\n해당 브랜치 존재?"}
    C -->|있음| D(["✅ 해당 버전 설정 사용"])
    C -->|없음| E(["↩️ master 설정 사용"])

    style A fill:#e0f2fe,stroke:#38bdf8,color:#0c4a6e
    style B fill:#fef3c7,stroke:#f59e0b,color:#78350f
    style C fill:#f3e8ff,stroke:#a855f7,color:#581c87
    style D fill:#f0fdf4,stroke:#22c55e,color:#14532d
    style E fill:#fff7ed,stroke:#f97316,color:#7c2d12
```

---

## 구현

### 1. Jenkins에서 라벨 자동 설정

```groovy
stage('set config label') {
    steps {
        script {
            // 특정 라벨이 지정된 경우 우선 사용
            if (SPECIFIC_CONFIG_LABEL != null && !SPECIFIC_CONFIG_LABEL.isEmpty()) {
                env.CONFIG_LABEL = "${SPECIFIC_CONFIG_LABEL}"
            } else {
                // 배포 태그 기준으로 라벨 설정
                if (BUILD_TAG != 'develop' && BUILD_TAG != 'master') {
                    echo "Setting config label with prefix"
                    env.CONFIG_LABEL = "MYPROJECT-${BUILD_TAG}"

                    // Cloud Config 브랜치 확인
                    def gitBranches = sh(
                        returnStdout: true,
                        script: 'git ls-remote https://$ILM_REPO_USR:$ILM_REPO_PSW@github.com/my-project/cloud-config.git'
                    ).trim()

                    // 브랜치가 없으면 기본값(master)으로 설정
                    if (!gitBranches.contains("refs/heads/${CONFIG_LABEL}")) {
                        env.CONFIG_LABEL = 'master'
                    }
                } else {
                    env.CONFIG_LABEL = 'master'
                }
            }
        }
    }
}
```

Jenkins 파라미터로 `SPECIFIC_CONFIG_LABEL`을 직접 지정할 수도 있다. 긴급 상황에서 특정 설정 브랜치를 강제로 지정해야 할 때 사용한다.

### 2. Spring Boot 설정 (bootstrap.yml)

```yaml
spring:
  application:
    name: front-service
  cloud:
    config:
      name: myproject-front-service
      uri: http://cloud-config-server-dev.my-project.com
      label: ${CONFIG_LABEL:master}
      enabled: true
```

`CONFIG_LABEL` 환경 변수가 없으면 `master`를 기본값으로 사용한다.

### 3. Dockerfile에서 라벨 전달

```dockerfile
FROM eclipse-temurin:17-jdk
ARG CONFIG_LABEL

ENV CONFIG_LABEL=$CONFIG_LABEL

COPY build/libs/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "-Dspring.profiles.active=dev", "-Duser.timezone=Asia/Seoul", "/app.jar"]
```

### 4. Docker 빌드 시 라벨 주입

```groovy
stage('Build Image') {
    steps {
        script {
            app = docker.build(
                "${ECR_BASE_URL}/${ECR_NAME}:${IMAGE_TAG}",
                "--build-arg CONFIG_LABEL=$CONFIG_LABEL -f Dockerfile.${ACTIVE_PROFILE} ."
            )
        }
    }
}
```

---

## 라벨링 규칙

- **프로젝트 접두사** — 공통 Config Repository를 쓰기 때문에 `MYPROJECT-v1.0.0` 형태로 접두사를 붙인다
- **브랜치/태그 기반** — 배포 태그 `v1.0.0` → Config 라벨 `MYPROJECT-v1.0.0`
- **폴백** — 해당 라벨의 브랜치가 Config Repository에 없으면 `master` 사용

---

## 결과

롤백 시에도 해당 버전에 맞는 설정 정보가 자동으로 적용된다. 개발자가 설정 라벨을 수동으로 맞출 필요가 없어졌고 설정 불일치로 인한 장애 가능성이 사라졌다.

다만 프로젝트와 버전이 늘어나면 Config Repository의 브랜치가 많아질 수 있다. 오래된 브랜치를 정리하는 규칙을 함께 운영하는 게 좋다.
