---
title: 'Swagger UI를 활용한 공용 API 문서 서버 구성'
description: '분산된 Spring RestDocs 문서를 Swagger UI로 통합하고 epages-restdocs 플러그인과 Jenkins CI/CD를 활용해 자동화된 API 문서 서버를 구축한 과정을 정리한다.'
pubDate: 2023-04-05
category: 'devops'
tags: ['swagger', 'openapi', 'docker', 'api-docs', 'spring-restdocs']
draft: false
---

## 문제 상황

사내 Java 백엔드 서비스들은 Spring RestDocs로 API 문서를 생성하고 있었다. 서비스 수가 늘어나면서 두 가지 문제가 생겼다.

- **문서 분산**: 특정 API를 찾으려면 어떤 서비스에 있는지부터 파악해야 했다. 공통 API 정보도 여러 문서에 흩어져 있어서 탐색에 시간이 걸렸다.
- **테스트 불편**: RestDocs는 API 테스트 인터페이스를 제공하지 않는다. Postman을 별도로 띄워야 했다.

하나의 서버에서 전체 API 문서를 확인하고 바로 테스트할 수 있는 환경이 필요했다.

---

## Swagger UI 서버 구성

Swagger UI를 Docker로 띄우고 각 서비스의 OpenAPI Spec 파일을 마운트하는 구조다.

### Docker Compose

```yml
version: '3'
services:
  swagger:
    image: swaggerapi/swagger-ui
    container_name: swagger-ui
    env_file: .env
    ports:
      - 8888:8080
    volumes:
      - ./data/dist:/usr/share/nginx/html/apis
    restart: unless-stopped
```

`./data/dist` 디렉토리에 각 서비스의 OAS JSON 파일을 넣으면 Swagger UI에서 바로 접근할 수 있다.

### 환경 변수 (.env)

```bash
BASE_URL=/swagger
QUERY_CONFIG_ENABLED=true
URLS=[{ url: './apis/service1.json', name: 'service1'}, { url: './apis/service2.json', name: 'service2'}]
```

`URLS`에 등록한 서비스가 Swagger UI 상단 드롭다운에 표시된다.

### swagger-initializer.js 커스터마이징

기본 설정 외에 세밀한 제어가 필요하면 `swagger-initializer.js`를 직접 마운트한다.

```javascript
window.onload = function() {
  window.ui = SwaggerUIBundle({
    urls: [
      { url: "./apis/service1.json", name: "Service 1" },
      { url: "./apis/service2.json", name: "Service 2" },
    ],
    dom_id: '#swagger-ui',
    deepLinking: true,
    presets: [
      SwaggerUIBundle.presets.apis,
      SwaggerUIStandalonePreset
    ],
    plugins: [
      SwaggerUIBundle.plugins.DownloadUrl
    ],
    layout: "StandaloneLayout",
    defaultModelsExpandDepth: -1,     // 하단 Model 섹션 숨김
    docExpansion: "list",             // API 목록만 펼치고 상세는 접힌 상태
    filter: true,                     // 검색 필터 활성화
    tryItOutEnabled: true,            // Try it out 기본 활성화
    requestInterceptor: (req) => {
      // 공통 인증 헤더 자동 추가
      req.headers['X-API-KEY'] = 'your-api-key';
      return req;
    }
  });
};
```

Docker Compose에서 마운트한다.

```yml
volumes:
  - ./data/dist:/usr/share/nginx/html/apis
  - ./swagger-initializer.js:/usr/share/nginx/html/swagger-initializer.js
```

주요 설정 옵션은 다음과 같다.

| 옵션 | 설명 | 권장값 |
|---|---|---|
| `defaultModelsExpandDepth` | Model 섹션 표시 깊이 (-1: 숨김) | `-1` |
| `docExpansion` | API 목록 펼침 수준 (none/list/full) | `"list"` |
| `filter` | 상단 검색 필터 활성화 | `true` |
| `tryItOutEnabled` | Try it out 버튼 기본 활성화 | `true` |
| `persistAuthorization` | 인증 정보 브라우저 저장 | `true` |

---

## OpenAPI Spec 생성 (epages-restdocs)

기존 Spring RestDocs 테스트 코드에서 OpenAPI Spec JSON을 자동 생성하는 플러그인이다. RestDocs 기반 테스트를 유지하면서 Swagger UI용 OAS 파일을 함께 만들 수 있다.

### 1. Gradle 플러그인 설정

```gradle
plugins {
    id 'com.epages.restdocs-api-spec' version '0.18.2'
}

openapi3 {
    setServer("https://api.example.com")
    title = "My Service API"
    description = "API documentation for My Service"
    version = "1.0.0"
    format = "json"               // json 또는 yaml
    outputDirectory = "build/api-spec"
    outputFileNamePrefix = "my-service-api"
}
```

### 2. OpenAPI Spec 생성 코드 예시

기존 RestDocs 테스트 코드에 `ResourceSnippetParameters`만 추가하면 된다.

```java
resultActions
  .andDo(
    MockMvcRestDocumentationWrapper.document(operationName,
      ResourceDocumentation.resource(
        ResourceSnippetParameters.builder()
          .tag("User API")                    // Swagger UI 태그 그룹핑
          .summary("사용자 정보 조회")           // API 요약
          .description("사용자 ID로 상세 정보를 조회한다.")
          .build()
      ),
      requestFields(new FieldDescriptors().getFieldDescriptors()),
      responseFields(
        fieldWithPath("comment").description("the comment"),
        fieldWithPath("flag").description("the flag"),
        fieldWithPath("count").description("the count"),
        fieldWithPath("id").description("id"),
        fieldWithPath("_links").ignored()
      ),
      links(linkWithRel("self").description("some"))
  )
);
```

