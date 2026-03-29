---
title: 'AWS Cognito와 S3를 활용한 파일 업로드 기능 구현'
description: 'AWS Cognito Identity Pool과 S3를 연동하여 인증 기반 파일 업로드를 구현하는 방법을 백엔드(Java)와 클라이언트(JavaScript) 양쪽에서 설명한다.'
pubDate: 2023-05-20
category: 'aws'
tags: ['aws', 'cognito', 's3', 'file-upload', 'java']
draft: false
---

S3 파일 업로드만 놓고 보면 Presigned URL로도 충분하다. 그런데 프론트엔드에서 S3 외에 다른 AWS 리소스까지 접근해야 하는 경우가 생길 수 있다. 그때마다 별도 인증 흐름을 만드는 것보다 Cognito Identity Pool로 임시 자격 증명을 통합 관리하는 쪽이 확장성과 보안 면에서 낫다고 판단했다.

이 글에서는 Cognito 기반 파일 업로드를 단계별로 구현하고 Presigned URL 방식과의 차이도 함께 정리한다.

---

## 1. S3 버킷 생성 및 CORS 설정

### 1.1 S3 버킷 생성

AWS Management Console에서 S3 버킷을 생성한다.
- **Public Access 차단** — 버킷 생성 시 **모든 퍼블릭 액세스 차단**을 설정한다.
- **버전 관리** — 필요에 따라 버전 관리를 활성화하면 파일 덮어쓰기 시 복원이 가능하다.
- **암호화** — SSE-S3 또는 SSE-KMS를 활용한 서버 측 암호화를 권장한다.

### 1.2 CORS 설정

파일 업로드를 위해 S3 버킷의 CORS 설정을 아래와 같이 구성한다.

```json
[
    {
        "AllowedHeaders": ["*"],
        "AllowedMethods": ["HEAD", "GET", "PUT", "POST", "DELETE"],
        "AllowedOrigins": ["https://your-domain.com"],
        "ExposeHeaders": ["ETag", "x-amz-request-id"],
        "MaxAgeSeconds": 3600
    }
]
```

> **주의** — 운영 환경에서는 `AllowedOrigins`를 `"*"` 대신 실제 도메인으로 제한한다. 위 예시처럼 특정 도메인만 허용하는 것이 보안상 안전하다.

---

## 2. Cognito Identity Pool 생성

1. **Cognito Identity Pool 생성** — AWS Cognito에서 Identity Pool을 생성한다.
   - **자격 증명 풀 이름**: 자유롭게 입력한다.
   - **인증 공급자**: 사용자 지정 → 공급자 이름 입력(예: `custom-auth`).

2. **풀 생성 완료 후 IAM 설정 페이지 이동** — 생성된 Identity Pool에 대한 권한을 설정하기 위해 IAM 정책을 구성한다.

---

## 3. IAM 정책 설정

Cognito Identity Pool은 **인증된 사용자**와 **인증되지 않은 사용자**의 두 가지 권한을 설정할 수 있다.
파일 업로드 권한을 설정하려면 다음과 같은 IAM 정책을 추가한다.

### 파일 업로드 권한 정책 (최소 권한 원칙 적용)

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "CognitoBasePermissions",
            "Effect": "Allow",
            "Action": [
                "cognito-identity:GetCredentialsForIdentity"
            ],
            "Resource": "*"
        },
        {
            "Sid": "S3FileUploadPermission",
            "Effect": "Allow",
            "Action": [
                "s3:PutObject"
            ],
            "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/uploads/${cognito-identity.amazonaws.com:sub}/*"
        }
    ]
}
```

주요 보안 포인트:
- **최소 권한 원칙** — `cognito-identity:*` 대신 필요한 권한만 부여한다.
- **경로 제한** — `${cognito-identity.amazonaws.com:sub}`를 사용하여 사용자별로 업로드 경로를 분리한다. 다른 사용자의 파일에 접근하는 것을 방지할 수 있다.
- `s3:PutObject`만 허용하여 읽기/삭제 권한을 제외한다.

> **참고** — 로그인하지 않은 사용자의 파일 업로드를 허용하려면 **인증되지 않은 사용자 권한**에도 동일한 S3 권한을 설정한다. 이 경우 업로드 경로와 파일 크기 제한을 더 엄격하게 설정하는 것을 권장한다.

---

## 4. 백엔드: Cognito Token 발급

Cognito Identity Pool 생성이 완료되면 백엔드에서 Cognito Token 발급 코드를 구현한다.
토큰 발급은 사용자 인증이 성공한 경우에만 수행된다.

### Java 코드 구현

```java
import software.amazon.awssdk.services.cognitoidentity.CognitoIdentityClient;
import software.amazon.awssdk.services.cognitoidentity.model.*;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;

import java.util.Map;

public class CognitoTokenService {

