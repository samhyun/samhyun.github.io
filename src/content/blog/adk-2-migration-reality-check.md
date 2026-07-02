---
title: 'ADK 2.0으로 올리며 살펴본 것들 — 그래프 Workflow와 HITL'
description: '이력서 어시스턴트의 에이전트 부분을 Google ADK 1.15에서 2.3으로 올렸다. 마이그레이션 자체는 간단했고, 오히려 2.0에서 새로 들어온 그래프 Workflow API와 HITL(사람 개입) 패턴이 더 볼 만했다. 마이그레이션을 어떻게 진행했는지와, 2.0에서 눈에 띈 기능들을 정리한다.'
pubDate: 2026-07-02
category: 'ai'
tags: ['google-adk', 'migration', 'ai-agent', 'multi-agent', 'python', 'workflow']
draft: false
---

이력서 어시스턴트를 개인 프로젝트로 만들면서 에이전트 부분은 Google ADK 1.15.1 위에 올려뒀다. 그런데 어느새 ADK 2.0이 나와 있었다. 최신 기능을 붙이기 전에 버전부터 올려두는 게 낫겠다 싶어서 마이그레이션을 진행했는데 막상 해보니 옮기는 작업 자체보다 2.0에 새로 들어온 그래프 API 쪽이 더 눈에 들어왔다. 이 글은 마이그레이션을 어떻게 진행했는지, 그리고 2.0에서 새로 생긴 것들 중 볼 만했던 것들을 정리한 기록이다.

---

## 마이그레이션은 생각보다 간단했다

먼저 걱정했던 건 호환성이었다. 내 프로젝트의 오케스트레이터 두 개는 `BaseAgent`를 상속해서 `_run_async_impl` 안에 상태 머신을 직접 구현한 구조인데 큰 건 1,400줄이 넘는다. 2.0에서 `BaseAgent`가 그래프 노드 기반으로 바뀌었다는 얘기가 있어서 이 로직을 전부 다시 짜야 하나 싶었다.

확인해보니 그건 아니었다. `feature/adk-2.0-migration` 브랜치에 2.3.0을 설치하고 소스를 직접 열어보니, `BaseAgent.run_async()`는 여전히 커스텀 `_run_async_impl`로 위임한다.

```python
async with Aclosing(self._run_async_impl(ctx)) as agen:
    ...
```

`InMemoryRunner`로 실제 오케스트레이터를 돌려봤을 때도 이벤트와 `state_delta`가 1.x 때와 똑같이 나왔다. 그래프 노드가 커스텀 실행 로직을 무시하는 건 새 그래프 API로 직접 갈아탄 경우에만 해당하는 얘기였고, `adk web`이나 `api_server`가 타는 클래식 Runner 경로는 하위 호환이 유지된다. 2.2.0 체인지로그에도 "restore 1.x agent config wiring" 항목이 있다.

쓰고 있는 API를 하나씩 대조한 결과는 이렇다.

| API | 사용 위치 | 2.3.0 상태 |
|---|---|---|
| `BaseAgent._run_async_impl` FSM | 오케스트레이터 2개 | 그대로 작동 |
| `Event` / `EventActions(state_delta=)` | 워크플로 전반 | 작동. `node_info`/`output` 필드가 추가됨 |
| `App(name, root_agent, plugins)` | 진입점 2개 | 동일 인자 + 신규 옵션 필드 추가 |
| `Agent(model, instruction, output_key, ...)` | 서브 에이전트 18개 | 전 필드 존재 |
| 커스텀 `BasePlugin.on_user_message_callback` | 플러그인 2개 | 시그니처 동일 |
| `FunctionTool(func)` | 도구 모듈 | 작동 |

대부분 필드가 추가된 정도라 깨진 곳은 없었다. 실제로 손을 댄 건 한 군데뿐이었는데, `SequentialAgent`가 deprecated 돼서 `Please use Workflow instead` 경고가 뜨는 부분이었다. 파서와 분석기를 순차로 묶는 데 쓰고 있었다.

