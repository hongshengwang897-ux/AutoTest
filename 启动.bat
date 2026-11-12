@echo off
setlocal
cd /d "%~dp0"

echo.
echo ==============================================
echo           AutoTest 自动化测试管理平台
echo    UI 自动化 / API 测试 / 性能测试 / 定时调度
echo ==============================================
echo.

echo [1/4] 停止旧进程（端口 3001 / 5173）...
powershell -NoProfile -Command "3001,5173 | ForEach-Object { $p = (Get-NetTCPConnection -LocalPort $_ -State Listen -ErrorAction SilentlyContinue).OwningProcess; if ($p) { Stop-Process -Id $p -Force -ErrorAction SilentlyContinue } }"
timeout /t 2 /nobreak >nul

where npm >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 npm，请先安装 Node.js 22+ 并确认 npm 在系统 PATH 中。
  pause
  exit /b 1
)

echo [2/4] 启动后端 API（端口 3001）...
start "AutoTest-Backend" /D "%~dp0api" cmd /k "npm run dev"
echo       等待后端初始化...
timeout /t 5 /nobreak >nul

echo [3/4] 启动前端（端口 5173）...
start "AutoTest-Frontend" /D "%~dp0" cmd /k "npm run dev"
echo       等待前端编译...
timeout /t 6 /nobreak >nul

echo [4/4] 打开浏览器...
start "" "http://localhost:5173"

echo.
echo ----------------------------------------------
echo  启动完成
echo   前端 UI  : http://localhost:5173
echo   后端 API : http://localhost:3001/api/health
echo   API 文档 : http://localhost:3001/api/docs
echo ----------------------------------------------
echo  无需登录，直接使用。
echo  两个日志窗口: AutoTest-Backend / AutoTest-Frontend
echo  关闭对应窗口即可停止服务。
echo.
pause
endlocal