    private static final String IDENTITY_POOL_ID = "YOUR_COGNITO_IDENTITY_POOL_ID";
    private static final String PROVIDER_NAME = "YOUR_IDENTITY_PROVIDER_NAME";
    private static final long TOKEN_DURATION = 3600L;

    private final CognitoIdentityClient client;

    public CognitoTokenService() {
        this.client = CognitoIdentityClient.builder()
                .region(Region.AP_NORTHEAST_2)
                .credentialsProvider(DefaultCredentialsProvider.create())
                .build();
    }

    public CognitoTokenResponse generateToken(String endUserId) {
        try {
            GetOpenIdTokenForDeveloperIdentityRequest request =
                    GetOpenIdTokenForDeveloperIdentityRequest.builder()
                        .identityPoolId(IDENTITY_POOL_ID)
                        .logins(Map.of(PROVIDER_NAME, endUserId))
                        .tokenDuration(TOKEN_DURATION)
                        .build();

            GetOpenIdTokenForDeveloperIdentityResponse response =
                    client.getOpenIdTokenForDeveloperIdentity(request);

            return new CognitoTokenResponse(response.token(), response.identityId());
        } catch (CognitoIdentityException e) {
            throw new RuntimeException("Cognito 토큰 발급 실패: " + e.awsErrorDetails().errorMessage(), e);
        }
    }
}

class CognitoTokenResponse {
    private final String token;
    private final String identityId;

    public CognitoTokenResponse(String token, String identityId) {
        this.token = token;
        this.identityId = identityId;
    }

    public String getToken() { return token; }
    public String getIdentityId() { return identityId; }
}
```

- `IDENTITY_POOL_ID`: 생성한 Identity Pool ID다.
- `PROVIDER_NAME`: Cognito 생성 시 입력한 공급자 이름이다.
- `endUserId`: 인증된 사용자의 고유 식별자다(예: 이메일, 사용자 ID 등).

**응답**: `CognitoTokenResponse`를 통해 발급된 `cognitoToken`과 `identityId`를 클라이언트로 반환한다.

### 토큰 만료 시간 주의점

`tokenDuration`을 짧게 설정하고 싶어도 Cognito의 `GetOpenIdTokenForDeveloperIdentity`는 **최소 만료 시간이 제한**되어 있다. Developer Identity 토큰의 경우 아무리 짧게 설정해도 일정 시간(기본 최소 약 15분) 이하로는 줄어들지 않는다. 보안상 토큰 유효 시간을 최소화하려 했지만 Cognito 쪽에서 강제하는 하한이 있어서 원하는 만큼 줄이지 못했다.

이 부분은 Cognito의 설계 제약이다. 토큰 만료를 세밀하게 제어해야 하는 경우 Cognito 토큰 자체보다 **애플리케이션 레벨에서 세션 만료를 별도로 관리**하거나 Presigned URL 방식으로 전환하는 것을 고려한다.

---

## 5. 클라이언트: 파일 업로드 구현

백엔드에서 전달받은 `cognitoToken`과 `identityId`를 사용하여 AWS SDK를 통해 S3에 파일을 업로드한다.

### AWS SDK 설정

```javascript
AWS.config.region = 'ap-northeast-2';
AWS.config.credentials = new AWS.CognitoIdentityCredentials({
    IdentityPoolId: 'YOUR_COGNITO_IDENTITY_POOL_ID',
    IdentityId: 'COGNITO_IDENTITY_ID',
    Logins: {
        'cognito-identity.amazonaws.com': 'COGNITO_TOKEN'
    }
});
```

### 파일 업로드 함수 구현

```javascript
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'];

function validateFile(file) {
    if (file.size > MAX_FILE_SIZE) {
        throw new Error(`파일 크기는 ${MAX_FILE_SIZE / 1024 / 1024}MB 이하만 허용됩니다.`);
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
        throw new Error(`허용되지 않는 파일 형식입니다: ${file.type}`);
    }
}

