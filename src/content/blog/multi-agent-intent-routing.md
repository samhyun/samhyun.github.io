---
title: 'LLM 멀티 에이전트 시스템의 Intent 라우팅 설계 — 키워드가 아닌 맥락으로 분류하기'
description: 'Intent 분류 체계 설계, 컨텍스트 우선 오버라이드, 모호한 질문 감지, 오분류 방지를 위한 프롬프트 엔지니어링 전략을 실제 B2B 챗봇 운영 경험을 통해 정리했다.'
pubDate: 2025-10-05
category: 'ai'
tags: ['llm', 'multi-agent', 'intent-classification', 'prompt-engineering', 'google-adk']
draft: false
---

멀티 에이전트 시스템에서 **Intent 분류**는 전체 파이프라인의 첫 관문이다. 여기서 잘못 분류되면 이후 모든 에이전트가 헛일을 하게 된다. B2B 도메인 챗봇을 개발하면서 겪은 Intent 라우팅의 설계 과정과 교훈을 정리했다.

---

## 단순 키워드 매칭의 한계

초기에는 "recommend"가 들어오면 추천, "compare"가 들어오면 비교로 라우팅하는 단순한 방식을 사용했다. 금방 문제가 드러났다.

```
"What is the cheapest product?"
→ 키워드 매칭: "cheap" → 견적(QUOTATION)? 추천(RECOMMENDATION)?
→ 실제 의도: 가격이 저렴한 제품을 추천해달라는 것 (RECOMMENDATION)

"How much does Model A cost?"
→ 키워드 매칭: "cost" → 견적(QUOTATION)
→ 실제 의도: 정확한 가격을 알고 싶다 (QUOTATION) ✅ 맞음

"What type of system is commonly used in hotels?"
→ 키워드 매칭: "hotel" + "system" → 추천(RECOMMENDATION)?
→ 실제 의도: 일반 지식을 묻는 것 (EXPLANATION)
```

같은 "가격" 관련 질문이라도 **"저렴한 제품 추천"과 "구체적 견적 요청"**은 다른 Intent다. 키워드가 아닌 **사용자의 실제 목표(goal)**로 분류해야 했다.

---

## 8가지 Intent 분류 체계

최종적으로 정의한 Intent는 8가지다.

| Intent | 사용자 목표 | 예시 |
|---|---|---|
| `PRODUCT_EXPLANATION` | 기술/제품에 대해 이해하고 싶다 | "What is VRF?", "How does it work?" |
| `PRODUCT_COMPARISON` | 여러 옵션을 비교하고 싶다 | "Compare Model A and Model B" |
| `PRODUCT_RECOMMENDATION` | 요구사항에 맞는 제품을 추천받고 싶다 | "Best system for 200sqm office?" |
| `QUOTATION_CONSULTATION` | 구체적인 가격/견적을 알고 싶다 | "How much does it cost?" |
| `GENERAL_INFO` | 정책/서비스/보증에 대해 알고 싶다 | "What's the warranty period?" |
| `DEALER_RECOMMENDATION` | 설치/구매처를 찾고 싶다 | "Where can I buy this?" |
| `CATALOGUE_DOWNLOAD` | 카탈로그/브로셔를 다운받고 싶다 | "Download product catalogue" |
| `FALLBACK` | 도메인 범위 밖이거나 이해 불가 | "What's the weather today?" |

---

## 핵심 설계: Context-First 분류

IntentAgent의 가장 중요한 원칙은 **"키워드보다 대화 맥락이 우선"**이다.

### 프롬프트 구조

```
🏛 0. ABSOLUTE OUTPUT RULE     → 출력 형식 강제
🧭 1. HOW TO CLASSIFY          → Context-First 분류 절차
📋 2. INTENT CLASSIFICATION     → 각 Intent 정의 + 경계 사례
🔄 3. CONTEXTUAL OVERRIDES     → 대화 흐름 기반 오버라이드
🚫 4. PROHIBITED OUTPUT        → 금지 출력 목록
✔  5. FINAL VALIDATION         → 자가 검증 단계
```

