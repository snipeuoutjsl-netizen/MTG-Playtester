@echo off
REM Opens MTG Playtester in its own window (no browser). Installs Electron on first run.
cd /d "%~dp0..\app"
if not exist "node_modules\electron\dist\electron.exe" (
  where node >nul 2>nul || (echo Node.js is not installed. Get the LTS version from https://nodejs.org & pause & exit /b 1)
  echo First run: installing Electron, this takes a minute...
  call npm install || (echo npm install failed & pause & exit /b 1)
)
start "" "node_modules\electron\dist\electron.exe" "%CD%"
exit /b 0
