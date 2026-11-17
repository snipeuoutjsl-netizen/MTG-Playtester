@echo off
REM Builds a Windows installer and a portable .exe into the "dist" folder.
cd /d "%~dp0..\app"
where node >nul 2>nul || (echo Node.js is not installed. Get the LTS version from https://nodejs.org & pause & exit /b 1)
set CSC_IDENTITY_AUTO_DISCOVERY=false
REM Clear a half-extracted code-signing tool cache left by a failed earlier build
if exist "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign" rmdir /s /q "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign"
call npm install || (echo npm install failed & pause & exit /b 1)
call npm run dist || (echo. & echo Build failed. If you saw "Cannot create symbolic link", turn on Developer Mode ^(Settings - System - For developers^) or right-click this file and Run as administrator, then try again. & pause & exit /b 1)
REM Make a ready-to-share zip: the one-click installer plus a short note
if exist "%CD%\dist\share" rmdir /s /q "%CD%\dist\share"
mkdir "%CD%\dist\share"
copy /y "%CD%\dist\MTG-Playtester-Setup-*.exe" "%CD%\dist\share\" >nul
(echo MTG Playtester: double-click the Setup file. It installs by itself in a few seconds and opens the game.
echo Windows may say "unknown publisher": click More info, then Run anyway.
echo The first launch downloads card data and images, so be online once. After that it works offline.) > "%CD%\dist\share\READ ME FIRST.txt"
powershell -NoProfile -Command "Compress-Archive -Path '%CD%\dist\share\*' -DestinationPath '%CD%\dist\MTG-Playtester-Share.zip' -Force"
echo.
echo Done. Send people: dist\MTG-Playtester-Share.zip
echo (The installer and portable app are also in the "dist" folder.)
start "" "%CD%\dist"
pause
