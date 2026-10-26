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
#   ./deploy.sh db-backup  DB 백업 (backups/ 폴더)
#   ./deploy.sh db-shell   DB 셸 (mongosh)
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

gen_secret() { openssl rand -hex "${1:-32}" 2>/dev/null || head -c "${1:-32}" /dev/urandom | od -An -tx1 | tr -d ' \n'; }
env_value() { grep -E "^$1=" "$BACKEND_ENV" 2>/dev/null | tail -1 | cut -d= -f2- || true; }
# 값이 비어 있으면 채움 (KEY= 줄이 있으면 교체, 없으면 추가)
set_env() {
  if grep -qE "^$1=" "$BACKEND_ENV"; then
    sed -i.bak "s|^$1=.*|$1=$2|" "$BACKEND_ENV" && rm -f "$BACKEND_ENV.bak"
  else
    printf '\n%s=%s\n' "$1" "$2" >>"$BACKEND_ENV"
  fi
}

check_env() {
  local created=false
  if [ ! -f "$BACKEND_ENV" ]; then
    cp backend/.env.example "$BACKEND_ENV"
    chmod 600 "$BACKEND_ENV"
    created=true
  fi

  # 비밀값 자동 생성
  if [ -z "$(env_value AUTH_SECRET)" ]; then
    set_env AUTH_SECRET "$(gen_secret 32)"
    ok "AUTH_SECRET 을 생성했습니다."
  fi
  local mongo_uri
  mongo_uri=$(env_value MONGO_URI)
  if [ -n "$mongo_uri" ]; then
    # 외부 DB 사용. 예시값이 남아 있으면 중단
    if [[ "$mongo_uri" =~ (//USER[:@]|:PASSWORD@|@HOST[:/]|:PORT/|:PORT$) ]]; then
      die "MONGO_URI 에 예시값이 남아 있습니다. 내장 DB(docker-compose 의 mongo)를 쓰려면 $BACKEND_ENV 에서 MONGO_URI 줄을 지우고, 외부 DB를 쓰려면 실제 값으로 바꿔주세요."
    fi
  else
    # 내장 DB 사용
    [ -z "$(env_value MONGO_INITDB_ROOT_USERNAME)" ] && set_env MONGO_INITDB_ROOT_USERNAME admin
    if [ -z "$(env_value MONGO_INITDB_ROOT_PASSWORD)" ]; then
      if docker volume inspect "$(compose_project)_mongo-data" >/dev/null 2>&1; then
        die "DB 볼륨이 이미 있는데 MONGO_INITDB_ROOT_PASSWORD 가 비어 있습니다. 처음 DB를 만들 때 쓴 비밀번호를 $BACKEND_ENV 에 넣어주세요."
      fi
      set_env MONGO_INITDB_ROOT_PASSWORD "$(gen_secret 24)"
      ok "내장 MongoDB 관리자 비밀번호를 생성했습니다. ($BACKEND_ENV)"
    fi
  fi

  # 로그인 방식은 비밀번호 또는 구글 중 하나 이상
  local password
  password=$(env_value ADMIN_PASSWORD)
  [ "$password" = "change-me" ] && password=""
  if [ -z "$password" ] && [ -z "$(env_value GOOGLE_CLIENT_ID)" ]; then
    if $created; then
      die "$BACKEND_ENV 파일을 만들었습니다. 로그인 방식(ADMIN_PASSWORD 또는 GOOGLE_CLIENT_ID)을 채운 뒤 다시 실행해주세요."
    fi
    die "$BACKEND_ENV 에 로그인 방식(ADMIN_PASSWORD 또는 GOOGLE_CLIENT_ID)을 설정해주세요."
  fi
}

compose_project() {
  "${COMPOSE[@]}" config 2>/dev/null | awk '/^name:/ {print $2; exit}' || basename "$PWD"
}

# 내장 DB 컨테이너에서 명령 실행 (관리자 계정은 U, P 환경변수로 전달)
mongo_run() {
  [ -n "$(env_value MONGO_URI)" ] && die "외부 DB(MONGO_URI)를 사용 중입니다. 이 명령은 내장 DB 전용입니다."
  docker inspect bus-mongo >/dev/null 2>&1 || die "bus-mongo 컨테이너가 없습니다. 먼저 ./deploy.sh 로 배포하세요."
  local tty=()
  [ "${MONGO_TTY:-}" = 1 ] && tty=(-it)
  docker exec "${tty[@]}" \
    -e U="$(env_value MONGO_INITDB_ROOT_USERNAME)" \
    -e P="$(env_value MONGO_INITDB_ROOT_PASSWORD)" \
    -e DB="$(db_name)" \
    "$@"
}

db_name() { local db; db=$(env_value MONGO_DB); echo "${db:-loc}"; }

db_backup() {
  mkdir -p backups
  local file
  file="backups/$(db_name)-$(date +%Y%m%d-%H%M%S).archive.gz"
  step "DB 백업 → $file"
  mongo_run bus-mongo sh -c 'mongodump -u "$U" -p "$P" --authenticationDatabase admin --db "$DB" --archive --gzip --quiet' >"$file"
  ok "백업 완료 ($(du -h "$file" | cut -f1))"
}

db_shell() {
  MONGO_TTY=1 mongo_run bus-mongo sh -c 'mongosh -u "$U" -p "$P" --authenticationDatabase admin "$DB"'
}

health() {
  # 백엔드 직접 + 프론트(nginx 프록시) 경유 둘 다 확인
  curl -fsS "http://127.0.0.1:${BACKEND_PORT}/api/health" >/dev/null 2>&1 &&
    curl -fsS "http://127.0.0.1:${FRONTEND_PORT}/api/health" >/dev/null 2>&1
}

backend_state() {
  docker inspect -f '{{.State.Status}} {{.RestartCount}}' bus-backend 2>/dev/null || echo "missing 0"
}

show_backend_logs() {
  warn "최근 백엔드 로그:"
  "${COMPOSE[@]}" logs --no-log-prefix --tail "${1:-30}" backend 2>/dev/null |
    sed -E 's#(mongodb(\+srv)?://[^:/@]+:)[^@]+@#\1****@#g' || true
}

wait_healthy() {
  step "헬스체크 (최대 ${HEALTH_TIMEOUT}초)"
  local waited=0 state restarts initial_restarts
  initial_restarts=$(backend_state | cut -d' ' -f2)
  until health; do
    read -r state restarts <<<"$(backend_state)"
    # 백엔드가 죽거나 재시작을 반복하면 기다리지 않고 바로 원인 표시
    if [ "$state" = "exited" ] || [ "$state" = "dead" ] || [ "$restarts" -gt "$initial_restarts" ]; then
      echo
      warn "백엔드가 시작 중에 종료되었습니다 (상태: $state, 재시작 ${restarts}회)."
      show_backend_logs 30
      return 1
    fi
    if [ "$waited" -ge "$HEALTH_TIMEOUT" ]; then
      echo
      warn "헬스체크 시간 초과. DB 상태: $(curl -s "http://127.0.0.1:${BACKEND_PORT}/api/health" || echo '응답 없음')"
      show_backend_logs 40
      return 1
    fi
    printf '.'
    sleep 2
    waited=$((waited + 2))
  done
  [ "$waited" -gt 0 ] && echo
  ok "서비스 정상 (http://localhost:${FRONTEND_PORT}) — ${waited}초"
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
  db-backup)    check_env && db_backup ;;
  db-shell)     check_env && db_shell ;;
  -h|--help|help) sed -n '3,12p' "$0" | sed 's/^# \{0,1\}//' ;;
  *) die "알 수 없는 명령: $1 (./deploy.sh help 참고)" ;;
esac
