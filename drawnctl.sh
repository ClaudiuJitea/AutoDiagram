#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="autodiagram"
IMAGE_NAME="${IMAGE_NAME:-autodiagram}"
CONTAINER_NAME="${CONTAINER_NAME:-autodiagram-app}"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/.env.local}"
PORT="${PORT:-3000}"
PLATFORM="${PLATFORM:-linux/amd64}"

COLOR_RESET="\033[0m"
COLOR_RED="\033[0;31m"
COLOR_GREEN="\033[0;32m"
COLOR_YELLOW="\033[1;33m"
COLOR_BLUE="\033[0;34m"
COLOR_CYAN="\033[0;36m"
COLOR_BOLD="\033[1m"

banner() {
  printf "\n"
  printf "%b" "${COLOR_CYAN}"
  cat <<'EOF'
      _         _        ____  _                                       
     / \  _   _| |_ ___ |  _ \(_) __ _  __ _ _ __ __ _ _ __ ___        
    / _ \| | | | __/ _ \| | | | |/ _` |/ _` | '__/ _` | '_ ` _ \       
   / ___ \ |_| | || (_) | |_| | | (_| | (_| | | | (_| | | | | | |      
  /_/   \_\__,_|\__\___/|____/|_|\__,_|\__, |_|  \__,_|_| |_| |_|      
                                       |___/                            
EOF
  printf "%b" "${COLOR_RESET}"
  printf "%b%s%b\n" "${COLOR_BOLD}" "Container control for the AutoDiagram app" "${COLOR_RESET}"
}

info() {
  printf "%b[INFO]%b %s\n" "${COLOR_BLUE}" "${COLOR_RESET}" "$1"
}

success() {
  printf "%b[OK]%b   %s\n" "${COLOR_GREEN}" "${COLOR_RESET}" "$1"
}

warn() {
  printf "%b[WARN]%b %s\n" "${COLOR_YELLOW}" "${COLOR_RESET}" "$1"
}

error() {
  printf "%b[ERR]%b  %s\n" "${COLOR_RED}" "${COLOR_RESET}" "$1" >&2
}

usage() {
  banner
  cat <<EOF

Usage:
  ./drawnctl.sh init
  ./drawnctl.sh deploy
  ./drawnctl.sh start
  ./drawnctl.sh stop
  ./drawnctl.sh restart
  ./drawnctl.sh delete
  ./drawnctl.sh status
  ./drawnctl.sh logs
  ./drawnctl.sh help

Environment overrides:
  IMAGE_NAME      Docker image name            (default: ${IMAGE_NAME})
  CONTAINER_NAME  Docker container name        (default: ${CONTAINER_NAME})
  ENV_FILE        Env file to load for deploy  (default: ${ENV_FILE})
  PORT            Host port mapped to 3000     (default: ${PORT})
  PLATFORM        Build platform               (default: ${PLATFORM})

Notes:
  - 'init' creates or updates the env file through an interactive prompt.
  - 'deploy' rebuilds the image, replaces the container, and starts the app.
  - 'delete' removes both the container and the image.
EOF
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    error "Docker is required but not installed or not on PATH."
    exit 1
  fi
}

load_env_file() {
  info "Loading environment from $ENV_FILE"
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
}

read_secret() {
  local input=""
  local char=""

  if [[ ! -t 0 ]]; then
    IFS= read -r input || true
    REPLY="$input"
    return
  fi

  # Show masked progress so pasted secrets have visible feedback without echoing the value.
  while IFS= read -r -s -n1 char; do
    if [[ -z "$char" || "$char" == $'\n' || "$char" == $'\r' ]]; then
      break
    fi

    if [[ "$char" == $'\177' || "$char" == $'\b' ]]; then
      if [[ -n "$input" ]]; then
        input="${input%?}"
        printf '\b \b'
      fi
      continue
    fi

    input+="$char"
    printf '*'
  done
  printf '\n'

  if [[ -n "$input" ]]; then
    printf "%b[OK]%b   captured %s hidden character(s)\n" "${COLOR_GREEN}" "${COLOR_RESET}" "${#input}"
  else
    warn "No hidden value entered."
  fi

  REPLY="$input"
}

prompt_value() {
  local var_name="$1"
  local prompt_label="$2"
  local default_value="${3:-}"
  local secret="${4:-false}"
  local current_value="${!var_name:-$default_value}"
  local input=""

  while true; do
    if [[ "$secret" == "true" ]]; then
      if [[ -n "$current_value" ]]; then
        printf "%b%s%b [%s hidden]: " "${COLOR_BOLD}" "$prompt_label" "${COLOR_RESET}" "press enter to keep"
      else
        printf "%b%s%b: " "${COLOR_BOLD}" "$prompt_label" "${COLOR_RESET}"
      fi
      read_secret
      input="$REPLY"
    else
      if [[ -n "$current_value" ]]; then
        printf "%b%s%b [%s]: " "${COLOR_BOLD}" "$prompt_label" "${COLOR_RESET}" "$current_value"
      else
        printf "%b%s%b: " "${COLOR_BOLD}" "$prompt_label" "${COLOR_RESET}"
      fi
      read -r input
    fi

    if [[ -n "$input" ]]; then
      printf -v "$var_name" '%s' "$input"
      break
    fi

    if [[ -n "$current_value" ]]; then
      printf -v "$var_name" '%s' "$current_value"
      break
    fi

    warn "A value is required for $var_name."
  done
}

write_env_file() {
  local env_dir
  env_dir="$(dirname "$ENV_FILE")"
  mkdir -p "$env_dir"

  cat >"$ENV_FILE" <<EOF
# LLM configuration
SERVER_LLM_API_KEY=${SERVER_LLM_API_KEY}
SERVER_LLM_BASE_URL=${SERVER_LLM_BASE_URL}
SERVER_LLM_TYPE=${SERVER_LLM_TYPE}
SERVER_LLM_MODEL=${SERVER_LLM_MODEL}
EOF

  success "Wrote environment file to $ENV_FILE"
}

init_env() {
  require_docker
  banner

  if [[ -f "$ENV_FILE" ]]; then
    load_env_file
    info "Using existing values from $ENV_FILE as defaults"
  else
    info "No env file found. Creating $ENV_FILE"
  fi

  printf "\n"
  info "Enter the deployment settings. Press enter to keep a shown default."
  info "Default provider is OpenRouter."
  prompt_value "SERVER_LLM_API_KEY" "OpenRouter API key" "" "true"
  prompt_value "SERVER_LLM_BASE_URL" "OpenRouter base URL" "https://openrouter.ai/api/v1"
  SERVER_LLM_TYPE="openrouter"
  prompt_value "SERVER_LLM_MODEL" "OpenRouter model name (for example google/gemini-3.1-flash-lite-preview)" ""

  require_vars
  write_env_file
}

require_vars() {
  local missing=()
  local required_vars=(
    SERVER_LLM_API_KEY
    SERVER_LLM_BASE_URL
    SERVER_LLM_TYPE
    SERVER_LLM_MODEL
  )

  for var_name in "${required_vars[@]}"; do
    if [[ -z "${!var_name:-}" ]]; then
      missing+=("$var_name")
    fi
  done

  if (( ${#missing[@]} > 0 )); then
    error "Missing required values in $ENV_FILE:"
    printf "  - %s\n" "${missing[@]}" >&2
    exit 1
  fi
}

container_exists() {
  docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1
}

container_running() {
  [[ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER_NAME" 2>/dev/null || true)" == "true" ]]
}

remove_container_if_present() {
  if container_exists; then
    info "Removing existing container: $CONTAINER_NAME"
    docker rm -f "$CONTAINER_NAME" >/dev/null
    success "Container removed"
  fi
}

delete_image_if_present() {
  if docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
    info "Removing image: $IMAGE_NAME"
    docker rmi -f "$IMAGE_NAME" >/dev/null
    success "Image removed"
  else
    warn "Image $IMAGE_NAME does not exist."
  fi
}

deploy() {
  require_docker
  if [[ ! -f "$ENV_FILE" ]]; then
    init_env
  fi
  load_env_file
  require_vars

  banner
  info "Building image $IMAGE_NAME for platform $PLATFORM"
  docker build \
    --platform "$PLATFORM" \
    -t "$IMAGE_NAME" \
    "$SCRIPT_DIR"
  success "Image build completed"

  remove_container_if_present

  info "Starting container $CONTAINER_NAME on port $PORT"
  docker run -d \
    --name "$CONTAINER_NAME" \
    --restart unless-stopped \
    -p "127.0.0.1:$PORT:3000" \
    -e "SERVER_LLM_API_KEY=$SERVER_LLM_API_KEY" \
    -e "SERVER_LLM_BASE_URL=$SERVER_LLM_BASE_URL" \
    -e "SERVER_LLM_TYPE=$SERVER_LLM_TYPE" \
    -e "SERVER_LLM_MODEL=$SERVER_LLM_MODEL" \
    "$IMAGE_NAME" >/dev/null
  success "AutoDiagram is deployed"
  printf "  URL: %bhttp://localhost:%s%b\n" "${COLOR_BOLD}" "$PORT" "${COLOR_RESET}"
}

start() {
  require_docker
  banner

  if ! container_exists; then
    error "Container $CONTAINER_NAME does not exist. Run './drawnctl.sh deploy' first."
    exit 1
  fi

  if container_running; then
    warn "Container $CONTAINER_NAME is already running."
    exit 0
  fi

  info "Starting container $CONTAINER_NAME"
  docker start "$CONTAINER_NAME" >/dev/null
  success "Container started"
}

stop() {
  require_docker
  banner

  if ! container_exists; then
    warn "Container $CONTAINER_NAME does not exist."
    exit 0
  fi

  if ! container_running; then
    warn "Container $CONTAINER_NAME is already stopped."
    exit 0
  fi

  info "Stopping container $CONTAINER_NAME"
  docker stop "$CONTAINER_NAME" >/dev/null
  success "Container stopped"
}

restart() {
  require_docker
  banner

  if ! container_exists; then
    error "Container $CONTAINER_NAME does not exist. Run './drawnctl.sh deploy' first."
    exit 1
  fi

  info "Restarting container $CONTAINER_NAME"
  docker restart "$CONTAINER_NAME" >/dev/null
  success "Container restarted"
}

delete_all() {
  require_docker
  banner

  remove_container_if_present
  delete_image_if_present
  success "Cleanup finished"
}

status() {
  require_docker
  banner

  if ! container_exists; then
    warn "Container $CONTAINER_NAME does not exist."
  else
    info "Container status"
    docker ps -a --filter "name=^/${CONTAINER_NAME}$" \
      --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
  fi

  if docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
    info "Image status"
    docker images "$IMAGE_NAME" --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.Size}}"
  else
    warn "Image $IMAGE_NAME does not exist."
  fi
}

logs() {
  require_docker

  if ! container_exists; then
    error "Container $CONTAINER_NAME does not exist."
    exit 1
  fi

  banner
  info "Streaming logs for $CONTAINER_NAME"
  docker logs -f "$CONTAINER_NAME"
}

main() {
  local command="${1:-help}"

  case "$command" in
    init) init_env ;;
    deploy) deploy ;;
    start) start ;;
    stop) stop ;;
    restart) restart ;;
    delete) delete_all ;;
    status) status ;;
    logs) logs ;;
    help|-h|--help) usage ;;
    *)
      error "Unknown command: $command"
      usage
      exit 1
      ;;
  esac
}

main "$@"
