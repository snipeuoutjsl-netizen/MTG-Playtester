@echo off
REM Uses the desktop window if Electron is installed, otherwise falls back to your browser.
cd /d "%~dp0"
if exist "node_modules\electron\dist\electron.exe" (
  start "" "node_modules\electron\dist\electron.exe" "%~dp0."
) else (
  start "" "%~dp0index.html"
)
