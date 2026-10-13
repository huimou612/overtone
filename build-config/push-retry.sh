#!/usr/bin/env bash
# 推送封装：一次绕开本机两个坑。
#
# 症状：2026-10-13 一次 git push 在后台卡满 37 分钟，8 次重试全部失败，
# 而且日志是空的（看不到任何进展）。两个独立的坑叠在一起：
#
# ── 坑 1：直连 github.com 不通 ────────────────────────────────
#   curl https://github.com                        → 000，20s 超时
#   curl -x http://127.0.0.1:7897 https://github.com → 200，1.7s
#   环境里**没有** HTTP_PROXY / HTTPS_PROXY 变量，git 默认直连就撞墙。
#   本机代理是 clash-verge（核心进程 verge-mihomo），混合端口 7897。
#   LX 上游脚本里写的 127.0.0.1:2081 是作者自己的配置，本机没有这个端口。
#   报错形态有两种，都指向「连不上」而非「慢」：
#     Failed to connect to github.com:443 after 21073 ms: Could not connect to server
#     Recv failure: Connection was reset
#
# ── 坑 2：凭据助手是 GUI 选择器，会把 git 挂死 ──────────────────
#   PortableGit 的 **system 级** gitconfig 写了 credential.helper = helper-selector
#   （见 PortableGit/etc/gitconfig）。它是 GUI 弹窗式选择器，没人点就一直等。
#   致命之处在于 credential.helper 是**累积列表**：system 级排最前，
#   永远轮不到 global 级那个真正能用的 git-credential-manager。
#   GIT_TERMINAL_PROMPT=0 拦不住它 —— 那个变量管的是终端提示，不是 GUI 弹窗。
#   GIT_TRACE 里能看到它停在 `git credential-helper-selector get`。
#   绕法：`-c credential.helper=`（空值清空整个 helper 列表）+ 凭据放进 URL。
#
# 可用环境变量覆盖：
#   PUSH_PROXY      指定代理，跳过探测
#   PUSH_ATTEMPTS   重试次数（默认 4）
#   PUSH_SLEEP      退避秒数（默认 5）
set -u

cd "$(dirname "$0")/.." || exit 1
REPO_ROOT=$(pwd)
TOKEN_FILE="$REPO_ROOT/.git/ghtoken"
export GIT_TERMINAL_PROMPT=0

# 凭据只在这一个文件里短暂存在，无论怎么退出都要清掉。
cleanup() { rm -f "$TOKEN_FILE"; }
trap cleanup EXIT INT TERM

# 慢速判定：20 秒内低于 1 KB/s 就放弃，让坏连接尽快失败、尽快重试，
# 而不是干等 git 默认的 300 秒超时（实测一次就能白等 5 分钟）。
git config http.version HTTP/1.1
git config http.lowSpeedLimit 1000
git config http.lowSpeedTime 20

# ── 代理探测 ────────────────────────────────────────────────
probe() {
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -x "$1" https://github.com 2>/dev/null)
  [ "$code" = "200" ]
}

PROXY="${PUSH_PROXY:-}"
if [ -n "$PROXY" ]; then
  echo "使用指定代理 $PROXY"
else
  for candidate in http://127.0.0.1:7897 http://127.0.0.1:7890 http://127.0.0.1:10809 http://127.0.0.1:2081; do
    if probe "$candidate"; then
      PROXY="$candidate"
      echo "探测到可用代理 $PROXY"
      break
    fi
  done
fi
[ -n "$PROXY" ] && export https_proxy="$PROXY" http_proxy="$PROXY"

# ── 取凭据 ──────────────────────────────────────────────────
PYTHON_BIN="${OVERTONE_PYTHON:-C:/Users/HP/.workbuddy/binaries/python/versions/3.13.12/python.exe}"
if [ -x "$PYTHON_BIN" ] || command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  PYTHONIOENCODING=utf-8 "$PYTHON_BIN" build-config/read-gh-token.py "$TOKEN_FILE" || true
fi

if [ -s "$TOKEN_FILE" ]; then
  GH_USER=$(sed -n '1p' "$TOKEN_FILE")
  GH_TOKEN=$(sed -n '2p' "$TOKEN_FILE")
else
  echo "⚠️ 未取到凭据，将退回普通推送（本机大概率会卡在 helper-selector）"
  GH_USER=""
  GH_TOKEN=""
fi

# ── 解析 origin，拼出带凭据的推送 URL ────────────────────────
ORIGIN_URL=$(git config --get remote.origin.url)
SLUG=$(printf '%s' "$ORIGIN_URL" | sed -e 's#^https://github.com/##' -e 's#\.git$##')
if [ -z "$SLUG" ] || [ "$SLUG" = "$ORIGIN_URL" ]; then
  echo "无法从 origin 解析出 owner/repo：$ORIGIN_URL"
  exit 1
fi

if [ -n "$GH_TOKEN" ]; then
  PUSH_URL="https://${GH_USER}:${GH_TOKEN}@github.com/${SLUG}.git"
else
  PUSH_URL="https://github.com/${SLUG}.git"
fi

# ── 推送（重试） ────────────────────────────────────────────
attempt=1
max="${PUSH_ATTEMPTS:-4}"
sleep_s="${PUSH_SLEEP:-5}"
ok=0
while [ "$attempt" -le "$max" ]; do
  echo "=== push attempt $attempt/$max  $(date '+%H:%M:%S') ==="
  # credential.helper= 是空值：清空 system/global/local 累积出来的整个 helper 列表，
  # 这样 git 不会去调 helper-selector，直接用 URL 里的凭据。
  if git -c credential.helper= push "$PUSH_URL" master:master 2>&1 | sed -e "s/${GH_TOKEN:-__none__}/***/g"; then
    ok=1
    break
  fi
  echo "=== attempt $attempt failed ==="
  attempt=$((attempt + 1))
  [ "$attempt" -le "$max" ] && sleep "$sleep_s"
done

if [ "$ok" -ne 1 ]; then
  echo "PUSH_FAILED_ALL_ATTEMPTS"
  exit 1
fi

# 显式 URL 推送不会更新 remote-tracking 引用（git 不知道这个 URL 对应 origin），
# 手动 fetch 一次，让 `git status` 不再谎报 ahead。
if [ -n "$GH_TOKEN" ]; then
  git -c credential.helper= fetch "$PUSH_URL" master:refs/remotes/origin/master >/dev/null 2>&1 || true
fi

echo "PUSH_OK"
