---
title: 'Kotlin DSL로 RestDocs 테스트 코드 반복을 줄인 방법'
description: 'RestDocs 컨트롤러 테스트에서 JSON 필드 설명을 하나하나 작성하는 반복 작업이 지루해서 Kotlin DSL로 간결하게 만들었다. Kotest와 확장 함수를 활용한 테스트 DSL 설계 과정을 정리한다.'
pubDate: 2023-06-20
category: 'testing'
tags: ['kotlin', 'kotest', 'dsl', 'testing', 'spring-restdocs']
draft: false
---

## 문제

RestDocs로 API 문서를 생성하려면 컨트롤러 테스트에서 JSON 필드마다 타입과 설명을 작성해야 한다. API가 늘어날수록 이 작업이 반복되고 코드도 장황해진다.

```java
@Test
void shouldCreateValidJson() {
    JsonField field = new JsonField("name", JsonFieldType.STRING, "사용자 이름");
    Assertions.assertEquals(field.getType(), JsonFieldType.STRING);
    Assertions.assertNotNull(field.getDescription());
}
```

필드가 10개인 API 하나에 이런 코드를 쓰고 API가 수십 개면 거의 복붙 작업이 된다. 더 편하고 가독성 좋게 작성할 방법을 찾다가 [토스의 Kotlin DSL RestDocs 적용 사례](https://toss.tech/article/kotlin-dsl-restdocs)를 보게 됐다. 이걸 참고해서 사내 프로젝트에 맞게 DSL을 만들었다.

---

## DSL 설계

Kotlin의 확장 함수와 중위 함수를 활용하면 테스트 코드를 이렇게 바꿀 수 있다.

```kotlin
Json {
    "name" type STRING means "사용자 이름"
    "age" type NUMBER means "사용자 나이"
    "roles" type ARRAY means "사용자 역할 목록"
    "createdAt" type DATE means "생성 날짜"
}
```

라이브러리로 만들어서 사내 프로젝트 전반에서 재사용하도록 했다.

```kotlin
implementation("com.illuminarean:test-library:$version")
```

---

## JSON 필드 DSL

### 타입 매핑

| DSL 타입 | JsonFieldType | 추가 설명 |
|---|---|---|
| `STRING` | `JsonFieldType.STRING` | - |
| `NUMBER` | `JsonFieldType.NUMBER` | - |
| `BOOLEAN` | `JsonFieldType.BOOLEAN` | - |
| `DATE` | `JsonFieldType.STRING` | `yyyy-MM-dd` 자동 추가 |
| `DATETIME` | `JsonFieldType.STRING` | `yyyy-MM-dd'T'HH:mm:ss` 자동 추가 |
| `ARRAY` | `JsonFieldType.ARRAY` | - |
| `ENUM` | `JsonFieldType.STRING` | `RestDocsEnum` 기반 description 추가 |

`DATE`와 `DATETIME`은 포맷 설명을 자동으로 붙여준다. `ENUM`은 `RestDocsEnum` 인터페이스를 구현한 클래스에서 각 값의 description을 자동으로 추출한다.

```kotlin
enum class Status(override val description: String) : RestDocsEnum {
    ACTIVE("활성화"),
    INACTIVE("비활성화")
}

Json {
    "status" type ENUM(Status::class) means "상태"
    "timestamp" type DATETIME means "요청 처리 시간"
}
```

---

## Parameter DSL

파라미터 설명도 같은 패턴으로 작성한다.

```kotlin
Parameters {
    "id" type S_STRING means "사용자 ID"
    "date" type S_DATE means "조회 날짜"
    "type" type S_ENUM(Type::class) means "유형"
}
```

| DSL 타입 | SimpleType | 추가 설명 |
|---|---|---|
| `S_STRING` | `SimpleType.STRING` | - |
| `S_NUMBER` | `SimpleType.NUMBER` | - |
| `S_DATE` | `SimpleType.STRING` | `yyyy-MM-dd` 자동 추가 |
| `S_DATETIME` | `SimpleType.STRING` | `yyyy-MM-dd'T'HH:mm:ss` 자동 추가 |
| `S_ENUM` | `SimpleType.STRING` | `RestDocsEnum` 기반 description 추가 |

---

## 제약 조건 DSL

Spring Boot 3에서 Bean Validation 패키지가 `javax`에서 `jakarta`로 변경되면서 일부 제약 조건이 문서에 반영되지 않는 문제가 생겼다. DSL에 `isA` 함수를 추가해서 제약 조건을 명시적으로 지정할 수 있게 했다.

```kotlin
Json {
    "name" type STRING means "이름" isA OPTIONAL
    "age" type NUMBER means "나이" isA REQUIRED
    "email" isA IGNORE
}
```

- `OPTIONAL` — 선택 필드
- `REQUIRED` — 필수 필드
- `IGNORE` — 문서화에서 제외

---

## 참고

- [토스 — Kotlin DSL로 RestDocs 작성하기](https://toss.tech/article/kotlin-dsl-restdocs)
- [Kotest](https://kotest.io/)
- [예제 소스 코드](https://github.com/samhyun/kotlin-test-dsl-example)
