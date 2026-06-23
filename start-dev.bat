@echo off
chcp 65001
set PATH=C:\Program Files\nodejs;%PATH%
echo Starting development server...
echo Please wait...
npm run dev
echo.
echo Server stopped.
pause
