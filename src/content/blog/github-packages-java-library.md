---
title: 'S3 Maven Repository에서 GitHub Packages로 전환한 이유'
description: 'S3 버킷 기반 사내 Maven Repository를 운영하다 버전 확인이 불편하고 설정이 복잡해서 GitHub Packages로 전환했다. Gradle 설정부터 Jenkins 배포까지 전환 과정과 실제로 겪은 문제를 정리한다.'
pubDate: 2023-11-05
category: 'devops'
tags: ['github-packages', 'gradle', 'ci-cd', 'jenkins', 'maven']
draft: false
---

## S3 기반 Maven Repository의 불편함

사내 공용 라이브러리를 S3 버킷에 Maven Repository로 구축해서 쓰고 있었다. 동작은 했지만 운영하면서 불편한 점이 계속 쌓였다.

**버전 확인이 번거롭다** — 어떤 버전이 배포되어 있는지 확인하려면 AWS 콘솔에 들어가서 S3 버킷 안의 디렉토리 구조를 직접 탐색해야 했다. `com/companyName/library-name/` 하위에 버전별 폴더가 나열되는 식이라 한눈에 파악이 안 됐다.

**설정이 복잡하다** — S3를 Maven Repository로 쓰려면 `maven-s3-wagon` 플러그인을 추가하고 IAM 사용자를 만들어서 S3 접근 권한을 부여하고 그 credential을 Gradle과 Jenkins 양쪽에 설정해야 했다. 새 프로젝트를 추가할 때마다 같은 작업을 반복했다.

**의존성 추적이 안 된다** — 어떤 프로젝트가 어떤 라이브러리를 쓰고 있는지 파악할 방법이 없었다. 라이브러리에 breaking change를 넣을 때 영향 범위를 일일이 확인해야 했다.

GitHub Packages로 전환하면 이 문제가 대부분 해결된다. GitHub UI에서 버전별 패키지를 바로 조회할 수 있고 토큰 하나로 인증이 끝나고 Dependency Graph로 의존성 추적도 가능하다.

---

## 사내 버전 규칙

전환하면서 버전 관리 규칙도 함께 정리했다. Semantic Versioning을 기본으로 하되 개발 중에는 SNAPSHOT을 사용하고 main 브랜치 병합 시 Release 버전으로 올려서 배포하는 방식이다.

| 버전 유형 | 형식 | 용도 |
|---|---|---|
| SNAPSHOT | `X.Y.Z-SNAPSHOT` | 개발 중. 수시 변경 가능 |
| Release | `X.Y.Z` | 안정 버전. 변경 불가 |
| RC | `X.Y.Z-RC1` | QA 테스트용 릴리스 후보 |

---

## 라이브러리 배포 설정

### Publishing (라이브러리 프로젝트)

```groovy
plugins {
    id 'java-library'
    id 'maven-publish'
}

group = 'com.companyName'
version = '1.0.0'

publishing {
    repositories {
        maven {
            name = "GitHubPackages"
            url = uri("https://maven.pkg.github.com/companyName/repository-name")
            credentials {
                username = project.findProperty("gpr.user") ?: System.getenv("GH_CREDENTIALS_USR")
                password = project.findProperty("gpr.key") ?: System.getenv("GH_CREDENTIALS_PSW")
            }
        }
    }
    publications {
        gpr(MavenPublication) {
            from components.java
        }
    }
}
```

### Consuming (사용하는 프로젝트)

GitHub Packages는 public 저장소라도 인증이 필요하다. IntelliJ에서 환경변수를 못 읽는 경우가 있어서 `packages.properties` 파일을 별도로 만들어 관리했다.

```groovy
repositories {
    def props = new Properties()
    if (file("packages.properties").exists()) {
        file("packages.properties").withInputStream { props.load(it) }
    }

    mavenCentral()
    maven {
        url = "https://maven.pkg.github.com/companyName/repository-name"
        credentials {
            username = props.containsKey("username")
                ? props.getProperty("username")
                : System.getenv("GH_CREDENTIALS_USR")
            password = props.containsKey("access_token")
                ? props.getProperty("access_token")
                : System.getenv("GH_CREDENTIALS_PSW")
        }
    }
}
```

`packages.properties`는 `.gitignore`에 추가해서 버전 관리에서 제외한다.

---

## 멀티 모듈 프로젝트

여러 모듈을 개별 패키지로 배포하려면 루트 `build.gradle`에 공통 publishing 설정을 정의하고 각 모듈은 버전만 관리한다.

```groovy
// 루트 build.gradle
subprojects {
    apply plugin: 'java-library'
    apply plugin: 'maven-publish'

    group = 'com.companyName'

    publishing {
        repositories {
            maven {
                name = "GitHubPackages"
                url = uri("https://maven.pkg.github.com/companyName/repository-name")
                credentials {
                    username = System.getenv("GH_CREDENTIALS_USR")
                    password = System.getenv("GH_CREDENTIALS_PSW")
                }
            }
        }
        publications {
            gpr(MavenPublication) {
                from components.java
                artifactId = project.name
            }
        }
    }
}
```

```bash
# 전체 모듈 배포
./gradlew publish

# 특정 모듈만 배포
./gradlew :common-utils:publish
```

---

## Jenkins 배포 설정

```groovy
pipeline {
    agent any

    environment {
        GH_CREDENTIALS = credentials('github-credentials')
    }

    stages {
        stage('Build') {
            steps {
                sh './gradlew clean build'
            }
        }

        stage('Publish') {
            when {
                branch 'main'
            }
            steps {
                sh './gradlew publish'
            }
        }
    }
}
```

Jenkins Credentials에 GitHub Personal Access Token을 등록하면 `GH_CREDENTIALS_USR`과 `GH_CREDENTIALS_PSW`로 자동 분리된다. `when { branch 'main' }` 조건으로 main 브랜치에서만 배포가 실행되도록 했다.

---

## 전환하면서 겪은 문제들

### SNAPSHOT 버전이 갱신되지 않는다

Gradle은 SNAPSHOT 의존성을 기본 24시간 캐시한다. 개발 중에 라이브러리를 수정하고 다시 publish해도 소비자 프로젝트에서 변경이 안 보여서 한참 헤맸다.

```groovy
configurations.all {
    resolutionStrategy.cacheChangingModulesFor 0, 'seconds'
}
```

또는 빌드 시 `--refresh-dependencies` 플래그를 붙이면 된다.

### 동일 버전 재배포 불가

GitHub Packages는 동일한 Release 버전을 덮어쓸 수 없다. S3에서는 같은 경로에 그냥 올리면 됐는데 GitHub Packages에서는 버전을 올려야 한다. 이게 개발 중에 SNAPSHOT을 쓰는 이유이기도 하다.

### 401 Unauthorized

GitHub Packages는 public 저장소의 패키지라도 읽기에 인증이 필요하다. 처음에 이걸 몰라서 토큰 없이 접근하다가 계속 401이 떴다.

---

## 참고

- [GitHub Packages — Working with the Gradle registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-gradle-registry)
- [Gradle — Maven Publish Plugin](https://docs.gradle.org/current/userguide/publishing_maven.html)