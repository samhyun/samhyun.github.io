---
title: '멀티 에이전트 챗봇에 다국어를 넣으려면 — 싱글톤 제약 아래의 설계 판단'
description: 'Google ADK 기반 멀티 에이전트 챗봇을 다국어로 확장하기 위해 5가지 방법을 검토하고 3가지를 탈락시킨 과정. 싱글톤 에이전트의 불변 instruction이라는 제약 아래에서 내린 설계 판단을 정리한다.'
pubDate: 2026-03-01
category: 'ai'
tags: ['llm', 'multi-agent', 'i18n', 'internationalization', 'google-adk']
draft: false
---

한 국가에서 운영 중이던 B2B 멀티 에이전트 챗봇을 다른 국가로 확장해야 하는 상황이 생겼다. 단순히 응답 언어만 바꾸면 될 것 같지만 실제로는 에이전트 instruction, 지역 데이터, 연락처, 톤앤매너까지 국가별로 달라져야 한다. 5가지 방법을 검토했고 그중 3가지를 탈락시킨 과정을 정리한다.

---

## 출발점: instruction이 불변이다

Google ADK(Java)에서 에이전트는 서버 시작 시 싱글톤으로 생성된다.

```java
public static final BaseAgent ROOT_AGENT = initAgent();

// 생성자에서 모든 에이전트를 초기화하면 instruction이 고정된다
public ChatbotRootAgent() {
    intentAgent = IntentAgent.create(model);
    explainAgent = ExplainAgent.create(model);
    // ... 20개 이상의 에이전트
}
```

`LlmAgent.builder().instruction(...)` 호출 시점에 instruction이 불변으로 고정된다. 서버가 뜬 후에는 바꿀 수 없다. 이 제약이 다국어 설계의 출발점이었다.

### 국가별로 달라져야 하는 것들

| 영역 | 예시 |
|---|---|
| Agent instruction | 언어 지시문, 국가별 비즈니스 규칙 |
| 지역 데이터 | 도시 목록, 좌표, 지역 코드 |
| 연락처 | 국가별 고객센터, 메신저 채널 |
| 톤앤매너 | 존댓말 여부, 호칭, 격식 수준 |
| 제품/가격 | 통화, 국가별 제품 라인업 |

---

## 검토한 5가지 방법

### 방법 1: Session State 템플릿팅

ADK 내장 기능으로 instruction 내의 `{key}` 플레이스홀더를 Session State 값으로 자동 치환한다.

```java
// instruction에 플레이스홀더를 넣고
.instruction("""
    Language: {language_directive}
    Region: {region_name}
    Contact: {support_contact}
    """)

// 세션 생성 시 국가에 맞는 값을 주입한다
session.state = {
    "language_directive": "한국어로 응답. 존댓말 사용.",
    "region_name": "Korea",
    "support_contact": "고객센터 번호"
}
```

ADK가 기본 제공하는 기능이라 구현이 간단하다. 다만 모든 에이전트의 instruction을 수정해야 하고 조건부 로직("한국이면 A 규칙, 태국이면 B 규칙")은 표현하기 어렵다. 단순 문자열 치환에 적합하다.

### 방법 2: beforeModelCallback Injection

LLM 호출 직전에 실행되는 콜백에서 locale별 overlay instruction을 동적으로 주입한다.

```java
public static Maybe<LlmResponse> beforeCallback(
        CallbackContext ctx, LlmRequest.Builder builder) {
    String locale = (String) ctx.state().get("user_locale");
    String overlay = LocaleInstructionProvider.getOverlay(locale);

    if (!overlay.isEmpty()) {
        LlmRequest req = builder.build();
        List<String> instructions = new ArrayList<>(req.getSystemInstructions());
        instructions.add(overlay);
        builder.systemInstructions(instructions);
    }
    return Maybe.empty();
}
```

기존 에이전트 코드를 건드리지 않고 콜백 한 곳에서 모든 locale을 관리할 수 있다. 조건부 로직도 자유롭게 넣을 수 있다. 단점은 system instruction에 overlay가 추가되므로 토큰이 늘어난다는 점과 디버깅 시 실제로 전송된 instruction을 확인하는 과정이 필요하다는 점이다.

### 방법 3: 국가별 에이전트 라우팅

국가마다 별도의 에이전트 인스턴스를 만들고 RootAgent에서 locale에 따라 라우팅한다.

```java
LlmAgent explainAgent_KR = ExplainAgent.create(model, "ko_KR");
LlmAgent explainAgent_TH = ExplainAgent.create(model, "th_TH");

private Flowable<Event> routeToExplainAgent(InvocationContext ctx) {
    String locale = readString(ctx, "user_locale");
    return switch (locale) {
        case "ko_KR" -> explainAgent_KR.runAsync(ctx);
        case "th_TH" -> explainAgent_TH.runAsync(ctx);
        default -> explainAgent_DEFAULT.runAsync(ctx);
    };
}
```