```python
parse_and_analyze = SequentialAgent(sub_agents=[parser, analyzer])
```

권장 대체재인 `Workflow`는 뒤에서 설명할 그래프 기반이라, 순차 실행 하나 때문에 도입하기엔 무거웠다. 그래서 그냥 인라인 순차 실행으로 바꿨다. parser의 `run_async`를 돌리고 이어서 analyzer의 `run_async`를 돌리는 식이다. 오케스트레이터가 다른 서브 에이전트를 이미 이렇게 호출하고 있어서 오히려 코드가 일관돼졌다.

의존성은 `google-adk>=2.3.0`으로 올리면서 `requires-python>=3.11`이 따라왔고 pydantic이 2.11에서 2.13으로, starlette이 0.48에서 1.3으로 같이 올라갔다. 여기서는 문제가 없었지만 동반 상승하는 패키지가 많은 편이라 환경에 따라서는 이쪽이 더 신경 쓰일 수 있겠다.

클래식 Runner를 쓰던 코드 입장에서 2.0 마이그레이션은 deprecated 클래스 하나 바꾸는 수준으로 끝났다.

---

## 2.0의 핵심은 그래프 Workflow

마이그레이션은 이렇게 간단히 끝났지만, 2.0에서 실제로 달라진 부분은 새로 들어온 그래프 Workflow API다. 기존에는 `SequentialAgent`, `ParallelAgent`처럼 정해진 조합 방식으로 서브 에이전트를 엮거나, 아니면 나처럼 `_run_async_impl` 안에 상태 머신을 직접 짜야 했다. 2.0은 이 둘 사이에 선언형 그래프라는 선택지를 하나 더 얹었다.

그래프는 노드와 엣지로 정의한다.

```python
from google.adk.workflow import Workflow, Edge, START

workflow = Workflow(
    name="cover_letter",
    edges=[
        (START, parser, analyzer, writer),        # 연속 실행은 체인 튜플로
        Edge(from_node=validator, to_node=writer, route="retry"),  # 조건 분기는 Edge로
    ],
)
```

`(START, a, b, c)` 같은 튜플은 순서대로 이어지는 엣지를 뜻하고, 조건에 따라 갈라지는 흐름은 `Edge`에 `route`를 붙여서 표현한다. 여기서 `Agent`는 그 자체로 그래프 노드가 된다. 별도로 감싸지 않고 edges에 객체를 그대로 넣으면 된다.

그래프에 들어간 LLM 노드는 단일턴으로 동작하고 대화 히스토리가 차단된다. 이 점은 미리 알아둬야 한다. 이전 노드의 결과를 쓰려면 instruction 템플릿에 `{state_key}` 형태로 주입해야 한다. 노드가 `output_key`에 결과를 쓰면 다음 노드가 그 상태를 읽어가는 구조다.

출력을 구조화하고 싶으면 `output_schema`에 Pydantic 모델을 넘기면 된다.

```python
writer = Agent(
    model="...",
    instruction="이전 분석: {analysis_result}\n커버레터 초안을 작성한다.",
    output_schema=CoverLetterDraft,
    output_key="draft",
)
```

이러면 LLM 출력이 스키마에 맞춰 파싱되고 상태에는 dict로 저장된다. 예전엔 이걸 콜백이나 후처리로 직접 했는데, 노드 정의에 붙일 수 있게 된 게 편하다.

---

## HITL — 흐름 중간에 사람이 끼어드는 지점

새 기능 중에 제일 반가웠던 건 HITL(human-in-the-loop) 지원이다. 이력서나 커버레터를 다듬는 흐름은 중간에 사용자한테 되묻는 구간이 많다. "빠진 내용이 있나요?" 같은 질문을 던지고 답을 받아서 다음 단계로 넘어가야 하는데, 기존에는 이 왕복을 상태 머신으로 직접 관리했다.

2.0에서는 `RequestInput`으로 흐름을 중단했다가 재개할 수 있다.

