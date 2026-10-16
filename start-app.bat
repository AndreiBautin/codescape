@echo off
setlocal
cd /d "%~dp0"
set PORT=5391

where node >nul 2>nul || (echo Node.js is required: https://nodejs.org & pause & exit /b 1)
where pnpm >nul 2>nul || (echo Enabling pnpm via corepack... & call corepack enable pnpm)

if not exist node_modules (
  echo Installing dependencies...
  call pnpm install || (echo Install failed. & pause & exit /b 1)
)

netstat -ano | findstr /r /c:":%PORT% .*LISTENING" >nul && (
  echo Port %PORT% is already in use - opening the running instance.
  start "" http://localhost:%PORT%/
  exit /b 0
)

echo Starting Codescape on http://localhost:%PORT%/ ...
start "Codescape dev server" cmd /c "pnpm dev"

:wait
powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing http://localhost:%PORT%/ -TimeoutSec 2) | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
if errorlevel 1 (timeout /t 1 >nul & goto wait)
start "" http://localhost:%PORT%/
