#!/usr/bin/env bash
# 推送重试封装。
#
# 本机的出口是沙箱注入的 HTTP 代理（HTTP_PROXY/HTTPS_PROXY 指向 127.0.0.1），
# 它相当不稳：实测会出现
#   - `schannel: server closed abruptly (missing close_notify)`
#   - `Recv failure: Connection was aborted`
#   - `CONNECT tunnel failed, response 502`
# 全部是传输层问题，与仓库状态无关，重试即可通过（历史经验：连续 5 次失败后
# 换一轮就成功）。所以这里只做「多次重试 + 退避」，不做任何破坏性操作。
#
# 可用环境变量覆盖：PUSH_ATTEMPTS（默认 8）、PUSH_SLEEP（默认 12 秒）
set -u

cd "$(dirname "$0")/.." || exit 1
export GIT_TERMINAL_PROMPT=0

# 保证 http.version=HTTP/1.1（HTTP/2 经代理更容易被中间设备掐断）。
# sslBackend 由调用方按需设置，这里不动，避免把可用配置改坏。
git config http.version HTTP/1.1

attempt=1
max="${PUSH_ATTEMPTS:-8}"
sleep_s="${PUSH_SLEEP:-12}"
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
  [ "$attempt" -le "$max" ] && sleep "$sleep_s"
done

echo "PUSH_FAILED_ALL_ATTEMPTS"
exit 1
