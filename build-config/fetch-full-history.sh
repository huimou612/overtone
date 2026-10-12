#!/usr/bin/env bash
# 从国内镜像补全浅克隆的完整上游历史。
#
# 为什么不用 GitHub 直连/代理：
#   - github.com:443 直连超时（本机无国际直连）
#   - 经内部代理拉 ~90MB 大包稳定失败（schannel: server closed abruptly / CONNECT tunnel 502）
#   - gitee / gitcode 镜像可达且快（1.3~1.8s 完成 ls-remote）
#
# 目的：补全后即可把带完整上游血缘的历史推送到新的空仓库
# （浅克隆推送到空仓库会因缺少祖先闭包报 `did not receive expected object`）

set -u
cd "$(dirname "$0")/.." || exit 1
export GIT_TERMINAL_PROMPT=0
export GIT_ASKPASS=echo

LOG=fetch_hist.log
: >"$LOG"

shallow() { git rev-parse --is-shallow-repository 2>/dev/null; }
count()   { git rev-list --count HEAD 2>/dev/null; }

GC=(
  -c http.postBuffer=524288000
  -c http.lowSpeedLimit=1000
  -c http.lowSpeedTime=300
)

try_mirror() {
  local name="$1" url="$2"
  echo "" >>"$LOG"
  echo "########## 尝试镜像: $name -> $url ##########" >>"$LOG"
  git remote remove "$name" >/dev/null 2>&1
  git remote add "$name" "$url" >>"$LOG" 2>&1

  echo "--- [$name] fetch --unshallow（全部分支）---" >>"$LOG"
  git "${GC[@]}" fetch --unshallow --tags "$name" >>"$LOG" 2>&1
  echo "exit=$?  提交数=$(count)  shallow=$(shallow)" >>"$LOG"
  [ "$(shallow)" = "false" ] && return 0

  echo "--- [$name] 退化为 --deepen 分块推进 ---" >>"$LOG"
  for i in $(seq 1 40); do
    git "${GC[@]}" fetch --deepen=300 "$name" >>"$LOG" 2>&1
    local rc=$?
    if [ "$(shallow)" = "false" ]; then
      echo "deepen 第 $i 轮成功，提交数=$(count)" >>"$LOG"
      return 0
    fi
    echo "deepen 第 $i 轮 exit=$rc 提交数=$(count)" >>"$LOG"
    [ $rc -ne 0 ] && sleep 3
  done
  return 1
}

for pair in \
  "mirror-gitee|https://gitee.com/mirrors/lx-music-desktop.git" \
  "mirror-gitcode|https://gitcode.com/gh_mirrors/lx/lx-music-desktop.git" \
  "mirror-ghproxy|https://ghproxy.net/https://github.com/lyswhut/lx-music-desktop.git" \
  ; do
  name="${pair%%|*}"
  url="${pair#*|}"
  if try_mirror "$name" "$url"; then
    echo "" >>"$LOG"
    echo "DONE: 历史已补全（via $name），提交数=$(count)" >>"$LOG"
    git branch -vv >>"$LOG" 2>&1
    exit 0
  fi
done

echo "" >>"$LOG"
echo "FAIL: 所有镜像均未能补全，仍为 shallow=$(shallow) 提交数=$(count)" >>"$LOG"
exit 2
