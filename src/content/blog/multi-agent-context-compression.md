---
title: '멀티 에이전트 챗봇에서 컨텍스트 윈도우 관리하기 — 토큰 추정 Fallback 체인과 LLM 기반 압축'
description: 'Google ADK 기반 멀티 에이전트 시스템에서 대화가 길어질수록 토큰이 폭증하는 문제를 해결하기 위해 적용한 토큰 추정 Fallback 체인, State 정리, LLM 기반 대화 요약 압축 전략을 정리한다.'
pubDate: 2026-01-20
category: 'ai'
tags: ['llm', 'multi-agent', 'context-window', 'token-optimization', 'google-adk']
featured: true
draft: false
---

멀티 에이전트 챗봇을 운영하다 보면 대화가 길어질수록 컨텍스트 윈도우가 빠르게 차오른다. 특히 RAG 검색 결과, 상품 상세 JSON, Tool 호출 결과 등이 세션에 누적되면 몇 턴 만에 토큰 한도에 도달하는 경우가 발생한다.

Google ADK 기반 HVAC 챗봇 프로젝트에서 이 문제를 해결하기 위해 적용한 컨텍스트 압축 전략을 정리한다.

---

## 문제: 컨텍스트가 왜 빠르게 차는가

멀티 에이전트 시스템에서 컨텍스트 폭증의 주요 원인은 다음과 같다.

| 원인 | 토큰 규모 | 설명 |
|---|---|---|
| RAG 검색 결과 (`candidate_docs`) | 2,000\~5,000 | Milvus 벡터 검색 결과 문서 청크 |
| 상품 상세 데이터 (`product_detail_data:*`) | 2,000+ / 건 | 외부 API에서 조회한 JSON 스펙 |
| 대화 이력 | 턴당 500\~2,000 | 사용자 질문 + 에이전트 응답 누적 |
| Tool 정의 | 1,000\~2,000 | Function calling 스키마 |
| 에이전트 instruction | 1,000\~3,000 | 시스템 프롬프트 |

상품 추천 → 비교 → 견적 같은 다단계 대화에서는 **5\~7턴 만에 8,000 토큰을 초과**하는 상황이 빈번했다.

---

## 해결 전략: 3계층 접근

컨텍스트 관리를 세 계층으로 나누어 접근했다.

```
계층 1: 토큰 추정 — Fallback 체인으로 현재 상태 파악
계층 2: State 정리 — 처리 완료된 대용량 데이터 제거
계층 3: LLM 압축 — 대화 이력을 지능적으로 요약
```

### 계층 1: 토큰 추정 — Fallback 체인 (ContextCompressor)

토큰 수를 정확히 파악하는 것이 첫 번째 과제였다. Google ADK에서 Gemini를 사용하면 응답에 토큰 정보가 포함되지만 이 프로젝트에서는 OpenAI 모델을 LangChain4j를 통해 연동했다. ADK가 OpenAI 응답의 토큰 정보를 자체적으로 전달해주지 않아서 `TokenUsageCapturingChatModel`이라는 래퍼를 만들어 OpenAI 응답에서 직접 토큰을 캡처했다.

문제는 상황에 따라 토큰 정보를 가져올 수 있는 시점이 다르다는 점이다. LLM 호출이 한 번이라도 완료된 후에는 실제 토큰 수가 있지만 세션 최초 요청이나 캡처 실패 시에는 없다. 그래서 가장 정확한 값부터 순서대로 시도하는 fallback 체인으로 구성했다.

```java
public static int estimateTokenCount(InvocationContext ctx) {
    // 1순위: 직전 LLM 호출의 실제 input 토큰 (가장 정확)
    Object lastActual = ctx.session().state().get("last_actual_tokens");
    if (lastActual instanceof Number num) {
        return num.intValue();
    }

    // 2순위: BeforeCallback에서 페이로드 기반으로 추정한 값
    Object lastEstimate = ctx.session().state().get("last_estimated_tokens");
    if (lastEstimate instanceof Number num) {
        return num.intValue();
    }

    // 3순위: State + 대화 이력 문자 수 기반 추정 (최후 수단)
    int totalChars = countStateChars(ctx) + estimateConversationChars(ctx);
    return totalChars / 4;
}
```

**각 단계가 필요한 이유**

- **1순위 — 실제 토큰**: `TokenUsageCapturingChatModel`이 캡처한 OpenAI API 응답의 `usage.prompt_tokens` 값이다. 가장 정확하지만 LLM 호출이 한 번도 완료되지 않은 시점(세션 최초 요청)에는 존재하지 않는다.
- **2순위 — 페이로드 추정**: BeforeCallback에서 OpenAI 요청 형식으로 페이로드를 직접 조립한 뒤 `payload.length() / 4`로 추정한 값이다. 실제 값 대비 ±10% 오차가 있지만 1순위가 없을 때 합리적인 대안이 된다.
- **3순위 — State 기반 추정**: Session State의 문자 수만으로 추정한다. 대화 이력, instruction, tool 정의가 빠지므로 **실제보다 상당히 적게 나온다**. 위 두 값이 모두 없는 극단적인 경우에만 사용된다.

