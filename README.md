# 실시간 위치 공유 (loc-junlab)

운전자가 휴대폰 브라우저로 실시간 위치를 보내면, 승객은 공유받은 링크나 6자리 코드로 차량 위치, 정류장 도착/출발, 지연 정보를 확인하는 웹 서비스입니다.

| 화면 | 주소 | 설명 |
| --- | --- | --- |
| 승객 홈 | `/` | 6자리 조회 코드 입력 |
| 승객 조회 | `/p/:code` | 지도, 시간표, 내 정류장 도착 안내 |
| 관리자 | `/config` | 로그인 후 운행 현황, 노선 관리, 운행 기록 |
| 운전 | `/config/driver` | 노선 선택 → 운행 화면 (위치 전송, 도착 처리, 공유) |

## 구조

```
backend/   Express 5 + Mongoose + zod (TypeScript)
  src/services/tracker.ts   정류장 도착/출발 판정 (순수 함수, 단위 테스트 있음)
  src/routes/               route(노선) · drive(운행) · public(승객 조회)
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
| `ADMIN_PASSWORD` | ✔ | 관리자/운전자 로그인 비밀번호 |
| `AUTH_SECRET` | ✔ | 로그인 토큰 서명키 (`openssl rand -hex 32`) |
| `AUTH_TTL_HOURS` | | 로그인 유지 시간, 기본 168 |
| `CORS_ORIGINS` | | 다른 도메인에서 API를 호출할 때 허용할 origin (쉼표 구분) |
| `STALE_DRIVE_HOURS` | | 위치 갱신이 없으면 자동 종료할 시간, 기본 12 |
| `SHARE_EXPIRE_HOURS` | | 운행 종료 후 공유 링크 유효 시간, 기본 24 |

## 배포

서버에서 저장소를 clone 한 뒤:

```bash
./deploy.sh            # git pull → 빌드 → 재시작 → 헬스체크
```

- 처음 실행하면 `backend/.env`를 만들고 `AUTH_SECRET`을 자동 생성합니다. `MONGO_URI`와 `ADMIN_PASSWORD`를 채운 뒤 다시 실행하세요.
- `./deploy.sh status | logs | restart | down | --no-pull` 도 사용할 수 있습니다.
- 포트: 프론트 `5678`(nginx, `/api`는 백엔드로 프록시), 백엔드 `5679`. 외부 Nginx에서는 도메인 전체를 `5678`로 넘기면 됩니다. 기존처럼 `/api`만 `5679`로 넘겨도 동작합니다.
