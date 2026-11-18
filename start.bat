@echo off
chcp 65001 >nul
title DVOE V PUSTOTE - server
cd /d "%~dp0"
where node >nul 2>nul || (echo Нужен Node.js: https://nodejs.org & pause & exit /b)
if not exist node_modules\ws (echo Ставлю зависимости... & call npm install --no-audit --no-fund)
if not exist bin\cloudflared.exe (
  echo Качаю cloudflared для туннеля...
  if not exist bin mkdir bin
  curl -L -o bin\cloudflared.exe https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
)
echo.
echo  Не закрывай это окно, пока играете!
echo.
node server.js
pause
