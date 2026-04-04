---
title: "AI 챗봇 인프라 클라우드 마이그레이션 — AWS ECS에서 GKE/AKS 멀티클라우드 대응까지"
description: "고객사의 클라우드 플랫폼이 미정인 상황에서 AWS ECS 인프라를 GCP GKE와 Azure AKS로 대응할 수 있도록 Terraform 코드를 준비했다. Cloud Run을 선택하지 않은 이유와 클라우드별 비용/아키텍처 비교를 함께 정리한다."
pubDate: 2026-03-25
draft: false
category: "devops"
tags: ["aws", "gcp", "azure", "gke", "aks", "terraform", "cost-optimization"]
---

## 배경: 고객사가 클라우드를 아직 정하지 않았다

B2B HVAC 챗봇 시스템을 AWS ECS에서 운영 중이었다. 6개 서비스, 4개 ALB, 월 약 $200의 비용이 발생하고 있었다. Terraform으로 인프라를 코드화하는 작업을 마친 상태였다.

고객사에서 최종 클라우드 플랫폼을 아직 결정하지 않은 상황이었다. GCP를 쓸 수도 있고, Azure를 쓸 수도 있었다. 어느 쪽이 결정되더라도 바로 대응할 수 있도록 **GCP와 Azure 두 벌의 Terraform 코드를 미리 준비**했다.

## AWS 현재 아키텍처

```
Internet
  ↓
4 ALBs (public)
  ↓
ECS Cluster (Spot instances)
  ├─ admin-service
  ├─ admin-client-service
  ├─ agent-service
  ├─ client-service
  ├─ service-service
  └─ milvus-service
  ↓
RDS MySQL + S3 + ECR
```

**리소스 구성**
- 4개 ALB (admin, client, admin-client, service 각각)
- 6개 ECS 서비스
- 1개 RDS MySQL 인스턴스
- 6개 S3 버킷
- 8개 ECR 저장소
- 6개 EC2 Spot 인스턴스

## 멀티클라우드 Terraform 구조

Terraform 모듈 구조를 클라우드별로 분리했다. 동일한 패턴으로 각 클라우드의 인프라를 정의했다.

```
terraform/
├── environments/
│   ├── aws/dev/main.tf
│   ├── gcp/dev/main.tf
│   └── azure/dev/main.tf
└── modules/
    ├── aws/
    │   ├── networking/    (vpc, subnets, security-groups, nat)
    │   ├── compute/       (ecs-cluster, ecs-service)
    │   ├── database/      (rds-mysql)
    │   └── ...
    ├── gcp/
    │   ├── networking/    (vpc, subnets, firewall, nat)
    │   ├── compute/       (gke-cluster, gke-service)
    │   ├── database/      (cloudsql)
    │   └── ...
    └── azure/
        ├── networking/    (vnet, subnets, nsg, nat-gateway)
        ├── compute/       (aks-cluster, aks-service)
        ├── database/      (mysql-flexible)
        └── ...
```

모듈 인터페이스를 최대한 맞췄다. 환경 파일의 구조는 세 클라우드가 거의 동일하다. 컴퓨팅 리소스 이름이 `ecs-service` → `gke-service` → `aks-service`로 바뀌는 정도다.

## Cloud Run은 왜 선택하지 않았나

GCP 쪽을 준비하면서 처음에는 Cloud Run도 검토했다. Serverless라 운영이 단순하고 비용도 낮아 보였다.

가장 큰 걸림돌은 **콜드 스타트**였다. Cloud Run은 트래픽이 없으면 인스턴스가 0으로 내려가고 다시 요청이 들어올 때 컨테이너를 띄우는 시간이 필요하다. 챗봇 특성상 사용자가 언제 대화를 시작할지 예측할 수 없는데, 첫 응답에 수 초의 대기 시간이 생기면 사용자 경험이 나빠진다.

콜드 스타트를 피하려고 최소 인스턴스를 1로 유지하면(always-on) 결국 24시간 켜놓는 셈이 된다. 그 상태에서 비용을 계산해보면 GKE Spot VM보다 오히려 비효율적이었다. 사용한 만큼만 과금된다는 Serverless의 장점이 사라지기 때문이다.

| 비교 | Cloud Run (min 1) | GKE Autopilot (Spot) |
|---|---|---|
| 월 비용 (3서비스 상시) | \~$90\~100 | \~$45\~60 |
| 콜드 스타트 | 없음 (min 1) | 없음 (항상 실행) |
| 스케일링 | 요청 기반 | HPA (CPU/Memory) |
| Stateful 지원 | 불가 | PV/PVC 가능 |

결국 **상시 운영이 필요한 챗봇에서는 GKE가 비용과 유연성 모두에서 우수하다**는 판단이었다.

## GCP 아키텍처: GKE Autopilot + Spot VM

```
Users
  ↓
Global HTTP(S) LB + Cloud CDN
  ├─ GCS (SPA 정적 파일, 1일 캐시)
  ├─ GKE Autopilot (Spot VMs)
  │   ├─ service (1~10 pods, HPA)
  │   ├─ agent (1~10 pods, HPA)
  │   └─ admin (1~5 pods, HPA)
  ├─ Compute Engine (Milvus, Persistent Disk)
  └─ Cloud SQL MySQL (Private IP)
```

### 주요 구성
- **GKE Autopilot**: Google 관리 노드 + Spot VM (60\~91% 비용 절감)
- **Workload Identity**: 서비스 계정 키 없이 Pod에서 GCP 서비스 인증
- **Milvus**: Stateful이라 별도 Compute Engine VM (e2-medium, 50GB PD)
- **Private 네트워크**: 모든 노드 Private IP, Cloud NAT로 아웃바운드만 허용

### Spot VM 안정성 확보

