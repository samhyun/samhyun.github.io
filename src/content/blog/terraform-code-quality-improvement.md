---
title: 'Terraform 코드 품질 3/10에서 8/10으로 — Terraformer 자동 생성 코드를 프로덕션 수준으로 개선하기'
description: 'Terraformer로 AWS 인프라를 임포트한 결과 50개 파일 3500줄이 나왔지만 품질은 낮았다. 보안 개선과 모듈화 그리고 상태 관리 중앙화와 비용 최적화까지 프로덕션 수준으로 개선한 과정을 정리한다.'
pubDate: 2026-03-20
category: devops
tags: ['terraform', 'iac', 'code-quality', 'aws', 'security']
featured: false
draft: false
---

## 왜 Terraform을 도입했나

이전 회사에서 DevOps 팀이 인프라를 Terraform으로 관리하고 있었다. git으로 변경 이력이 추적되고 환경 복제도 변수만 바꿔서 apply 한 번이면 끝이라는 점이 좋았다.

새 프로젝트를 시작하면서 기존에 구축된 AWS 인프라를 살펴봤는데 통일된 형태 없이 제각각이었다. 누가 어떤 의도로 만들었는지 히스토리도 없고 콘솔에서 직접 확인하지 않으면 현재 상태를 파악할 방법이 없었다. Terraform 도입을 제안해서 직접 주도하게 됐다.

## 문제: Terraformer Import의 한계

이미 콘솔로 만들어진 AWS 인프라가 상당했다. 처음부터 다시 쓰는 대신 Terraformer로 기존 인프라를 코드로 임포트하는 방식을 선택했다. 결과물은 이랬다.

- 50+ 개 파일
- 3500+ 줄의 코드
- 품질 점수: **3/10**

코드가 생성되긴 했지만 작동하는 코드와 프로덕션 수준 코드는 다르다는 걸 바로 느꼈다.

## 품질 평가 매트릭스

이전 회사에서 봤던 프로덕션급 Terraform 코드와 비교해보니 차이가 명확했다.

| 지표 | Terraformer (3/10) | 프로덕션 수준 (8/10) |
|------|---|---|
| 변수화 | 0% (모두 하드코드) | 90% 파라미터화 |
| 모듈화 | 없음 (플랫 구조) | 3개 이상 재사용 모듈 |
| 환경 분리 | dev만 | dev/staging/prod/shared |
| 상태 관리 | 12개 로컬 파일 | S3 중앙화 + DynamoDB 잠금 |
| 보안 | API 키 평문 | Secrets Manager |
| 배포 | 수동 | 3단계 카나리 |
| 가독성 | 낮음 (tfer-- 프리픽스) | 명확한 명칭 |
| 문서화 | 없음 | 코드 주석 + README |

## 문제 1: 보안 취약점

### API 키 평문 노출
```hcl
# ❌ Terraformer 생성 코드
environment {
  name  = "OPENAI_API_KEY"
  value = "sk-xxxxxxxxxxxxxxxxxxxxxxxx"  # 상태 파일에도 노출!
}
```

### 과도하게 열린 보안 그룹
```hcl
# ❌ RDS가 전 세계에 열려있음
ingress {
  from_port   = 3306
  to_port     = 3306
  cidr_blocks = ["0.0.0.0/0"]
}
```

### 해결책: Secrets Manager + 보안 그룹 체이닝
```hcl
# ✅ Secrets Manager 사용
secrets = [
  { name = "OPENAI_API_KEY", valueFrom = aws_secretsmanager_secret.openai.arn }
]

# ✅ 보안 그룹 체이닝
ingress {
  from_port       = 3306
  to_port         = 3306
  security_groups = [aws_security_group.app.id]  # app SG에서만
}
```

## 문제 2: 모듈화 부재

### Before (플랫 구조)
```
terraform/generated/aws/
├── vpc/
├── subnet/
├── sg/
├── alb/
├── ecs/
├── rds/
├── ecr/
├── s3/
└── ... (12개 디렉토리, 각각 자체 상태)
```

### After (모듈식 구조)
```
terraform/
├── environments/
│   ├── aws/dev/main.tf
│   ├── aws/staging/main.tf
│   └── aws/prod/main.tf
└── modules/
    └── aws/
        ├── networking/
        ├── compute/
        ├── database/
        ├── storage/
        ├── cdn/
        └── secrets/
```

