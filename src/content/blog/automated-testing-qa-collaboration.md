---
title: '반복 테스트에 들어가는 시간을 줄이는 방법 — 자동화 전략과 QA 협업'
description: '릴리즈마다 같은 시나리오를 수동으로 반복하는 데 시간이 너무 많이 들었다. 테스트 피라미드 재설계와 계약 테스트 도입으로 반복을 줄이고 QA가 탐색 테스트에 집중할 수 있는 구조를 만들기까지의 고민을 정리한다.'
pubDate: 2024-02-05
category: 'testing'
tags: ['testing', 'qa', 'ci-cd', 'contract-testing', 'pact', 'devops']
featured: true
draft: false
---

## 문제 인식

릴리즈가 나갈 때마다 QA 팀이 같은 시나리오를 처음부터 끝까지 수동으로 반복하고 있었다. 로그인 → 프로젝트 생성 → 비용/수익 등록 → 정산 산출 → PDF 출력. 매번 동일한 흐름을 사람이 직접 클릭하면서 확인한다.

문제는 이 반복에 들어가는 시간이었다. 기능이 추가될수록 테스트 범위는 넓어지는데 릴리즈 주기는 줄어들었다. QA 인원이 적지 않았는데도 항상 시간이 부족했고 결국 "전부 다 봐야 안전하다"는 방어적인 프로세스가 굳어졌다.

그래서 고민한 건 두 가지였다.

- 반복되는 확인 작업을 어떻게 자동화할 수 있을까
- QA의 역할을 단순 반복 검증이 아니라 탐색적 테스트에 집중시킬 수 있는 구조는 뭘까

그 고민 과정에서 정리한 내용이다.

---

## 1. 테스트 전략 재설계

### 테스트 피라미드 확립

반복을 줄이려면 먼저 "어디에 얼마나 투자할 것인가"를 정리해야 했다.

- **Unit(다수)** — BE/JUnit·pytest, FE/Jest 등으로 로직 단위를 빠르게 검증한다.
- **Integration(적절히)** — DB, MQ, 외부 API 연동 지점을 확인한다.
- **E2E(최소 핵심만)** — 로그인, 비용 등록, 정산 산출 같은 **비즈니스 크리티컬 경로**만 자동화한다.

"모든 걸 매번 수동 확인"하던 방식을 **핵심 경로 E2E 자동화**로 대체하는 게 첫 번째 목표였다.

### 계약 테스트(Consumer-Driven Contract)

FE와 BE가 따로 개발하면 인터페이스가 어긋나는 문제가 반복된다. BE가 응답 필드명을 바꿨는데 FE가 모르거나 FE가 기대하는 데이터 구조와 실제 API 응답이 달라서 화면이 깨지는 식이다. 이걸 매번 QA가 수동으로 발견하는 건 낭비다.

이 문제를 빌드 단계에서 잡기 위해 **Pact(Consumer-Driven Contract Testing)** 도입을 검토했다. 핵심 구조는 다음과 같다.

```
1. FE(Consumer)가 기대하는 API 계약을 Pact 파일로 생성
2. Pact Broker에 업로드
3. BE(Provider)가 계약 준수 여부를 자동 검증 → 결과를 Broker에 보고
4. 배포 전 can-i-deploy로 호환성 확인 → 통과해야 배포 가능
```

#### Consumer 테스트 (FE 측)

```java
@PactTestFor(providerName = "order-api", port = "1234")
public class OrderConsumerPactTest {

  @Pact(consumer = "web-frontend")
  public RequestResponsePact orderExists(PactDslWithProvider builder) {
    return builder
      .given("order with id 1 exists and is PAID")
      .uponReceiving("get order by id")
        .path("/api/orders/1").method("GET")
      .willRespondWith()
        .status(200)
        .headers(Map.of("Content-Type", "application/json"))
        .body("{\"id\":1,\"status\":\"PAID\"}")
      .toPact();
  }

  @Test
  void verifyContract(MockServer mockServer) {
    var resp = Http.get(mockServer.getUrl() + "/api/orders/1");
    assertThat(resp.json().get("status").asText()).isEqualTo("PAID");
  }
}
```

테스트가 통과하면 Pact 파일이 생성된다. 이 파일이 "FE는 이 형태의 응답을 기대한다"는 계약이 된다.

#### Provider 검증 (BE 측)

```java
@Provider("order-api")
@PactBroker(url = "${PACT_BROKER_URL}")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
public class OrderProviderPactTest {

  @State("order with id 1 exists and is PAID")
  public void orderExists() {
    TestData.seedOrder(1, "PAID");
  }

  @TestTemplate
  @ExtendWith(PactVerificationInvocationContextProvider.class)
  void pactVerification(PactVerificationContext context) {
    context.verifyInteraction();
  }
}
```

Broker에서 Pact 파일을 가져와 실제 API를 호출하고 계약대로 응답하는지 검증한다.

#### CI 배포 게이트

```bash
pact-broker can-i-deploy \
  --pacticipant order-api \
  --version "$GIT_SHA" \
  --to prod
```

이 명령이 실패하면 배포가 차단된다. "프론트에서는 되는데 백에서 안 된다"는 류의 이슈가 QA까지 가기 전에 잡히는 구조다.

### 변경 영향도 기반 리스크 테스트

모든 테스트를 매번 돌릴 필요는 없다.

- 변경 PR마다 **Impact 분석** → 영향 모듈의 통합/회귀 테스트만 선택적으로 실행한다.
- QA는 **리스크 높은 영역**(정산, OCR 영수증 처리, 인증 등)에만 수동 탐색 테스트를 집중한다.

---