#### BeforeCallback: 추정 토큰 계산

BeforeCallback에서 OpenAI 요청 형식으로 페이로드를 재구성하여 추정한다.

```java
public static Maybe<LlmResponse> beforeCallback(CallbackContext ctx, LlmRequest.Builder builder) {
    final LlmRequest req = builder.build();

    // OpenAI wire format으로 재구성
    List<Map<String, Object>> messages = buildOpenAIMessages(req.getSystemInstructions(), req.contents());
    List<Map<String, Object>> tools = buildOpenAITools(req.tools());
    Map<String, Object> params = buildOpenAIParams(req);

    Map<String, Object> wire = buildWirePayload(messages, tools, params, ...);
    String json = toMinifiedJson(wire);

    // 4글자 ≈ 1토큰 (영문 기준 경험적 수치)
    int estimatedTokens = json.length() / 4;

    // ThreadLocal에 저장 (State 직렬화 문제 회피)
    setEstimatedTokens(estimatedTokens);
    ctx.state().put("last_estimated_tokens", estimatedTokens);

    return Maybe.empty(); // 모델 호출 계속 진행
}
```

ThreadLocal을 사용한 이유는 Google ADK의 State 직렬화 타이밍 문제 때문이다. AfterCallback에서 추정치와 실제 값을 비교하려면 BeforeCallback의 값이 필요한데 State에만 저장하면 직렬화 시점에 따라 읽지 못하는 경우가 있었다.

#### AfterCallback: 실제 토큰 기록

```java
// OpenAI 응답에서 실제 토큰 사용량 추출
TokenUsage usage = TokenUsageCapturingChatModel.consume();
if (usage != null) {
    int actualInputTokens = usage.inputTokenCount();
    ctx.state().put("last_actual_tokens", actualInputTokens);

    // 추정치와 비교 로깅
    Integer estimated = consumeEstimatedTokens();
    if (estimated != null) {
        int diff = actualInputTokens - estimated;
        log.info("Token estimate accuracy: estimated={}, actual={}, diff={}",
                estimated, actualInputTokens, diff);
    }
}
```

### 계층 2: State 정리 (처리 완료 데이터 제거)

에이전트가 처리를 완료한 대용량 데이터는 더 이상 컨텍스트에 남아 있을 필요가 없다.

```java
public static void cleanupAfterProductRecommendation(InvocationContext ctx) {
    // 1. 상품 상세 JSON (2,000+ 토큰/건)
    int productData = removeProductDetailData(ctx);  // "product_detail_data:*"

    // 2. RAG 검색 결과 (2,000~5,000 토큰)
    int candidateDocs = removeCandidateDocs(ctx);     // "candidate_docs"

    // 3. 상품 SKU 메타데이터
    int skus = removeProductSkus(ctx);                // "product_detail_skus"

    log.info("Cleanup: removed {} product details, {} candidate docs, {} SKU list",
             productData, candidateDocs, skus);
}
```

이 정리만으로도 **턴당 4,000\~10,000 토큰을 절감**할 수 있었다.

### 계층 3: LLM 기반 대화 이력 압축 (ContextSummarizerAgent)

State 정리로도 충분하지 않으면 대화 이력 자체를 LLM으로 요약한다.

#### 트리거 조건

```java
// Phase 3: 컨텍스트 압축 (조건부)
Flowable.defer(() -> {
    int lastInputTokens = getLastInputTokens(ctx);

    if (lastInputTokens > 6000) {
        return contextSummarizerAgent.runAsync(ctx)
            .concatWith(Flowable.defer(() -> storeCompressedContext(ctx)));
    }
    return Flowable.empty();
})
```

6,000 토큰을 초과하면 ContextSummarizerAgent가 실행된다. 이 임계값은 GPT-4o-mini의 컨텍스트 윈도우(128K)에서는 여유가 있지만 **비용과 응답 속도** 측면에서 6,000을 기준으로 잡았다. 입력 토큰이 많을수록 지연이 길어지고 비용이 증가한다.

#### 압축 규칙

ContextSummarizerAgent의 핵심 규칙은 **무엇을 보존하고 무엇을 버릴 것인가**다.

| 분류 | 처리 | 예시 |
|---|---|---|
| **보존** | 그대로 유지 | 사용자 의도, 요구 스펙, 추천 결과, 결정 사항 |
| **압축** | 핵심만 추출 | Tool JSON → "3개 VRF 상품 검색됨", 상세 스펙 → "56kW, EER 4.78" |
| **제거** | 완전 삭제 | 중복 메타데이터, 처리 완료된 임시 상태 |

**압축 목표**: 8,000+ 토큰 → 500\~1,000 토큰(80\~90% 감소)

#### 이벤트 교체

