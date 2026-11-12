@echo off
chcp 65001 >nul
cd /d "%~dp0"
title AutoTest Local Runner Installer

echo ═══════════════════════════════════════════
echo   AutoTest Local Runner — 安装并启动
echo ═══════════════════════════════════════════
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Node.js，尝试通过 winget 安装...
  where winget >nul 2>nul
  if errorlevel 1 (
    echo 请先手动安装 Node.js LTS: https://nodejs.org
    pause
    exit /b 1
  )
  echo 正在安装 Node.js LTS...
  winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
  if errorlevel 1 (
    echo Node.js 安装失败，请手动安装后重试。
    pause
    exit /b 1
  )
  set "PATH=%PATH%;C:\Program Files\nodejs"
  where node >nul 2>nul
  if errorlevel 1 (
    echo Node.js 安装后未找到，请重启命令行后重试。
    pause
    exit /b 1
  )
)

echo 正在安装依赖...
set PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
call npm install --omit=dev
if errorlevel 1 (
  echo 依赖安装失败，请检查网络后重试。
  pause
  exit /b 1
)

echo 依赖安装完成，正在启动 Local Runner...
call "%~dp0start-runner.bat"
