---
title: 'Querydsl Web Support의 Entity 노출 문제를 Alias 아키텍처로 해결하기'
description: 'Spring Data의 Querydsl Web Support에 Alias 시스템을 도입하여 Entity 노출 문제를 해결하고, API 스펙의 안정성과 문서화를 Single Source of Truth로 관리하는 아키텍처를 설계했다.'
pubDate: 2025-02-15
category: 'spring'
tags: ['querydsl', 'spring-data', 'kotlin', 'architecture', 'rest-api']
featured: true
draft: false
---

Spring Data의 Querydsl Web Support는 편리하지만 API 파라미터명이 엔티티 필드명에 직접 의존하는 문제가 있다. 엔티티를 리팩토링하면 API 스펙이 깨지고 내부 도메인 모델이 외부에 그대로 노출된다. Alias 시스템을 도입해서 이 문제를 해결하고 문서화까지 Single Source of Truth로 관리하는 아키텍처를 설계했다.

## Querydsl Web Support 장단점

### 장점
1. **빠른 개발**: 엔티티만 있으면 즉시 검색 API 제공
2. **일관성**: 모든 필터가 동일한 방식으로 동작
3. **유연성**: `QuerydslBinderCustomizer`로 커스터마이징 가능
4. **타입 안전성**: 컴파일 타임 검증

### 단점 (기존)
1. **Entity 노출 우려**: API가 내부 도메인 모델에 직접 의존
2. **암묵적 API 스펙**: 어떤 필터가 가능한지 문서화 필요
3. **학습 곡선**: 팀 전체가 이해해야 함

### 단점 해결 (Alias 아키텍처)
- Entity 노출 → **Alias 시스템으로 완전 은닉**
- 암묵적 스펙 → `documentation()` 메서드로 **명시적 문서화**
- 학습 곡선 → 여전히 존재하나 **패턴화로 완화**

### 설계 범위

Querydsl Web Support는 **Request 파라미터 → WHERE 조건 변환**이 목적이므로 복잡한 JOIN/서브쿼리는 설계 범위 밖이다. Custom Repository와 함께 사용하면 된다.

```kotlin
// Web Support: 필터 조건 자동 처리
@GetMapping("/orders")
fun findOrders(
    @QuerydslPredicate(bindings = OrderBindings::class) predicate: Predicate
): List<Order> {
    return orderRepository.findWithDetails(predicate)
}

// Custom Repository: 복잡한 쿼리 + Predicate 조합
fun findWithDetails(predicate: Predicate): List<Order> {
    return queryFactory
        .selectFrom(order)
        .join(order.customer, customer).fetchJoin()
        .join(order.items, item).fetchJoin()
        .where(predicate)  // Web Support에서 받은 조건 재활용!
        .fetch()
}
```

## Entity 노출 논쟁과 해결

### 기존 비판
- API 파라미터명 = 엔티티 필드명
- 엔티티 변경 → API 스펙 변경 (Breaking Change)
- 내부 구조가 외부에 그대로 노출
- 클라이언트가 도메인 모델을 알아야 함

### Alias 아키텍처로 해결
- API 파라미터명 = **alias** (명시적 정의)
- 엔티티 변경해도 alias 유지하면 **API 스펙 유지**
- 내부 구조 **완전 은닉**
- 클라이언트는 **alias만** 알면 됨

### 실제 시나리오

```kotlin
// 초기 설계
"userName" alias "name" desc "사용자 이름" ...

// 엔티티 리팩토링 (userName → fullName)
"fullName" alias "name" desc "사용자 이름" ...  // API 변경 없음!
```

클라이언트: `GET /users?name=홍길동`

- v1: name → userName → QUser.user.userName
- v2: name → fullName → QUser.user.fullName ← **클라이언트 코드 변경 불필요!**

### 적용 기준
- **Public API**: Alias 필수 (Strict Mode) — 계약 안정성
- **Admin/Internal API**: Alias 선택적 — 개발 생산성 우선

---

## DefaultQuerydslBinderCustomizer 패턴

기본 바인딩 규칙을 공통화하여 반복 코드를 제거한다.

```kotlin
interface DefaultQuerydslBinderCustomizer<T : EntityPath<*>> : QuerydslBinderCustomizer<T> {
    override fun customize(bindings: QuerydslBindings, root: T) {
        // 기본 바인딩: String은 contains, 나머지는 eq
        bindings.bind(String::class.java).all { path, value ->
            val values = value.toList()
            if (values.size == 1) {
                (path as StringPath).containsIgnoreCase(values[0])
            } else {
                (path as StringPath).`in`(values)
            }.toOptional()
        }
    }
}
```

## FilterDoc DSL

필터 문서화를 위한 Kotlin DSL이다. Bindings 클래스에서 **구현과 문서를 한 곳에서 관리**한다.

```kotlin
data class FilterDoc(
    val fieldName: String,
    val alias: String?,
    val description: String,
    val type: String,
    val required: Boolean,
    val example: String?,
    val pattern: String?,
)

class FilterDocBuilder(private val fieldName: String) {
    private var alias: String? = null
    private var desc: String = ""
    private var type: String = "String"
    private var required: Boolean = false
    private var example: String? = null
    private var pattern: String? = null

    infix fun alias(alias: String) = apply { this.alias = alias }
    infix fun desc(desc: String) = apply { this.desc = desc }
    infix fun type(type: String) = apply { this.type = type }
    fun required() = apply { this.required = true }
    infix fun example(example: String) = apply { this.example = example }
    infix fun pattern(pattern: String) = apply { this.pattern = pattern }
    fun build() = FilterDoc(fieldName, alias, desc, type, required, example, pattern)
}
```