```yaml
# Pod Disruption Budget — 최소 1개 Pod 항상 유지
minAvailable: 1

# Rolling Update: 25% max surge, 25% max unavailable
# Graceful shutdown: 30초 + preStop 10초 커넥션 드레이닝
```

## Azure 아키텍처: AKS + Spot 노드

```
Users
  ↓
Azure CDN + Blob Storage (SPA)
  ├─ AKS Cluster (Spot Nodes)
  │   ├─ service (1~10 pods, HPA)
  │   ├─ agent (1~10 pods, HPA)
  │   └─ admin (1~5 pods, HPA)
  ├─ VM (Milvus, Managed Disk)
  └─ Azure Database for MySQL Flexible (Private Subnet)
```

### GKE와의 차이점

| 항목 | GCP (GKE) | Azure (AKS) |
|---|---|---|
| 관리 모드 | Autopilot (완전 관리) | 노드 풀 직접 관리 |
| 인증 | Workload Identity | K8s Secret + Key Vault |
| 데이터베이스 | Cloud SQL | MySQL Flexible Server |
| 시크릿 | Secret Manager | Key Vault |
| CDN | Cloud CDN (LB 통합) | Azure CDN (별도) |
| 컨테이너 레지스트리 | Artifact Registry | Container Registry (ACR) |

AKS의 경우 GKE Autopilot처럼 노드를 완전히 위임할 수 없어서 노드 풀 설정이 좀 더 필요했다. 하지만 Spot 노드 + PDB(Pod Disruption Budget) 패턴은 동일하게 적용했다.

## 비용 비교 분석

| 항목 | AWS (월) | GCP GKE | Azure AKS |
|---|---|---|---|
| Compute | \~$80 (ECS Spot) | \~$45 | \~$50 |
| Load Balancer | \~$32 (4개 ALB) | \~$18 | \~$20 |
| Database | \~$30 (RDS) | \~$10 | \~$12 |
| Storage | \~$5 | \~$5 | \~$5 |
| 기타 | \~$50 | \~$10 | \~$10 |
| **합계** | **\~$200** | **\~$88** | **\~$97** |

세 클라우드 모두 Spot/Preemptible 인스턴스를 사용한 기준이다.

## ALB 통합 최적화

AWS에서는 서비스별로 ALB를 분리해서 4개가 돌아가고 있었다.

**최적화 후**
- 1개 public ALB(host 기반 라우팅)
- 1개 internal ALB(path 기반 라우팅)
- **절감액**: ALB 통합만으로 월 \~$16 절감

GCP에서는 Global HTTP(S) LB 하나로 경로 기반 라우팅을 처리한다. Azure에서는 Azure CDN + AKS Ingress로 처리한다. 두 클라우드 모두 AWS의 ALB 과다 문제가 구조적으로 발생하지 않았다.

## 네트워크 보안 비교

**AWS (3계층)**
```
Public Subnet (ALB)
  ↓
Private Subnet (ECS)
  ↓
Database Subnet (RDS)
```

Security Group 체이닝으로 계층 간 통신 제어

**GCP (3계층 + Workload Identity)**
```
Public Zone (GLB + Cloud CDN)
  ↓
Private Zone (GKE Autopilot + Milvus VM)
  ↓
Database Zone (Cloud SQL, Private IP)
```

네트워크 분리 + Workload Identity로 Pod 수준 IAM 인증

**Azure (3계층 + NSG)**
```
Public Zone (CDN)
  ↓
Private Subnet (AKS + Milvus VM)
  ↓
Database Subnet (MySQL Flexible, Delegated)
```

NSG(Network Security Group) + Key Vault로 접근 제어

## 리소스 매핑

| AWS | GCP | Azure |
|---|---|---|
| ECS Fargate | GKE Autopilot | AKS |
| EC2 Spot | GKE Spot VM | AKS Spot Node |
| ALB | Global HTTP(S) LB | Azure CDN + Ingress |
| RDS MySQL | Cloud SQL | MySQL Flexible |
| S3 | Cloud Storage | Blob Storage |
| ECR | Artifact Registry | Container Registry |
| Secrets Manager | Secret Manager | Key Vault |
| CloudFront | Cloud CDN | Azure CDN |

## 현재 상태와 교훈

GCP와 Azure 중 아직 최종 결정이 나지 않은 상태다. 어느 쪽이 결정되더라도 Terraform 코드가 준비되어 있기 때문에 바로 적용할 수 있다.

### 두 벌을 미리 준비하면서 얻은 것

- **모듈 인터페이스 정제** — 클라우드 간 공통 인터페이스를 고민하면서 모듈 설계가 더 깔끔해졌다
- **의사결정 자료** — 고객사에 비용/아키텍처 비교 자료를 바로 제시할 수 있었다
- **전환 비용 최소화** — 결정이 나면 환경 파일 하나 추가하는 수준으로 배포 가능하다

### 교훈

- **Terraform 모듈 구조가 멀티클라우드의 핵심** — `modules/{cloud}/` 패턴으로 설계하면 클라우드 추가가 단순해진다
- **고객사 미결정은 준비의 기회** — 두 벌 준비가 낭비가 아니라 모듈 품질 향상으로 이어졌다
- **Serverless가 항상 답은 아니다** — 상시 운영이 필요한 워크로드에서는 콜드 스타트 회피 비용이 Spot VM보다 비쌀 수 있다
- **Spot/Preemptible은 PDB가 필수** — 어느 클라우드든 Spot 인스턴스를 쓰려면 Pod Disruption Budget 없이는 위험하다
- **비용 분석은 아키텍처 최적화를 이끈다** — ALB 통합, CDN 전환 같은 구조적 개선이 단순 스펙 조정보다 효과가 크다