압축 결과를 생성한 후 기존 대화 이벤트를 요약 이벤트로 교체한다. 이 부분이 가장 까다로웠다.

```java
private int replaceEventsWithSummary(InvocationContext ctx, String summary) {
    var events = ctx.session().events();
    int originalCount = events.size();

    // 최근 1건만 보존 (현재 턴)
    List<Event> recentEvents = new ArrayList<>();
    for (int i = originalCount - 1; i < originalCount; i++) {
        recentEvents.add(events.get(i));
    }

    // 전체 이벤트 초기화
    events.clear();

    // 요약 이벤트를 첫 번째로 삽입
    Event summaryEvent = Event.builder()
        .author("user")
        .content(Content.builder()
            .role("user")
            .parts(Part.builder()
                .text("[CONVERSATION HISTORY SUMMARY]\n" + summary + "\n[END OF SUMMARY]")
                .build())
            .build())
        .build();
    events.add(summaryEvent);

    // 최근 이벤트 복원
    events.addAll(recentEvents);

    return originalCount - events.size();
}
```

요약 이벤트의 role을 `user`로 설정한 이유는 ADK가 대화 이력을 OpenAI API로 전송할 때 `user`/`assistant` 교대를 기대하기 때문이다. `system` role로 넣으면 일부 모델에서 무시되는 경우가 있었다.

---

## 전체 흐름

```
사용자 메시지 수신
  ↓
Phase 1: Intent 분류 (토큰 추정 + 실제 기록)
  ↓
Phase 2: 도메인 에이전트 실행 (병렬)
  ↓ State에 Tool 결과, 상품 데이터 누적
  ↓ 에이전트 처리 완료 시 State 정리 (계층 2)
  ↓
Phase 3: 토큰 확인
  ├─ 6,000 이하 → 정상 진행
  └─ 6,000 초과 → ContextSummarizerAgent 실행
       ↓ 대화 이력 요약 (계층 3)
       ↓ 기존 이벤트를 요약 이벤트로 교체
       ↓ 다음 턴부터 압축된 컨텍스트로 진행
```

---

## 삽질과 교훈

### 1. State에 저장하면 컨텍스트에 포함된다

처음에는 "State는 별도 저장소"라고 생각했다. 하지만 Google ADK는 **Session State의 전체 내용을 매 LLM 호출마다 시스템 프롬프트에 주입**한다. 즉 State에 2MB짜리 JSON을 넣으면 매 요청마다 2MB가 토큰으로 잡힌다.

→ **해결**: 처리가 끝난 대용량 데이터는 즉시 State에서 제거한다.

### 2. 토큰 추정의 함정

`문자 수 / 4` 추정은 영문 기준이다. 한국어는 토큰 효율이 낮아서 실제로는 `문자 수 / 2~3`에 가깝다. 하지만 이 프로젝트는 영어(필리핀 시장)로 운영되어 `/4`가 적절했다.

→ **교훈**: 언어에 따라 토큰 추정 계수를 조정해야 한다.

### 3. 요약도 토큰을 소비한다

ContextSummarizerAgent 자체가 LLM을 호출하므로 압축 직전의 긴 컨텍스트가 그대로 입력으로 들어간다. 즉 "압축하기 위해 한 번 더 비용이 발생"한다.

→ **해결**: 압축 에이전트에는 비용이 낮은 GPT-4o-mini를 사용하고 임계값을 6,000으로 잡아 불필요한 압축을 방지한다.

### 4. 이벤트를 clear()하면 안 되는 경우

ADK의 세션 이벤트를 `clear()`한 후 요약만 넣으면 SSE 스트리밍 중인 클라이언트에서 이전 메시지가 사라지는 현상이 발생했다.

→ **해결**: 압축 시작/완료 시그널 이벤트(`CONVERSATION HISTORY SUMMARIZE START/COMPLETION`)를 보내 클라이언트가 UI를 적절히 처리할 수 있게 했다.

---

## 결과

| 지표 | 적용 전 | 적용 후 |
|---|---|---|
| 5턴 후 평균 input 토큰 | \~12,000 | \~3,500 |
| 10턴 후 평균 input 토큰 | \~25,000+ (오류 빈발) | \~4,500 |
| 턴당 평균 비용 (GPT-4.1 기준) | $0.025 | $0.008 |
| 평균 응답 지연 | 8\~12초 | 4\~6초 |

컨텍스트 압축을 통해 **토큰 사용량 60\~70% 절감**, **응답 속도 40\~50% 개선**을 달성했다.

---

## 참고

- [Google ADK Documentation](https://google.github.io/adk-docs/)
- [OpenAI Tokenizer](https://platform.openai.com/tokenizer)

---

### 멀티 에이전트 챗봇 시리즈

- 이전: [RxJava3로 멀티 에이전트 병렬 실행 파이프라인 설계하기](/blog/multi-agent-parallel-execution)
- 다음: [멀티 에이전트 챗봇의 메시지 그룹핑 스키마 설계](/blog/multi-agent-message-grouping-schema)
