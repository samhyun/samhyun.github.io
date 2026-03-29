---
title: 'QuerydslPredicate를 사용한 동적 쿼리 생성과 커스터마이징을 통한 확장'
description: 'Spring Data JPA의 @QuerydslPredicate를 활용하여 동적 쿼리를 생성하고, 타입 기반 커스터마이징으로 확장성과 재사용성을 높이는 방법을 정리했다.'
pubDate: 2021-07-10
category: 'spring'
tags: ['querydsl', 'spring-data', 'jpa', 'dynamic-query']
draft: false
---

목록 조회 API를 만들다 보면 검색 조건이 늘어날 때마다 `if (param != null)` 분기가 쌓인다. Spring Data JPA의 `@QuerydslPredicate`를 쓰면 요청 파라미터에서 `Predicate`를 자동 생성할 수 있는데 기본 동작만으로는 날짜 범위나 like 검색 같은 조건을 처리하기 어렵다. 타입 기반 커스터마이징으로 이 문제를 해결한 과정을 정리한다.

## 1. QuerydslPredicate로 조건문 생성

### 기본 사용법

`@QuerydslPredicate`는 컨트롤러 메서드 파라미터에 적용하여 요청 파라미터를 기반으로 `Predicate` 객체를 생성한다.

```java
@GetMapping("/posts")
public Page<PostDto> find(@QuerydslPredicate(root = Post.class) Predicate predicate,
                          @PageableDefault Pageable pageable) {
    // 생성된 predicate를 활용하여 데이터를 조회
    ...
}
```

#### 동작 예시

1. **단일 파라미터 조건**
   - 요청: `/posts?name=test`
   - 생성된 조건: `post.name.eq("test")`

2. **다중 파라미터 조건**
   - 요청: `/posts?name=test&name=test2`
   - 생성된 조건: `post.name.in("test", "test2")`

## 2. 기본 조건 생성 규칙

`@QuerydslPredicate`는 다음과 같은 기본 규칙으로 조건문을 생성한다.

- 단일 값: `eq` 조건
- 다중 값: `in` 조건

하지만 이 기본 동작만으로는 복잡한 조건을 처리하기 어렵다. 날짜 범위 검색이나 문자열 like/contains 같은 조건을 적용하려면 커스터마이징이 필요하다.

## 3. QuerydslPredicate 커스터마이징

### 3.1 QuerydslBindings를 활용한 Path 기반 커스터마이징

`QuerydslBinderCustomizer` 인터페이스의 `customize` 메서드를 오버라이드하여 원하는 조건 생성 규칙을 정의할 수 있다.
날짜 범위 검색을 처리하도록 커스터마이징한 예제다.

#### PostRepository.java

```java
@Repository
public class PostRepository implements QuerydslBinderCustomizer<QPost> {
    @Override
    public void customize(QuerydslBindings bindings, QPost post) {
        bindings.bind(post.createdAt)
                .all((path, value) -> {
                    List<? extends Date> dates = new ArrayList<>(value);
                    if (dates.size() == 1) {
                        return Optional.of(post.createdAt.eq(dates.get(0)));
                    } else {
                        return Optional.of(post.createdAt.between(dates.get(0), dates.get(1)));
                    }
                });
    }
}
```

### 동작 확인을 위한 테스트 코드

```java
public class PostQuerydslBindingTest {
    private QuerydslPredicateArgumentResolver resolver;
    private MockHttpServletRequest request;
    private DateFormat dateFormat;

    @BeforeEach
    void setUp() {
        this.resolver = new QuerydslPredicateArgumentResolver(
                new QuerydslBindingsFactory(SimpleEntityPathResolver.INSTANCE),
                Optional.of(new DefaultFormattingConversionService())
        );
        this.request = new MockHttpServletRequest();
        this.dateFormat = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX");
    }

    @Test
    public void binding_date_parameters_test() throws Exception {
        Date startAt = Date.from(LocalDateTime.now().minusDays(30)
                .atZone(ZoneId.systemDefault()).toInstant());
        Date endAt = new Date();

        request.addParameter("createdAt", dateFormat.format(startAt));
        request.addParameter("createdAt", dateFormat.format(endAt));

        Object predicate = resolver.resolveArgument(
                new MethodParameter(PostApi.class.getMethod("find", Predicate.class), 0),
                null,
                new ServletWebRequest(request),
                null
        );

        assertNotNull(predicate);
        assertEquals(post.createdAt.between(startAt, endAt), predicate);
    }

    interface PostApi {
        void find(@QuerydslPredicate(root = Post.class, bindings = PostRepository.class) Predicate predicate);
    }
}
```

