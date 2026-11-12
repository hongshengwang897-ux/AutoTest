@echo off
chcp 65001 >nul
echo AutoTest Local Runner — 正在停止...
for /f "tokens=5" %%P in ('netstat -ano ^| findstr "127.0.0.1:3210" ^| findstr "LISTENING"') do (
  taskkill /PID %%P /F >nul 2>nul
)
echo Local Runner 已停止。
timeout /t 2 >nul
