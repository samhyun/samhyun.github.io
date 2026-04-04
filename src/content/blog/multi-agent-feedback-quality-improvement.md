---
title: '멀티 에이전트 챗봇의 응답 품질 개선 — 피드백 기반 프롬프트 튜닝 패턴 5가지'
description: '병렬 실행 멀티 에이전트 챗봇에서 실제 고객 피드백을 통해 발견한 답변 중복, 흐름 단절, 모호한 추천 등의 문제를 프롬프트 튜닝으로 해결한 패턴을 정리한다.'
pubDate: 2025-12-01
category: 'ai'
tags: ['llm', 'multi-agent', 'prompt-engineering', 'quality-improvement', 'feedback']
draft: false
---

멀티 에이전트 챗봇을 출시하고 나면 예상치 못한 문제가 드러난다. B2B 도메인 챗봇 프로젝트에서 고객 피드백을 수집하고 분석한 결과 5가지 반복 패턴을 발견했고 대부분 프롬프트 수정만으로 해결할 수 있었다.

---

## 피드백에서 발견한 5가지 패턴

| 우선순위 | 이슈 | 원인 |
|---|---|---|
| **P0** | 동일 내용이 3번 반복됨 | 병렬 에이전트 간 역할 경계 불명확 |
| **P0** | 답변 흐름이 부자연스러움 | 일반 설명 → 제품 설명 전환 부재 |
| **P0** | 구체적 정보 없이 확정 추천 | Intent 분류 시 정보 부족 판단 누락 |
| **P1** | 텍스트에 언급된 제품과 링크가 불일치 | 병렬 결과 병합 시 검증 부재 |
| **P1** | "perfect", "best choice" 같은 확정적 문구 | 톤앤매너 가이드라인 부재 |

---

## P0-1: 병렬 에이전트 간 답변 중복

### 현상

```
사용자: "우리 호텔에 맞는 시스템 추천해줘"

출력 1 (텍스트 에이전트):
  "A 제품은 호텔에 적합합니다. 높은 효율성 때문에..."

출력 2 (캐러셀 JSON 에이전트):
  { "catchphrase": "호텔에 최적화된 고효율", "highlights": [...] }

출력 3 (비교 테이블 에이전트):
  | 제품 | 효율 | 적합 공간 |
  | A 제품 | 높음 | 호텔 |
```

3개 에이전트가 **"왜 이 제품이 좋은가"를 각자의 형식으로 반복**했다.

### 원인

병렬 실행 아키텍처에서 각 에이전트가 독립적으로 응답을 생성하기 때문이다. 텍스트 에이전트는 설명을 하이라이트 에이전트는 캐러셀을 테이블 에이전트는 비교표를 만드는데 서로의 출력을 모르니 중복이 발생한다.

### 해결

텍스트 에이전트의 역할을 **"왜 이 제품군을 선택했는지" 한두 문장 요약**으로 축소하고 상세 비교는 테이블에 위임했다.

```
변경 전:
  텍스트 에이전트 → 제품별 2~3문장 상세 설명

변경 후:
  ## 이 제품군을 선택한 이유
  1~2문장으로 선택 로직 요약.

  ### 제품 요약
  • A 제품 — 중형 상업 건물에 적합
  • B 제품 — 소형 사무실에 적합

  상세 스펙은 아래 비교 테이블을 참고하세요.
```

핵심은 각 에이전트의 **고유 역할(텍스트 요약 / UI 캐러셀 / 정량 비교)**을 명확히 분리하는 것이다. 중복되는 "왜 좋은가" 설명은 하나의 에이전트만 담당하도록 했다.

---

## P0-2: 답변 흐름 단절 — Bridge Paragraph 패턴

### 현상

```
## Overview
일반적인 기술 설명

## How It Works
작동 원리 설명

## Key Features          ← 갑자기 자사 제품명 등장
• 자사 제품 A가 제공하는...

## Benefits
다시 일반적인 내용으로

## Applications
또 일반적인 내용
```

일반 기술 설명 중간에 갑자기 자사 제품이 등장했다가 다시 일반 설명으로 돌아간다. 읽는 사람 입장에서 맥락이 끊긴다.

### 해결

일반 설명에서 자사 제품으로 자연스럽게 연결하는 **브릿지 문단**을 추가했다.

```
## Overview
기술 일반 소개

## How It Works
작동 원리

## Why Our Products?                ← 브릿지 문단
자사 제품은 이 기술을 기반으로
상업용 건물에 맞게 설계되었으며...

## Key Features of Our Products    ← 자사 제품 맥락 진입
• 기능 1
• 기능 2

## Benefits for Your Business
사용자 니즈와 연결된 실질적 이점
```

**흐름**: 일반 설명 → 브릿지 → 자사 제품 → 사용자 이점

에이전트 instruction에 "일반 설명과 제품 설명 사이에 반드시 전환 문단을 넣어라"는 규칙을 추가하는 것만으로 해결되었다.