테스트를 통해 `createdAt` 필드에 대한 between 조건이 정상적으로 생성되었음을 확인할 수 있다.

### 3.2 데이터 타입 기반 커스터마이징

3.1처럼 필드별로 바인딩을 정의하면 엔티티마다 같은 규칙을 반복하게 된다. `QuerydslBinderCustomizer`는 데이터 타입 기반의 조건문 생성도 지원하므로 공통 규칙을 한 곳에 모을 수 있다.

#### CustomQuerydslBinderCustomizer.java

```java
public interface CustomQuerydslBinderCustomizer<T extends EntityPath<?>>
        extends QuerydslBinderCustomizer<T> {

    void addCustomization(QuerydslBindings bindings, T entityPath);

    @Override
    default void customize(QuerydslBindings bindings, T entityPath) {
        // Date 타입 바인딩: 1개 -> eq, 2개 -> between
        bindings.bind(Date.class).all((path, value) -> {
            List<? extends Date> dates = new ArrayList<>(value);
            if (dates.size() == 1) {
                return Optional.of(((DateTimePath) path).eq(dates.get(0)));
            } else {
                return Optional.of(((DateTimePath) path).between(dates.get(0), dates.get(1)));
            }
        });

        // String 타입 바인딩: % 시작 -> like, 기본 -> eq, 다중 -> in
        bindings.bind(String.class).all((path, value) -> {
            List<? extends String> values = new ArrayList<>(value);
            if (values.size() == 1) {
                String searchWord = values.get(0);
                if (searchWord.startsWith("%")) {
                    return Optional.of(((StringPath) path).like(searchWord));
                } else {
                    return Optional.of(((StringPath) path).eq(searchWord));
                }
            } else {
                return Optional.of(((StringPath) path).in(values));
            }
        });

        // 추가 커스터마이징 적용
        addCustomization(bindings, entityPath);
    }
}
```

### 3.3 커스터마이징 적용

`CustomQuerydslBinderCustomizer`를 적용한 `PostRepository` 예제다.

```java
@Repository
public class PostRepository implements CustomQuerydslBinderCustomizer<QPost> {
    @Override
    public void addCustomization(QuerydslBindings bindings, QPost entityPath) {
        // 특정 필드에 대한 추가 커스터마이징
        bindings.bind(post.content).first(StringExpression::contains);
    }
}
```

### 동작 확인을 위한 테스트 코드

```java
@Test
public void binding_string_parameters_test() throws Exception {
    request.addParameter("writer.nickname", "%test%");
    request.addParameter("title", "test");
    request.addParameter("title", "test1");
    request.addParameter("content", "test");

    Object predicate = resolver.resolveArgument(
            new MethodParameter(PostApi.class.getMethod("find", Predicate.class), 0),
            null,
            new ServletWebRequest(request),
            null
    );

    assertNotNull(predicate);
    assertEquals(post.writer.nickname.like("%test%")
                    .and(post.title.in("test", "test1"))
                    .and(post.content.contains("test")),
            predicate);
}
```

커스터마이징된 규칙에 따라 조건문이 생성되었음을 확인할 수 있다.

## 4. 주의할 점

- `@QuerydslPredicate`가 자동 생성하는 조건은 엔티티 필드명과 요청 파라미터명이 일치해야 한다. 프론트에서 쓰는 파라미터명이 다르면 alias 처리가 필요하다.
- 타입 기반 바인딩은 모든 같은 타입 필드에 일괄 적용되므로 특정 필드만 다르게 동작해야 하는 경우 `addCustomization`에서 개별 오버라이드해야 한다.
- `Collection` 파라미터의 순서가 보장되지 않으므로 날짜 범위처럼 순서가 중요한 경우 정렬 처리를 넣는 게 안전하다.

---

## 참고

- [Spring Data Commons — QuerydslPredicateExecutor](https://github.com/spring-projects/spring-data-commons)
- [Sample Repository](https://github.com/samhyun/querydsl-study)