function uploadFile(file, onProgress) {
    validateFile(file);

    // 파일명 충돌 방지를 위한 고유 키 생성
    const timestamp = Date.now();
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `uploads/${timestamp}_${safeFileName}`;

    const upload = new AWS.S3.ManagedUpload({
        params: {
            Bucket: 'YOUR_BUCKET_NAME',
            Key: key,
            Body: file,
            ContentType: file.type
        }
    });

    // 업로드 진행률 콜백
    upload.on('httpUploadProgress', (progress) => {
        const percent = Math.round((progress.loaded / progress.total) * 100);
        if (onProgress) onProgress(percent);
    });

    return upload.promise()
        .then(data => {
            console.log("Upload Success!", data.Location);
            return data;
        })
        .catch(err => {
            console.error("Upload Failed.", err);
            throw err;
        });
}
```

---

## 6. 대용량 파일: Multipart Upload

10MB를 초과하는 대용량 파일의 경우 `AWS.S3.ManagedUpload`이 자동으로 **Multipart Upload**를 수행한다. 별도 설정 없이도 동작하지만 파트 크기를 조정할 수 있다.

```javascript
const upload = new AWS.S3.ManagedUpload({
    partSize: 10 * 1024 * 1024,  // 파트 크기: 10MB
    queueSize: 3,                 // 동시 업로드 파트 수
    params: {
        Bucket: 'YOUR_BUCKET_NAME',
        Key: key,
        Body: file
    }
});
```

대용량 파일을 허용하는 경우 IAM 정책에 Multipart Upload 관련 권한을 추가한다.

```json
{
    "Action": [
        "s3:PutObject",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts"
    ],
    "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/uploads/*"
}
```

---

## 7. 대안: Presigned URL 방식

인증된 사용자의 업로드는 Cognito로 처리하면 되지만 **인증되지 않은 사용자**가 파일을 업로드해야 하는 경우도 있다. 예를 들어 회원가입 과정에서 프로필 이미지나 서류를 첨부하는 경우다. 이때 Cognito의 비인증 사용자 권한을 열어주는 것보다 **Presigned URL**로 처리하는 쪽이 더 깔끔하다. 백엔드에서 URL을 발급하는 시점에 파일 크기나 경로를 제한할 수 있고 클라이언트에 AWS 자격 증명을 전달하지 않아도 된다.

### 백엔드: Presigned URL 생성

```java
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PutObjectPresignRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

import java.time.Duration;

public class PresignedUrlService {

    private final S3Presigner presigner;

    public PresignedUrlService() {
        this.presigner = S3Presigner.builder()
                .region(Region.AP_NORTHEAST_2)
                .build();
    }

    public String generateUploadUrl(String bucket, String key, String contentType) {
        PutObjectRequest objectRequest = PutObjectRequest.builder()
                .bucket(bucket)
                .key(key)
                .contentType(contentType)
                .build();

        PutObjectPresignRequest presignRequest = PutObjectPresignRequest.builder()
                .signatureDuration(Duration.ofMinutes(15))
                .putObjectRequest(objectRequest)
                .build();

        return presigner.presignPutObject(presignRequest).url().toString();
    }
}
```

### 클라이언트: Presigned URL로 업로드

```javascript
async function uploadWithPresignedUrl(file) {
    // 1. 백엔드에서 Presigned URL 요청
    const response = await fetch('/api/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            fileName: file.name,
            contentType: file.type
        })
    });
    const { uploadUrl } = await response.json();

    // 2. Presigned URL로 직접 S3에 업로드
    await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file
    });
}
```

### Cognito vs Presigned URL 비교

| 항목 | Cognito Identity Pool | Presigned URL |
|---|---|---|
| 클라이언트 AWS SDK 필요 | 필요 | 불필요 |
| 보안 모델 | 임시 자격 증명 발급 | URL 자체에 서명 포함 |
| 파일 크기 제한 | SDK가 Multipart 자동 처리 | 5GB (단일 PUT) |
| 적합한 경우 | 다양한 AWS 서비스 연동 필요 시 | 단순 파일 업로드 또는 비인증 사용자 업로드 시 |
| 복잡도 | 높음 (IAM, Cognito 설정) | 낮음 (백엔드 API 하나) |

---

## 파일 업로드 동작 흐름

### Cognito 방식

```
사용자 → 백엔드(인증) → Cognito Token 발급 → 클라이언트
클라이언트 → AWS SDK 인증 → S3 직접 업로드
```

### Presigned URL 방식

```
사용자 → 백엔드(인증) → Presigned URL 생성 → 클라이언트
클라이언트 → Presigned URL로 S3 직접 업로드 (AWS SDK 불필요)
```

---

## 보안 고려사항

1. **CORS 제한** — `AllowedOrigins`를 실제 도메인으로 제한한다.
2. **파일 유형 검증** — 클라이언트와 서버 양쪽에서 허용된 MIME 타입을 검증한다.
3. **파일 크기 제한** — 업로드 가능한 최대 파일 크기를 설정한다.
4. **버킷 정책** — Public Access를 완전히 차단하고 IAM 정책으로만 접근을 제어한다.
5. **토큰 만료 시간** — Cognito 토큰과 Presigned URL의 유효 시간을 최소한으로 설정한다.
6. **업로드 경로 분리** — 사용자별 디렉토리를 분리하여 다른 사용자 파일에 대한 접근을 차단한다.
7. **서버 측 암호화** — S3 버킷에 기본 암호화(SSE-S3 또는 SSE-KMS)를 설정한다.

---

## 참고 자료

- [AWS Cognito 개발자 인증 자격 증명](https://docs.aws.amazon.com/ko_kr/cognito/latest/developerguide/developer-authenticated-identities.html)
- [AWS SDK를 사용한 S3 파일 업로드](https://docs.aws.amazon.com/ko_kr/sdk-for-javascript/v2/developer-guide/s3-example-photo-album.html)
- [S3 Presigned URL 가이드](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)