### 방법 4: Multi-tenant Agent Pool

서버 시작 시 모든 locale의 에이전트를 미리 생성해두고 Pool에서 꺼내 쓴다.

```java
public class AgentPool {
    private final Map<String, Map<String, BaseAgent>> pool = new ConcurrentHashMap<>();

    public AgentPool() {
        for (String locale : List.of("ko_KR", "th_TH", "vi_VN")) {
            pool.put(locale, createAgentsForLocale(locale));
        }
    }
}
```

### 방법 5: InstructionProvider 함수

ADK의 `instructionProvider`로 매 호출마다 동적으로 instruction을 생성한다.

```java
.instructionProvider(ctx -> {
    String locale = ctx.session().state().get("user_locale");
    String base = "You are ExplainAgent...";
    return base + "\n" + getLocaleOverlay(locale);
})
```

---

## 3가지를 탈락시킨 이유

### 방법 3 탈락 — 에이전트 수 폭증

이 프로젝트는 에이전트가 20개 이상이다. 5개국을 지원하면 **20 × 5 = 100개 이상**의 에이전트 인스턴스가 필요하다. 에이전트마다 라우팅 로직을 넣어야 하고 국가가 추가될 때마다 모든 라우팅을 수정해야 한다. 국가 간 비즈니스 로직이 완전히 다르면 의미가 있지만 우리의 경우 대부분 instruction의 언어와 톤앤매너만 달라지므로 이 정도의 복잡성은 과도하다.

### 방법 4 탈락 — 아키텍처 변경 범위가 크다

Agent Pool 방식은 ADK의 `AdkWebServer`를 사용할 수 없다. 자체 Runner와 Session 관리를 직접 구현해야 한다. 개발/디버깅 시 ADK Dev UI를 쓸 수 없게 되는 것도 문제다. 메모리 사용량도 에이전트 수 × 국가 수만큼 증가한다. 기존 아키텍처를 크게 바꿔야 하는데 그만한 이유가 없었다.

### 방법 5 탈락 — Java ADK에서 지원이 불확실하다

ADK 공식 문서에서 `instructionProvider`는 Python/TypeScript에서는 명확하게 지원하지만 Java SDK에서는 동작 여부가 불확실했다. 실제로 `Supplier<String>`으로 넘겨보는 테스트를 했지만 안정적으로 동작한다는 확신을 얻지 못했다. 프로덕션에 넣기에는 리스크가 있었다.

---

## 최종 선택: 방법 1 + 2 조합

```
방법 1 — 단순 값 치환 담당
  연락처, 지역명, 통화 코드 같은 정적 데이터
  에이전트 instruction에 {placeholder}를 삽입

방법 2 — 복잡한 언어 규칙 담당
  "한국어 존댓말로 응답하라", "태국어 경어체를 사용하라" 같은 조건부 로직
  beforeModelCallback에서 system instruction에 추가
  기존 에이전트 코드 수정 불필요
```

**이 조합을 선택한 기준**

1. **기존 코드 변경 최소화** — 20개 이상의 에이전트 코드를 전면 수정하는 건 리스크가 크다. 방법 2의 콜백은 한 곳만 수정하면 된다.
2. **에이전트 수를 유지** — 방법 3, 4처럼 국가 수만큼 에이전트를 복제하면 유지보수가 기하급수적으로 복잡해진다.
3. **ADK 내장 기능만 사용** — ADK가 공식 지원하는 Session State 치환과 beforeCallback만 사용한다. 커스텀 구현이나 불확실한 기능에 의존하지 않는다.
4. **국가 추가가 간단** — 새 국가를 추가할 때 `LocaleInstructionProvider`에 overlay를 추가하고 State에 지역 데이터를 넣으면 된다. 에이전트 코드를 건드릴 필요가 없다.

---

## 다국어 챗봇에서 번역보다 중요한 것

다국어 지원을 검토하면서 느낀 건 **언어 번역은 문제의 일부**일 뿐이라는 점이다. 실제로 더 까다로운 건 국가별 커뮤니케이션 문화다.

- 어떤 국가는 존댓말 체계가 복잡하고 어떤 국가는 캐주얼해도 괜찮다
- 고객 호칭이 국가마다 다르다 (고객님, Quý khách, Bapak/Ibu 등)
- 선호하는 연락 채널이 다르다 (전화, WhatsApp, LINE, Zalo)
- B2B 맥락에서의 격식 수준이 다르다

이런 차이를 instruction에 반영하려면 단순 템플릿 치환(방법 1)만으로는 부족하고 조건부 로직을 넣을 수 있는 콜백(방법 2)이 필요했다. 이것도 방법 1+2 조합을 선택한 이유 중 하나다.

---

## 참고

- [Google ADK Documentation](https://google.github.io/adk-docs/)