## BaseBindings 추상 클래스

모든 Bindings의 베이스 클래스다.

```kotlin
abstract class BaseBindings<T : EntityPath<*>> : DefaultQuerydslBinderCustomizer<T> {
    abstract fun documentation(): List<FilterDoc>

    fun allExampleParams(): Map<String, String> =
        documentation().associate { (it.alias ?: it.fieldName) to (it.example ?: "") }

    fun requiredExampleParams(): Map<String, String> =
        documentation().filter { it.required }
            .associate { (it.alias ?: it.fieldName) to (it.example ?: "") }

    fun optionalExampleParams(): Map<String, String> =
        documentation().filter { !it.required }
            .associate { (it.alias ?: it.fieldName) to (it.example ?: "") }
}
```

## 사용 예시: UserBindings

```kotlin
class UserBindings : BaseBindings<QUser>() {
    override fun customize(bindings: QuerydslBindings, root: QUser) {
        super.customize(bindings, root)

        bindings.bind(root.userName).as("name")
            .first { _, value -> root.userName.containsIgnoreCase(value) }

        bindings.bind(root.email).as("email")
            .first { _, value -> root.email.eq(value) }

        bindings.bind(root.status).as("status")
            .first { _, value -> root.status.eq(value) }
    }

    override fun documentation(): List<FilterDoc> = listOf(
        "userName" alias "name" desc "사용자 이름" type "String" example "홍길동",
        "email" alias "email" desc "이메일" type "String" example "user@test.com",
        "status" alias "status" desc "상태" type "Enum" example "ACTIVE",
    ).map { it.build() }
}
```

## AliasAwareQuerydslArgumentResolver

alias를 실제 필드명으로 변환하고 required/pattern 검증을 수행하는 커스텀 ArgumentResolver다.

```kotlin
class AliasAwareQuerydslArgumentResolver(
    private val bindingsMap: Map<KClass<*>, BaseBindings<*>>,
    querydslPredicateBuilder: QuerydslPredicateBuilder,
    resolver: ConversionService
) : QuerydslPredicateArgumentResolver(querydslPredicateBuilder, resolver) {

    override fun resolveArgument(
        parameter: MethodParameter,
        mavContainer: ModelAndViewContainer?,
        webRequest: NativeWebRequest,
        binderFactory: WebDataBinderFactory?
    ): Predicate? {
        val annotation = parameter.getParameterAnnotation(QuerydslPredicate::class.java)
        val bindingsClass = annotation?.bindings?.kotlin ?: return super.resolveArgument(...)
        val bindings = bindingsMap[bindingsClass] ?: return super.resolveArgument(...)
        val docs = bindings.documentation()

        // 1) required 검증
        docs.filter { it.required }.forEach { doc ->
            val paramName = doc.alias ?: doc.fieldName
            if (webRequest.getParameter(paramName).isNullOrBlank()) {
                throw MissingServletRequestParameterException(paramName, doc.type)
            }
        }

        // 2) pattern 검증
        docs.filter { it.pattern != null }.forEach { doc ->
            val paramName = doc.alias ?: doc.fieldName
            val value = webRequest.getParameter(paramName)
            if (value != null && !value.matches(Regex(doc.pattern!!))) {
                throw IllegalArgumentException("$paramName 형식이 올바르지 않다: ${doc.pattern}")
            }
        }

        // 3) alias → 실제 필드명 변환
        val translated = AliasTranslatingWebRequest(webRequest, docs)
        return super.resolveArgument(parameter, mavContainer, translated, binderFactory)
    }
}
```

## Spring REST Docs 연동

Bindings의 `documentation()`에서 자동으로 REST Docs 파라미터를 생성한다.

```kotlin
fun BaseBindings<*>.toRequestParameters(): List<ParameterDescriptor> =
    documentation().map { doc ->
        val paramName = doc.alias ?: doc.fieldName
        parameterWithName(paramName)
            .description("${doc.description} (${doc.type})")
            .apply { if (!doc.required) optional() }
    }
```

## 아키텍처 장점 요약

| 관점 | 개선 효과 |
|-----|---------|
| **API 설계** | Entity와 독립적인 파라미터 네이밍 |
| **유지보수** | Entity 리팩토링해도 API 하위호환 유지 |
| **보안** | 내부 도메인 모델 완전 은닉 |
| **문서화** | Single Source of Truth (Bindings) |
| **검증** | required/pattern을 ArgumentResolver에서 자동 처리 |
| **테스트** | 예시 파라미터 자동 생성 (전체/필수/선택) |
| **유연성** | Public/Admin API 별 정책 적용 가능 |
| **가독성** | DSL 스타일로 필터 스펙이 한눈에 |

## 주의사항

1. **Alias Only 정책**: alias 등록 시 원본 필드명으로는 접근 불가
2. **bindings 명시적 지정**: `@QuerydslPredicate(bindings = ...)` 필수
3. **Strict Mode**: Public API는 `strictMode = true` 권장
4. **documentation() 동기화**: 문서화 정보와 실제 바인딩이 일치해야 함
5. **패턴 검증**: pattern은 값이 있을 때만 검증 (선택 파라미터 허용)

---

## 참고

- [Spring Data Commons — Querydsl Web Support](https://docs.spring.io/spring-data/commons/reference/repositories/core-extensions.html#core.web.type-safe)
