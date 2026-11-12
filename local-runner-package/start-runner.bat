@echo off
chcp 65001 >nul
title AutoTest Local Runner
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-runner.ps1"
if errorlevel 1 pause