### 분류 절차 (Step-by-Step)

```
1. 전체 대화 이력 + 최신 메시지 읽기
2. 에이전트가 직전에 견적 관련 질문을 했는지 확인
3. 견적 질문에 대한 답변이면 → 무조건 QUOTATION_CONSULTATION
4. 기존 Intent의 연속인지 새로운 Intent인지 판단
5. 사용자의 실제 목표(goal) 기준으로 분류
6. 매우 짧은 메시지("price?", "compare?")는 대화 맥락으로 판단
```

핵심은 **2\~3번**이다. 에이전트가 "프로젝트 위치가 어디인가요?"라고 물었는데 사용자가 "Seoul"이라고 답하면 이 단어 자체로는 `DEALER_RECOMMENDATION`일 수도 있다. 하지만 견적 질문의 답변이므로 `QUOTATION_CONSULTATION`으로 분류해야 한다.

---

## Contextual Override 규칙

대화 흐름에 따라 Intent가 자동으로 전환되어야 하는 경우를 명시적으로 정의했다.

### 견적 워크플로우 연속성

```
에이전트: "What's your project location?"
사용자:   "hotel cheaper"                   → QUOTATION_CONSULTATION (견적 답변)
사용자:   "200 sqm office Seoul"            → QUOTATION_CONSULTATION (견적 답변)
사용자:   "what is VRF?"                    → PRODUCT_EXPLANATION (명시적 전환)
사용자:   "cancel"                          → 워크플로우 종료
```

**규칙**: 에이전트가 견적 관련 질문을 한 상태에서 사용자가 응답하면 명시적으로 다른 주제를 질문하거나 "cancel"하지 않는 한 `QUOTATION_CONSULTATION`을 유지한다.

### Intent 전환 체인

```
PRODUCT_RECOMMENDATION → "compare them"    → PRODUCT_COMPARISON
PRODUCT_COMPARISON     → "I don't know product names" → PRODUCT_RECOMMENDATION
PRODUCT_EXPLANATION    → "price?"          → QUOTATION_CONSULTATION
PRODUCT_RECOMMENDATION → "maintenance?"    → PRODUCT_EXPLANATION
```

### 짧고 모호한 응답

```
"more?"   → 직전 Intent 유지
"and?"    → 직전 Intent 유지
"ok"      → 직전 Intent 유지
```

---

## 경계 사례(Edge Case) 처리

가장 많은 오분류가 발생했던 경계 사례들이다.

### RECOMMENDATION vs EXPLANATION

```
"What do you recommend for hotels?"                   → RECOMMENDATION (특정 제품 추천 요청)
"What type of system is commonly used in hotels?"     → EXPLANATION (일반 지식 질문)
```

**구분 기준**: "commonly used", "typically used" 같은 표현이 포함되면 일반 지식을 묻는 것이므로 `EXPLANATION`이다. "recommend", "suggest", "best for my" 같은 표현이 포함되면 특정 추천을 원하는 것이므로 `RECOMMENDATION`이다.

### RECOMMENDATION vs QUOTATION

```
"What is the cheapest option?"     → RECOMMENDATION (가격 선호 기반 제품 추천)
"How much does Model A cost?"      → QUOTATION (구체적 가격 문의)
```

**구분 기준**: 가격 **선호도**를 표현하는 것(cheapest, affordable, budget-friendly)은 `RECOMMENDATION`이다. 특정 제품의 **실제 가격**을 묻는 것은 `QUOTATION`이다.

### GENERAL_INFO vs EXPLANATION

```
"What's the warranty for Model A?"  → GENERAL_INFO (서비스/정책 질문)
"What is Model A?"                  → EXPLANATION (제품/기술 질문)
```