## 2. 환경 패리티(Prod-Like) 확보

"Staging에서는 됐는데 Prod에서 안 된다"는 문제도 반복 테스트를 늘리는 원인 중 하나였다. 환경을 믿을 수 없으니 더 많이 확인하게 된다.

### Staging을 진짜같이 운영하기

- **동일 컨테이너 이미지·런타임·환경변수 체계**를 적용한다.
- **동일 버전의 DB/Redis/Kafka**를 사용한다. 스펙이나 설정 차이를 허용하지 않는다.
- 인프라를 **IaC(Terraform/Helm)로 코드화**해서 Prod/Staging 동형성을 보장한다.

### 데이터 전략

- **비식별화한 Prod 스냅샷**을 주기적으로 Staging에 리프레시한다.
- 테스트용 **시드 데이터** 자동 주입 스크립트(마이그레이션 포함)를 함께 관리한다.

### 에페메럴(Preview) 환경

- PR마다 **임시 환경을 자동 생성**한다. FE/QA가 머지 전에 바로 시나리오를 검증할 수 있다.
- "실제 인프라 스택에서 동작 확인"이 특별한 이벤트가 아니라 일상이 되도록 만든다.

### 서비스 가상화

- 외부 의존(결제사, SMS, 타사 API)은 **가상화/Mock**로 재현한다.
- 네트워크 레이턴시/오류율을 **주입 테스트(chaos-lite)**로 사전에 노출한다.

---

## 3. 배포 전략

### CI/CD 품질 게이트

- PR 단계에서 Unit/Integration/계약/E2E-스모크 통과 + 정적분석 + 보안 스캔을 검증한다.
- Main 머지 후 Staging에 배포하고 **풀 스위트를 자동 실행**한다. 통과 후 프로덕션에 반영한다.

### 점진적 출시

- **Feature Flag** — 코드 배포와 기능 노출을 분리한다.
- **Canary/Blue-Green** — 5%→25%→100% 점증하면서 **자동 롤백 조건**(에러율, p95 지연)을 건다.
- **섀도 트래픽/리플레이** — 실사용 트래픽을 복제해 새 버전을 검증한다. (읽기 전용)

### 운영 중 품질 보증

- **Synthetic Monitoring(E2E 프로브)** — 로그인/정산 등 핵심 경로를 1분\~5분 간격으로 점검한다.
- **관측성(SLI/SLO)** — 가용성·오류율·지연 시간 대시보드 + 알람을 운영한다.
- **릴리즈 헬스 리포트** — 배포 후 N시간 지표·버그 요약을 자동 공유한다.

---

## 4. 역할 경계를 수치로 합의하기

반복 테스트를 자동화하면 "그럼 QA는 뭘 하느냐"는 질문이 나온다. 이걸 모호하게 두면 결국 다시 전수 수동 검증으로 돌아간다.

### Definition of Done(DoD) 예시

- BE — 단위/통합/계약 테스트 **100% 통과**. 최소 커버리지 X%를 충족한다.
- FE — 계약 테스트 통과. 핵심 경로 UI 테스트 녹색을 유지한다.
- 공통 — E2E 스모크(핵심 N개) 통과. 린트·보안 스캔 패스. 릴리즈 노트 작성을 완료한다.

### 책임 범위

- **자동화 범위 내 결함** — 개발팀 책임이다.
- **자동화 범위 밖 결함** — QA와 공동 정의한 수동 체크리스트로 관리한다.

경계를 수치로 합의해두면 "일단 다 다시 보겠다"는 관성을 구조적으로 줄일 수 있다.

---

## 5. 자주 나오는 반론과 대응

자동화 도입을 논의하면 거의 매번 같은 반론이 나온다. 데이터로 대응할 수 있는 형태로 정리해둔다.

**"모든 기능을 매번 수동으로 봐야 안전해요."**

> 핵심 시나리오 자동화 커버리지가 90%라면 남은 10%만 수동 체크리스트로 관리하면 된다. 실제로 지난 분기 이슈를 분류해보면 자동화로 탐지된 건이 대다수이고 수동으로만 발견된 건은 비핵심 경로에 집중되어 있을 가능성이 높다. 데이터를 기준으로 수동 범위를 조정하자고 제안한다.

**"Staging은 실제랑 달라요."**

> IaC로 Prod/Staging을 동형화하고 Prod 스냅샷 비식별화 리프레시를 주기적으로 적용한다면 그 차이는 줄어든다. 구체적으로 어떤 차이가 문제인지 특정하고 체크리스트에 추가해서 릴리즈 게이트로 넣는 방식이 현실적이다.

**"변수가 생길 수 있어요."**

> Canary 배포(5%/25%/100%)와 자동 롤백 트리거(에러율>2%, p95>800ms)로 변수에 대응한다. Synthetic E2E가 수 분 간격으로 핵심 경로를 모니터링하기 때문에 문제가 생기면 빠르게 감지된다.

---

## 6. 최소 도입 체크리스트

- OpenAPI 스키마 + **Pact 계약 테스트** CI 연동
- 핵심 경로 **E2E 5\~10개**만 선정하여 자동화(수동은 체크리스트로 축소)
- **IaC로 Staging/Prod 동형화**. 비식별 스냅샷 주기 적용
- **Feature Flag + Canary** 적용. 자동 롤백 기준 수치화
- **Synthetic 모니터링** 대시보드 공유. 배포 후 24시간 릴리즈 헬스 리포트

---

## 참고

- [Pact Documentation](https://docs.pact.io/)
- [Test Pyramid — Martin Fowler](https://martinfowler.com/articles/practical-test-pyramid.html)