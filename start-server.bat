@echo off
title AetherBuilder Server
cd /d "%~dp0"
echo Starting AetherBuilder server on http://localhost:3000/ ...
powershell -NoProfile -ExecutionPolicy Bypass -File .\serve.ps1
pause
