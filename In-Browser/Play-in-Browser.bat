@echo off
REM Uses the desktop window if Electron is installed, otherwise falls back to your browser.
cd /d "%~dp0..\app"
if exist "node_modules\electron\dist\electron.exe" (
  start "" "node_modules\electron\dist\electron.exe" "%CD%"
) else (
  start "" "%CD%\index.html"
)