```python
from google.adk.events import RequestInput

async def ask_missing(ctx):
    yield RequestInput(interrupt_id="missing_content", message="빠진 내용이 있나요?")
```

FunctionNode가 `RequestInput`을 yield하면 워크플로가 그 지점에서 멈추고 턴이 종료된다. 클라이언트가 답을 담아 `FunctionResponse`로 돌려주면, 중단됐던 노드의 출력이 곧 사용자의 답변이 되어 다음 노드로 흘러간다. 상태 머신에서 "지금 몇 번째 질문을 기다리는 중인지"를 손으로 추적하던 걸 그래프가 중단/재개로 대신 관리해준다.

실제로 `RequestInput` import가 안 될 때가 있는데 원인이 import 경로가 아니라 잘못된 Python 환경인 경우가 많다. `adk`를 그냥 치면 시스템 Python에 깔린 옛날 1.15로 실행돼서 `RequestInput` 자체가 없다. `.venv/bin/adk`나 `uv run adk`로 2.3.0이 깔린 환경에서 돌려야 한다.

---

## 병렬 실행과 재시도 루프

그래프로 흐름을 표현하니 병렬이나 재시도 같은 것도 구조로 드러낼 수 있게 됐다.

병렬은 fan-out 튜플과 `JoinNode`로 표현한다. `(src, (a, b))`처럼 쓰면 `a`와 `b`가 같이 갈라져 나가고, `JoinNode`가 둘 다 끝날 때까지 기다렸다가 `{이름: 출력}` 형태로 결과를 모아 넘긴다. `max_concurrency`로 동시 실행 개수도 제한할 수 있다.

검증 후 재시도 같은 흐름은 조건 사이클로 표현한다. 예를 들어 초안을 쓰고 검증한 뒤 통과 못 하면 다시 쓰는 흐름은 `polish → validate → check` 노드를 두고, `check`가 결과에 따라 retry 라우트를 다시 `polish`로 돌려주면 된다. 시도 횟수는 상태에 카운터로 들고 있으면 무한 루프도 막을 수 있다. 커버레터 파일럿에서 writer가 실제로 두 번 도는 것까지 확인했다.

무조건 도는 사이클은 막혀 있고 라우팅 엣지가 낀 사이클만 허용된다. 재시도 로직을 코드 분기에 숨기지 않고 그래프에 그대로 드러낼 수 있다.

---

## 어디까지 옮겼나

2.0의 그래프 기능은 새로 만든 커버레터 에이전트에 먼저 적용했다. 위에 적은 패턴들은 대부분 이 파일럿에서 실제로 돌려보며 확인한 것들이다. 반면 기존의 큰 오케스트레이터(1,400줄짜리 FSM)는 아직 클래식 방식 그대로 두고 있다. 하위 호환이 되니 급하게 옮길 이유가 없고, 그래프로 이관하는 건 죽은 분기를 정리하고 상태 흐름을 다시 그리는 별도 작업이라 천천히 진행할 생각이다.

배포 전에 짚어둘 게 하나 남아 있다. ADK 2.0은 세션/이벤트 스토리지 스키마가 1.x와 호환되지 않는다(공식 문서에도 데이터 손실 경고가 있다). 이 프로젝트는 Spring 백엔드가 ADK 세션 ID를 참조하고 SSE 이벤트를 프론트로 프록시하는 구조라, 백엔드와 ADK 사이 통합 테스트를 돌리고 기존 세션이 아니라 신규 세션으로 검증할 계획이다. 코드가 안 깨져도 데이터 경계는 따로 확인해야 하는 부분이다.

마이그레이션 자체는 deprecated 클래스 하나를 바꾸는 걸로 끝났지만, 정작 얻은 건 새로 쓸 수 있게 된 그래프 API 쪽이었다. 상태 머신으로 손수 관리하던 대화 흐름과 재시도, 병렬을 이제 구조로 표현할 수 있다. 앞으로 새 에이전트는 이 방식으로 짤 생각이다.
