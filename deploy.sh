#!/usr/bin/env bash
#
# 서버 배포 스크립트
#
#   ./deploy.sh            최신 코드 받기(git pull) → 빌드 → 재시작 → 헬스체크
#   ./deploy.sh --no-pull  현재 코드 그대로 빌드/재시작
#   ./deploy.sh status     컨테이너 상태 + 헬스체크
#   ./deploy.sh logs       로그 보기 (Ctrl+C 로 종료)
#   ./deploy.sh restart    빌드 없이 재시작
#   ./deploy.sh down       중지
#
set -euo pipefail

cd "$(dirname "$0")"

BACKEND_ENV=backend/.env
BACKEND_PORT=5679   # docker-compose.yml 의 백엔드 호스트 포트
FRONTEND_PORT=5678  # docker-compose.yml 의 프론트엔드 호스트 포트
HEALTH_TIMEOUT=90   # 초

if [ -t 1 ]; then
  C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_DIM=$'\033[2m'; C_END=$'\033[0m'
else
  C_OK=''; C_WARN=''; C_ERR=''; C_DIM=''; C_END=''
fi
step() { echo "${C_DIM}▶${C_END} $*"; }
ok()   { echo "${C_OK}✔${C_END} $*"; }
warn() { echo "${C_WARN}!${C_END} $*"; }
die()  { echo "${C_ERR}✖ $*${C_END}" >&2; exit 1; }

# docker compose v2 우선, 없으면 v1
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  die "docker compose 가 설치되어 있지 않습니다."
fi

check_env() {
  if [ ! -f "$BACKEND_ENV" ]; then
    cp backend/.env.example "$BACKEND_ENV"
    # 토큰 서명키는 자동 생성
    secret=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
    sed -i.bak "s|^AUTH_SECRET=.*|AUTH_SECRET=${secret}|" "$BACKEND_ENV" && rm -f "$BACKEND_ENV.bak"
    chmod 600 "$BACKEND_ENV"
    die "$BACKEND_ENV 파일을 만들었습니다. MONGO_URI 와 ADMIN_PASSWORD 를 채운 뒤 다시 실행해주세요."
  fi

  local missing=()
  for key in MONGO_URI ADMIN_PASSWORD AUTH_SECRET; do
    value=$(grep -E "^${key}=" "$BACKEND_ENV" | tail -1 | cut -d= -f2- || true)
    if [ -z "$value" ] || [ "$value" = "change-me" ] || [[ "$value" == *USER:PASSWORD@HOST* ]]; then
      missing+=("$key")
    fi
  done
  [ ${#missing[@]} -eq 0 ] || die "$BACKEND_ENV 에 값을 채워주세요: ${missing[*]}"
}

health() {
  # 백엔드 직접 + 프론트(nginx 프록시) 경유 둘 다 확인
  curl -fsS "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null 2>&1 &&
    curl -fsS "http://127.0.0.1:${FRONTEND_PORT}/api/health" >/dev/null 2>&1
}

wait_healthy() {
  step "헬스체크 (최대 ${HEALTH_TIMEOUT}초)"
  local waited=0
  until health; do
    if [ "$waited" -ge "$HEALTH_TIMEOUT" ]; then
      echo
      warn "헬스체크 실패. 최근 백엔드 로그:"
      "${COMPOSE[@]}" logs --tail 40 backend || true
      return 1
    fi
    printf '.'
    sleep 3
    waited=$((waited + 3))
  done
  [ "$waited" -gt 0 ] && echo
  ok "서비스 정상 (http://localhost:${FRONTEND_PORT})"
}

status() {
  "${COMPOSE[@]}" ps
  if health; then ok "헬스체크 정상"; else warn "헬스체크 실패"; fi
}

deploy() {
  local pull=true
  [ "${1:-}" = "--no-pull" ] && pull=false

  check_env

  local before after
  before=$(git rev-parse --short HEAD 2>/dev/null || echo "-")
  if $pull; then
    step "최신 코드 받는 중 ($(git rev-parse --abbrev-ref HEAD))"
    if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
      die "서버에 커밋되지 않은 변경이 있습니다. 정리 후 다시 실행하거나 --no-pull 을 사용하세요."
    fi
    git pull --ff-only
  fi
  after=$(git rev-parse --short HEAD 2>/dev/null || echo "-")
  if [ "$before" = "$after" ]; then
    ok "버전: $after"
  else
    ok "버전: $before → $after"
    git --no-pager log --oneline "${before}..${after}" | head -10 | sed 's/^/    /'
  fi

  step "이미지 빌드"
  "${COMPOSE[@]}" build --pull
  step "컨테이너 재시작"
  "${COMPOSE[@]}" up -d --remove-orphans

  if ! wait_healthy; then
    if [ "$before" != "$after" ] && [ "$before" != "-" ]; then
      warn "이전 버전으로 되돌리려면: git checkout $before && ./deploy.sh --no-pull"
    fi
    exit 1
  fi

  step "사용하지 않는 이미지 정리"
  docker image prune -f >/dev/null
  ok "배포 완료"
}

case "${1:-}" in
  ""|--no-pull) deploy "${1:-}" ;;
  status)       status ;;
  logs)         "${COMPOSE[@]}" logs -f --tail 100 ;;
  restart)      "${COMPOSE[@]}" restart && wait_healthy ;;
  down)         "${COMPOSE[@]}" down ;;
  -h|--help|help) sed -n '3,11p' "$0" | sed 's/^# \{0,1\}//' ;;
  *) die "알 수 없는 명령: $1 (./deploy.sh help 참고)" ;;
esac
