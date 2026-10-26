# 실시간 위치 공유 (loc-junlab)

운전자가 휴대폰으로 실시간 위치를 보내면, 공유받은 사람은 링크나 6자리 코드로 차량이 지금 어디쯤인지, 내 위치엔 언제 오는지 확인하는 웹 서비스입니다.
위치는 운전자 폰 **브라우저** 또는 화면을 꺼도 동작하는 **Traccar Client 앱**으로 보낼 수 있습니다.

| 화면 | 주소 | 설명 |
| --- | --- | --- |
| 승객 홈 | `/` | 6자리 조회 코드 입력 |
| 승객 조회 | `/p/:code` | 지도, 시간표, 내 정류장 도착 안내 |
| 관리자 | `/config` | 로그인 후 운행 현황, 노선 관리, 운행 기록 |
| 운전 | `/config/driver` | 위치 전송 방식·노선 선택 → 운행 화면 (도착 처리, 공유) |
| 위치 앱 | `/config/trackers` | Traccar Client 기기 등록과 설정 안내 |
| 사용자 | `/config/members` | 구글 로그인 허용 계정 관리 |

## 구조

```
backend/   Express 5 + Mongoose + zod (TypeScript)
  src/services/tracker.ts   정류장 도착/출발 판정 (순수 함수, 단위 테스트 있음)
  src/services/traccar.ts   Traccar Client(OsmAnd 프로토콜) 요청 파싱
  src/routes/               route(노선) · drive(운행) · public(승객 조회) · tracker(위치 앱) · og(미리보기)
frontend/  React 19 + Vite + react-bootstrap + react-leaflet
  src/pages/                admin · driver · passenger
  src/components/           공용 컴포넌트 (지도, 노선 편집기, 시간표 등)
  src/hooks/                useGeoTracker, useWakeLock, useSpeech, usePolling ...
deploy.sh  서버 배포 스크립트
```

### 정류장 판정 방식

- 운행을 시작하면 노선의 정류장(이름, 좌표, 예정 시각 등)을 운행 기록에 **스냅샷**으로 복사합니다. 운행 중에 노선을 수정해도 진행 중인 운행에는 영향이 없습니다.
- 서버는 "다음 목표 정류장(`currentIndex`)"부터 **순서대로만** 판정합니다.
  - 접근 반경 안 → `approaching` (방송 설정 시 안내 음성)
  - 도착 반경 안 → `arrived`
  - 도착 반경 × 1.5 밖 → `departed`
  - 정류장을 스치듯 지나가거나 전송 간격이 길어 건너뛴 경우 → 통과 처리
- 정확도가 100m보다 나쁜 좌표는 위치만 갱신하고 판정에는 쓰지 않습니다.
- 승객에게는 출발지에 도착한 뒤부터 차량 위치를 공개합니다.

## 화면을 끄고 위치 보내기 (Traccar Client)

