@echo off
chcp 65001 >nul
title Overtone + Folia Viewer
cd /d "%~dp0"

echo [1/3] 拉取最新代码 (feat/folia-viewer)...
git fetch origin feat/folia-viewer
git checkout feat/folia-viewer
git pull origin feat/folia-viewer

echo [2/3] 启动 Folia Viewer (端口 9090, 新窗口)...
cd slice\folia-viewer
if not exist node_modules (
  echo 首次运行, 正在安装 viewer 依赖...
  call npm install
)
start "Folia Viewer :9090" cmd /k npm run dev
cd ..\..

echo [3/3] 启动泛音 (dev 模式)...
echo 应用起来后: 打开 Folia 视觉窗口, 放一首有逐字歌词的歌即可。
call npm run dev
pause