**구분 기준**: 제품의 기술적 특성을 묻는 것은 `EXPLANATION`이다. 보증, A/S, 정책 등 서비스에 대한 질문은 `GENERAL_INFO`이다.

### 경쟁사 언급

```
"Compare your product with Competitor X"  → FALLBACK (경쟁사 제품 비교 불가)
"Is yours better than Competitor Y?"      → FALLBACK (경쟁사 비교 불가)
```

B2B 챗봇 특성상 경쟁사 제품에 대한 비교/평가는 범위 밖으로 처리한다.

---

## 출력 형식 강제

IntentAgent는 **정확히 8개 문자열 중 하나만** 출력해야 한다. LLM이 "I think this is a PRODUCT_EXPLANATION because..."와 같은 설명을 덧붙이는 것을 방지하기 위해 여러 장치를 적용했다.

```
ABSOLUTE OUTPUT RULE:
- 8개 문자열 중 정확히 하나만 출력
- 구두점, 설명, 따옴표, 마크다운 금지
- 확신이 없으면 기본값 PRODUCT_EXPLANATION

FINAL VALIDATION STEP:
- 출력 전 자가 검증: "내 출력이 정확히 8개 문자열 중 하나인가?"
- 아니라면 PRODUCT_EXPLANATION으로 교체
```

`outputKey`를 설정하면 에이전트의 출력이 자동으로 Session State에 저장되어, 후속 에이전트가 `ctx.session().state().get("user_intent")`로 읽을 수 있다.

```java
return LlmAgent.builder()
    .name("intent_agent")
    .model(new LangChain4j(advancedModel))  // 정확도가 중요하므로 상위 모델 사용
    .instruction("""...""")
    .outputKey("user_intent")  // State에 자동 저장
    .build();
```

---

## 삽질과 교훈

### 1. 기본 모델로는 정확도가 부족했다

GPT-4o-mini로 Intent 분류를 했을 때 정확도가 약 85%였다. 특히 RECOMMENDATION vs EXPLANATION 경계 사례에서 오분류가 빈번했다. GPT-4.1로 교체한 후 약 95%까지 올라갔다. Intent 분류는 전체 파이프라인의 첫 관문이므로 여기서의 오분류가 전체 품질을 좌우한다.

→ **교훈**: Intent 분류처럼 정확도가 중요한 에이전트에는 상위 모델을 사용하고 비용은 보조 에이전트에서 절약하는 Dual Model 전략이 효과적이다.

### 2. 프롬프트가 길어질수록 성능이 떨어지는 구간이 있다

처음에는 모든 경계 사례를 프롬프트에 나열했다. 40개 이상의 예시를 넣었더니 오히려 성능이 떨어졌다. 프롬프트가 너무 길면 LLM이 핵심 규칙을 놓치는 현상이 발생했다.

→ **교훈**: 규칙은 계층적으로 구조화하고 예시는 경계 사례 위주로 최소한만 포함한다. "GOOD/BAD 예시" 패턴이 효과적이다.

### 3. "모호한 질문"을 어떻게 처리할 것인가

"What's the cheapest system?"처럼 구체적 요구사항 없이 가격만 언급하는 질문이 많았다. 처음에는 바로 제품을 추천했지만 고객 피드백에서 "구체적 정보 없이 확정 추천하지 마라"는 지적이 들어왔다.

→ **해결**: Intent는 `PRODUCT_RECOMMENDATION`으로 분류하되 도메인 에이전트에서 "예시 제품을 보여주고 + 추가 정보를 요청"하는 Clarifying Question 패턴을 적용했다.

---

## 참고

- [Google ADK Documentation](https://google.github.io/adk-docs/)

---

### 멀티 에이전트 챗봇 시리즈

- 다음: [멀티 에이전트 챗봇의 SSE 스트리밍 아키텍처](/blog/multi-agent-sse-streaming-webflux)