이 구조는 나중에 GCP나 Azure 모듈을 추가할 때도 그대로 확장할 수 있었다. `modules/gcp/`나 `modules/azure/`를 같은 패턴으로 만들면 된다.

### 모듈 예시
```hcl
module "ecs_service" {
  source = "../../modules/aws/compute/ecs-service"

  service_name    = "api-service"
  cluster_id      = module.ecs_cluster.id
  task_definition = aws_ecs_task_definition.service.arn
  desired_count   = var.service_count

  subnets         = module.vpc.private_subnet_ids
  security_groups = [module.sg.app_sg_id]
}
```

## 문제 3: 상태 관리

### Before: 12개 로컬 상태 파일
- 각 Terraformer 디렉토리마다 자체 `terraform.tfstate`
- 동시 수정 위험 (잠금 메커니즘 없음)
- 암호화 없음 → 민감 데이터 노출
- 팀 협업 불가능

### After: 중앙화된 원격 상태
```hcl
terraform {
  backend "s3" {
    bucket         = "project-terraform-state"
    key            = "dev/terraform.tfstate"
    region         = "ap-northeast-2"
    encrypt        = true
    dynamodb_table = "terraform-lock"
  }
}
```

## 문제 4: 환경 분리 전략

### 환경별 변수 파일
```hcl
# environments/aws/dev/terraform.tfvars
environment    = "dev"
instance_type  = "t3.medium"
desired_count  = 1
rds_instance   = "db.t4g.micro"

# environments/aws/prod/terraform.tfvars
environment    = "prod"
instance_type  = "t3.large"
desired_count  = 3
rds_instance   = "db.r6g.large"
```

## 문제 5: 비용 낭비 (4개 ALB)

### Before: 6개 서비스를 위해 4개 ALB
- admin ALB, client ALB, admin-client ALB, service ALB
- 각 ALB: \~$8/월 = 로드밸런서만 $32/월

### After: 2개 ALB + 라우팅 규칙
- Public ALB: 호스트 기반 라우팅
- Internal ALB: 경로 기반 라우팅
- **절감: \~$16/월**

## 개선 로드맵

### Phase 1: 보안 (즉시 - P0)
- 모든 시크릿을 Secrets Manager로 이동
- 보안 그룹을 VPC 내부로 제한
- 상태 암호화 활성화

### Phase 2: 상태 마이그레이션 (1주일)
- S3 백엔드 + DynamoDB 잠금 테이블 생성
- 12개 로컬 상태를 단일 원격 상태로 마이그레이션
- 상태 버전 관리 활성화

### Phase 3: 모듈화 (2\~3주)
- 플랫 코드에서 재사용 모듈 추출
- 환경별 구성 생성
- 변수 파일 구현

### Phase 4: 배포 전략 (1개월)
- 3단계 카나리 배포 구현 (Slot A/B)
- 자동 스케일링 + 스케줄링 추가
- 모니터링 알람 설정

## 3단계 카나리 배포

```hcl
variable "deployment_mode" {
  type    = string
  default = "production"
  # production | closed_canary | opened_canary
}

# Slot A: 현재 프로덕션
resource "aws_ecs_service" "slot_a" {
  desired_count = var.deployment_mode == "production" ?
                  var.task_count : var.task_count
}

# Slot B: 카나리
resource "aws_ecs_service" "slot_b" {
  desired_count = var.deployment_mode == "production" ?
                  0 : var.task_count
}
```

**흐름**: Production → Closed-Canary (내부만) → Opened-Canary (특정 IP) → 전환

## Dev 환경 비용 최적화

```hcl
# 확장: 월-금 09:00
resource "aws_autoscaling_schedule" "scale_up" {
  recurrence      = "0 9 * * 1-5"
  desired_capacity = var.desired_capacity
}

# 축소: 월-금 19:00
resource "aws_autoscaling_schedule" "scale_down" {
  recurrence       = "0 19 * * 1-5"
  desired_capacity = 0
}
```

업무 시간 외에는 인스턴스가 꺼지므로 dev 환경 비용을 약 70% 절감할 수 있었다.

---

## 참고

- [Terraformer — GitHub](https://github.com/GoogleCloudPlatform/terraformer)
- [Terraform Backend Configuration](https://developer.hashicorp.com/terraform/language/backend)
- [Terraform Module Best Practices](https://developer.hashicorp.com/terraform/tutorials/modules/pattern-module-creation)