---

## P0-3: 모호한 질문에 확정 추천 — Clarifying Question 패턴

### 현상

```
사용자: "가장 저렴한 냉방 시스템이 뭐야?"

응답: "B 제품이 가장 경제적이며 가격은 약 XX만원입니다.
      당신의 니즈에 딱 맞는 제품입니다."

→ 면적, 용도, 건물 유형을 모르는 상태에서 특정 모델을 확정 추천
```

### 해결

구체적 요구사항이 없는 질문에는 **예시 제품을 보여주되 "옵션"으로 프레이밍**하고 추가 정보를 요청한다.

```
## 경제적인 옵션 살펴보기

다음과 같은 카테고리를 확인해보세요:
• 덕트형 — 소중형 공간에 적합
• 벽걸이형 — 개별 공간에 적합

### 예시 제품
[제품 2~3개를 "예시"로 표시]

### 더 정확한 추천을 위해
다음 정보를 알려주시면 적합한 제품을 좁혀드릴 수 있습니다:
• 대략적인 공간 크기 (㎡)
• 건물 유형 (호텔, 사무실, 주거)
• 주요 용도 (냉방 전용 or 냉난방)
```

Intent 분류 에이전트에서 **필수 정보(공간 크기, 용도, 건물 유형) 누락 여부를 판단**하고 누락 시 Clarifying Question 흐름으로 분기하도록 instruction을 수정했다.

---

## P1: 톤앤매너 — 확정적 문구 제거

### 현상

고객사 피드백에서 "제품을 확정적으로 추천하는 문구는 지양해야 한다"는 요구가 있었다.

```
❌ "Perfect fit for your hotel"
❌ "Smart choice for heating and cooling"
❌ "This is exactly what you need"
```

B2B 도메인에서 AI가 확정적으로 추천하면 법적 책임 이슈가 생길 수 있다. 최종 결정은 사용자(또는 영업 담당)의 몫이어야 한다.

### 해결

모든 에이전트가 참조하는 전역 톤앤매너 가이드라인을 추가했다.

```java
public static final String TONE = """
    CRITICAL - Recommendation Language:
    - NEVER: "perfect", "best", "ideal", "smart choice", "exactly what you need"
    - USE: "could be suitable", "worth considering", "designed for", "a good option"
    - Frame all recommendations as OPTIONS requiring user's final decision
    - Always imply consultation is available for detailed selection
    """;
```

| Before | After |
|---|---|
| "Perfect fit for your 120 sqm office" | "Designed for spaces like your 120 sqm office" |
| "This is the best system" | "This system could be worth considering" |

---

## P1: 병렬 결과 간 데이터 불일치

### 현상

텍스트에서 A 제품과 B 제품 2개를 언급했는데 제품 링크는 B 제품 1개만 반환했다.

### 해결

병렬 에이전트의 결과를 병합할 때 텍스트에 언급된 제품 ID와 JSON에 포함된 제품 ID를 교차 검증하는 로직을 추가했다.

```java
private void compareProductIds(ArrayNode textProducts, ArrayNode uiProducts) {
    List<String> textIds = extractIds(textProducts);
    List<String> uiIds = extractIds(uiProducts);

    List<String> missing = textIds.stream()
        .filter(id -> !uiIds.contains(id))
        .toList();

    if (!missing.isEmpty()) {
        log.warn("PRODUCT_MISMATCH: {} in text but NOT in UI: {}",
                missing.size(), missing);
    }
}
```

불일치가 감지되면 로그로 기록하여 모니터링하고 프롬프트를 점진적으로 개선해 나갔다.

---

## 대부분 프롬프트 수정만으로 해결된다

```
1. 피드백 수집      → QA 시트에서 이슈 추출
2. 패턴 분류       → P0/P1 우선순위 지정
3. 원인 에이전트 특정 → 어떤 에이전트의 어떤 instruction이 문제인지 식별
4. 프롬프트 수정     → instruction 변경 (코드 변경 최소화)
5. A/B 테스트      → 동일 질문으로 변경 전/후 비교
6. 배포 및 모니터링  → 로그 기반 불일치 감지
```

5가지 이슈 중 코드 변경이 필요했던 건 제품 ID 교차 검증 로직 하나뿐이었다. 나머지 4개는 전부 에이전트 instruction 수정으로 해결했다. 멀티 에이전트 시스템에서 품질 문제가 발생하면 코드를 고치기 전에 먼저 프롬프트를 의심하는 게 맞다.

---

## 참고

- [Google ADK Documentation](https://google.github.io/adk-docs/)

---

### 멀티 에이전트 챗봇 시리즈

- 이전: [멀티 턴 워크플로우를 상태 머신으로 설계하기](/blog/multi-agent-quotation-state-machine)
- 다음: [RxJava3로 멀티 에이전트 병렬 실행 파이프라인 설계하기](/blog/multi-agent-parallel-execution)
