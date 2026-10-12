#!/usr/bin/env bash
# 推送重试封装：代理链路间歇性不稳（300s 超时 / TLS 中断），单次失败不代表仓库有问题。
# 每次失败后等待若干秒再试，最多 5 次；只要有一次 exit=0 就结束。
set -u

cd "$(dirname "$0")/.." || exit 1
export GIT_TERMINAL_PROMPT=0
export GIT_HTTP_LOW_SPEED_LIMIT=1000
export GIT_HTTP_LOW_SPEED_TIME=60

attempt=1
max=5
while [ "$attempt" -le "$max" ]; do
  echo "=== push attempt $attempt/$max  $(date '+%H:%M:%S') ==="
  git push origin master
  code=$?
  echo "=== exit=$code ==="
  if [ "$code" -eq 0 ]; then
    echo "PUSH_OK"
    exit 0
  fi
  attempt=$((attempt + 1))
  [ "$attempt" -le "$max" ] && sleep 15
done

echo "PUSH_FAILED_ALL_ATTEMPTS"
exit 1
