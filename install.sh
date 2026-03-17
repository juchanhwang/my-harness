#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

# --- 색상 ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# --- 심링크 생성 헬퍼 ---
create_link() {
  local src="$1"
  local dst="$2"

  if [ -L "$dst" ]; then
    rm "$dst"
  elif [ -e "$dst" ]; then
    local backup_path="$BACKUP_DIR/$(basename "$dst")"
    warn "$dst 가 이미 존재합니다. 백업: $backup_path"
    mv "$dst" "$backup_path"
  fi

  ln -s "$src" "$dst"
  info "링크 생성: $dst -> $src"
}

# --- 심링크 제거 헬퍼 ---
remove_link() {
  local dst="$1"
  if [ -L "$dst" ]; then
    rm "$dst"
    info "링크 제거: $dst"
  fi
}

# ============================================================
# UNINSTALL
# ============================================================
if [ "${1:-}" = "--uninstall" ]; then
  echo ""
  info "my-harness 제거를 시작합니다..."
  echo ""

  # 디렉토리 및 단일 파일 심링크 제거
  for item in agents commands hooks CLAUDE.md settings.json keybindings.json; do
    remove_link "$HOME/.claude/$item"
  done

  # skills 심링크 제거
  if [ -d "$REPO_DIR/skills" ]; then
    for skill_dir in "$REPO_DIR/skills"/*/; do
      skill_name="$(basename "$skill_dir")"
      remove_link "$HOME/.claude/skills/$skill_name"
    done
  fi

  echo ""
  info "제거 완료."
  exit 0
fi

# ============================================================
# INSTALL
# ============================================================
echo ""
info "my-harness 설치를 시작합니다..."
echo ""

# 백업 디렉토리 생성
BACKUP_DIR="$HOME/.claude/backups/harness-$(date +%Y%m%d%H%M%S)"
mkdir -p "$BACKUP_DIR"
info "백업 디렉토리: $BACKUP_DIR"

# 대상 디렉토리 생성
mkdir -p "$HOME/.claude"
mkdir -p "$HOME/.claude/skills"

# --- 디렉토리 심링크 ---
for item in agents commands hooks; do
  create_link "$REPO_DIR/$item" "$HOME/.claude/$item"
done

# --- 단일 파일 심링크 ---
for item in CLAUDE.md settings.json keybindings.json; do
  create_link "$REPO_DIR/$item" "$HOME/.claude/$item"
done

# --- Skills 심링크 ---
for skill_dir in "$REPO_DIR/skills"/*/; do
  skill_name="$(basename "$skill_dir")"
  create_link "$REPO_DIR/skills/$skill_name" "$HOME/.claude/skills/$skill_name"
done

echo ""
info "설치 완료."
info "원격 훅 사용 시 환경 변수를 설정하세요:"
echo "  export CLAUDE_REMOTE_API_KEY=\"your-actual-api-key\""
echo ""