웹 브라우저는 화면이 꺼지거나 다른 앱으로 전환되면 위치 추적을 멈춥니다. 화면을 끈 채로 운행하려면 운전자 폰에 무료 오픈소스 앱 [Traccar Client](https://www.traccar.org/client/)를 설치해 사용합니다.

1. 관리 화면 **위치 앱**에서 기기를 등록합니다. 기기 ID가 발급됩니다.
2. 기기 상세 화면의 안내대로 앱에 **Device identifier**(기기 ID)와 **Server URL**(`https://<도메인>/api/traccar`)을 입력하고 전송을 켭니다. 첫 위치가 들어오면 화면이 "연결됨"으로 바뀝니다.
3. 운전 시작 화면에서 위치 전송 방식으로 해당 기기를 고르고 노선을 시작합니다. 진행 중인 운행에서도 상단 📡 버튼으로 바꿀 수 있습니다.

- 수신 API `/api/traccar`는 Traccar Client 9.x의 JSON 본문과 이전 버전·OsmAnd의 쿼리/form 파라미터를 모두 받습니다. 기기 ID가 인증 수단이므로 유출되면 **기기 ID 새로 발급**을 누르세요.
- 진행 중인 운행에 연결되어 있지 않을 때 들어온 위치는 연결 확인에만 쓰고 공유하지 않습니다.
- 오프라인 버퍼로 늦게 도착한 좌표는 궤적에만 추가하고 정류장 판정에는 쓰지 않습니다.

## 구글 로그인 설정

비밀번호 로그인만 써도 되고, 구글 로그인을 함께(또는 대신) 쓸 수 있습니다.

1. [Google Cloud Console](https://console.cloud.google.com/)에서 프로젝트를 선택(또는 생성)합니다.
2. **Google Auth Platform**(이전 이름: OAuth 동의 화면)으로 이동해 처음이라면 앱 정보를 등록합니다.
   - **Branding**: 앱 이름, 지원 이메일, 앱 도메인에 서비스 주소, 승인된 도메인에 `junlab.xyz`
   - **Audience**: 사용자 유형 **External**, 게시 상태를 **In production**으로 게시 (Testing 상태면 테스트 사용자로 등록한 100명만 로그인 가능)
   - **Data Access**: 별도 범위를 추가할 필요 없음 (로그인은 기본 범위 `openid`, `email`, `profile`만 사용)
3. **Clients → Create Client** → 애플리케이션 유형 **웹 애플리케이션**
   - 승인된 JavaScript 원본: `https://loc.junlab.xyz` (로컬 개발 시 `http://localhost:5173`도 추가)
   - 승인된 리디렉션 URI: 비워둠 (팝업 방식이라 필요 없음)
4. 만들어진 **클라이언트 ID**를 `backend/.env`의 `GOOGLE_CLIENT_ID`에, 내 구글 계정을 `ADMIN_EMAILS`에 넣고 `./deploy.sh`를 실행합니다. 클라이언트 보안 비밀번호(secret)는 사용하지 않습니다.
5. 다른 사람은 관리 화면 **사용자**에서 구글 이메일을 추가하면 로그인할 수 있습니다.

## 로컬 개발

필요: Node.js 22 이상, MongoDB (Docker로 띄워도 됩니다)

```bash
# MongoDB (선택)
docker run -d --name loc-mongo -p 27017:27017 mongo:7

# 백엔드
cd backend
cp .env.example .env   # MONGO_URI, ADMIN_PASSWORD, AUTH_SECRET 입력
npm install
npm run dev            # http://localhost:5678

# 프론트엔드 (다른 터미널)
cd frontend
npm install
npm run dev            # http://localhost:5173 (/api 는 백엔드로 프록시)
```

| 명령 | backend | frontend |
| --- | --- | --- |
| 개발 서버 | `npm run dev` | `npm run dev` |
| 타입 체크 | `npm run typecheck` | `npm run build` |
| 테스트 / 린트 | `npm test` | `npm run lint` |

> 휴대폰으로 운전자 화면을 테스트하려면 위치 API가 HTTPS에서만 동작하므로 배포 환경이나 터널(예: `cloudflared`, `ngrok`)을 이용하세요.

## 환경변수 (`backend/.env`)

| 이름 | 필수 | 설명 |
| --- | --- | --- |
| `MONGO_URI` | ✔ | MongoDB 접속 문자열 |
| `AUTH_SECRET` | ✔ | 로그인 토큰 서명키 (`openssl rand -hex 32`, `deploy.sh`가 자동 생성) |
| `ADMIN_PASSWORD` | △ | 비밀번호 로그인. 비우면 비활성화 |
| `GOOGLE_CLIENT_ID` | △ | 구글 로그인 OAuth 클라이언트 ID. 비우면 비활성화 |
| `ADMIN_EMAILS` | | 항상 로그인을 허용할 구글 계정 (쉼표 구분) |
| `PUBLIC_URL` | | 공유 링크 미리보기에 쓸 서비스 주소 (비우면 요청 주소 기준) |
| `AUTH_TTL_HOURS` | | 로그인 유지 시간, 기본 168 |
| `CORS_ORIGINS` | | 다른 도메인에서 API를 호출할 때 허용할 origin (쉼표 구분) |
| `STALE_DRIVE_HOURS` | | 위치 갱신이 없으면 자동 종료할 시간, 기본 12 |
| `SHARE_EXPIRE_HOURS` | | 운행 종료 후 공유 링크 유효 시간, 기본 24 |

△: `ADMIN_PASSWORD`와 `GOOGLE_CLIENT_ID` 중 하나 이상은 반드시 설정해야 합니다.

프론트엔드 빌드 시 `SITE_URL`(기본 `https://loc.junlab.xyz`)로 OG 이미지 주소, canonical, `robots.txt`, `sitemap.xml`을 만듭니다. 다른 도메인에 배포하면 서버에서 `SITE_URL=https://example.com ./deploy.sh`처럼 지정하세요.

## 아이콘·공유 미리보기·SEO

- 아이콘: `frontend/public/` (`favicon.svg`, `apple-touch-icon.png`, `icon-192/512.png`, 마스커블 아이콘, `site.webmanifest`)
- 공유 미리보기: `og-image.png`(1200×630)와 OG/Twitter 메타 태그. 카카오톡 등 미리보기 봇이 공유 링크(`/p/:code`)를 요청하면 nginx가 백엔드 `/api/og/p/:code`로 넘겨 노선 이름이 들어간 미리보기를 보여줍니다.
- 검색: 홈만 색인되도록 sitemap에 `/`만 넣고, 공유 링크·관리 화면은 `noindex` 처리합니다.
- 카카오톡은 미리보기를 캐시하므로 이미지를 바꾼 뒤에는 [카카오 공유 디버거](https://developers.kakao.com/tool/debugger/sharing)에서 캐시를 초기화하세요.

## 배포

서버에서 저장소를 clone 한 뒤:

```bash
./deploy.sh            # git pull → 빌드 → 재시작 → 헬스체크
```

- 처음 실행하면 `backend/.env`를 만들고 `AUTH_SECRET`을 자동 생성합니다. `MONGO_URI`와 로그인 방식(`ADMIN_PASSWORD` 또는 `GOOGLE_CLIENT_ID`)을 채운 뒤 다시 실행하세요.
- `./deploy.sh status | logs | restart | down | --no-pull` 도 사용할 수 있습니다.
- 포트: 프론트 `5678`(nginx, `/api`는 백엔드로 프록시), 백엔드 `5679`. 외부 Nginx에서는 도메인 전체를 `5678`로 넘기는 것을 권장합니다. `/api`만 `5679`로 넘기는 기존 구성도 동작하지만, 이때도 나머지 경로는 `5678`로 넘겨야 공유 링크 미리보기가 동작합니다.