`tag`로 Swagger UI에서 API를 그룹핑하고 `summary`/`description`으로 각 API의 설명을 표시할 수 있다.

### 3. OAS 문서 생성 실행

```bash
# OpenAPI 3.0 스펙 생성
./gradlew openapi3

# 생성 결과 확인
ls build/api-spec/
# my-service-api.json
```

생성된 JSON 파일을 Swagger UI 서버의 `data/dist` 디렉토리에 업로드하면 된다.

---

## Jenkins CI/CD 연동

빌드 시 OAS 문서를 생성하고 배포 단계에서 Swagger UI 서버로 자동 업로드하도록 구성했다. API가 변경될 때마다 문서가 자동으로 갱신된다.

```groovy
pipeline {
    agent any

    stages {
        stage('Build & Generate API Spec') {
            steps {
                sh './gradlew clean build openapi3'
            }
        }

        stage('Upload API Docs') {
            steps {
                sh """
                    scp -o StrictHostKeyChecking=no \
                        my-service/build/api-spec/my-service-api.json \
                        ubuntu@xxx.xxx.xxx.xxx:/home/ubuntu/swagger-ui/data/dist/
                """
            }
        }
    }

    post {
        success {
            echo 'API 문서가 성공적으로 업데이트되었다.'
        }
    }
}
```

---

## 신규 서비스 온보딩

새로운 서비스를 Swagger UI에 추가할 때는 다음 절차를 따른다.

### 1. 서비스 프로젝트에 epages-restdocs 설정 추가

```gradle
plugins {
    id 'com.epages.restdocs-api-spec' version '0.18.2'
}

openapi3 {
    setServer("https://api.example.com")
    title = "New Service API"
    version = "1.0.0"
    format = "json"
    outputDirectory = "build/api-spec"
    outputFileNamePrefix = "new-service-api"
}
```

### 2. Swagger UI .env 파일에 URL 추가

```bash
URLS=[{ url: './apis/service1.json', name: 'service1'}, { url: './apis/service2.json', name: 'service2'}, { url: './apis/new-service-api.json', name: 'new-service'}]
```

### 3. Swagger UI 컨테이너 재시작

```bash
docker compose restart swagger
```

### .env 자동 생성 스크립트

서비스가 많아지면 수동으로 `.env`를 관리하기 어렵다. `data/dist` 디렉토리의 JSON 파일을 자동 탐색해서 `.env`를 생성하는 스크립트를 만들었다.

```bash
#!/bin/bash
# generate-env.sh — data/dist 내 JSON 파일로 .env 자동 생성

API_DIR="./data/dist"
ENV_FILE=".env"

URLS="URLS=["
first=true

for file in "$API_DIR"/*.json; do
    filename=$(basename "$file")
    name="${filename%.json}"

    if [ "$first" = true ]; then
        first=false
    else
        URLS+=", "
    fi
    URLS+="{ url: './apis/$filename', name: '$name'}"
done
URLS+="]"

cat > "$ENV_FILE" <<EOF
BASE_URL=/swagger
QUERY_CONFIG_ENABLED=true
$URLS
EOF

echo ".env 파일이 생성되었다."
docker compose restart swagger
```

Jenkins 파이프라인의 Upload 단계 이후에 이 스크립트를 실행하면 신규 서비스 추가 시 `.env` 수정 없이 자동으로 반영된다.

---

## 트러블슈팅

### CORS 에러로 Try it out이 동작하지 않는 경우

Swagger UI에서 API를 테스트할 때 CORS 에러가 발생할 수 있다. 백엔드 서비스에 Swagger UI 도메인을 허용하는 CORS 설정을 추가한다.

```java
@Configuration
public class CorsConfig implements WebMvcConfigurer {
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/**")
            .allowedOrigins("https://swagger.example.com")
            .allowedMethods("GET", "POST", "PUT", "DELETE", "PATCH")
            .allowedHeaders("*");
    }
}
```

### Mixed Content 에러 (HTTPS → HTTP)

Swagger UI를 HTTPS로 서빙하는데 API 서버가 HTTP인 경우 브라우저가 요청을 차단한다.

- **해결 1**: OAS 생성 시 `setServer`를 HTTPS URL로 설정
- **해결 2**: 리버스 프록시(Nginx)를 사용하여 HTTPS 종단 처리

```nginx
server {
    listen 443 ssl;
    server_name swagger.example.com;

    ssl_certificate     /etc/ssl/certs/cert.pem;
    ssl_certificate_key /etc/ssl/private/key.pem;

    location / {
        proxy_pass http://localhost:8888;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### OAS 파일이 갱신되었는데 Swagger UI에 반영되지 않는 경우

브라우저 캐시 문제일 수 있다. `swagger-initializer.js`에서 캐시 버스팅을 추가한다.

```javascript
urls: [
  { url: `./apis/service1.json?v=${Date.now()}`, name: "Service 1" },
],
```

---

---

## 참고

- [Swagger UI Docker](https://github.com/swagger-api/swagger-ui/blob/master/docs/usage/installation.md)
- [epages-restdocs-api-spec](https://github.com/ePages-de/restdocs-api-spec)
