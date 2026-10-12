@echo off
setlocal
cd /d "%~dp0"
title Quranic Arabic - local server (close this window to stop)
set PORT=8080
set URL=http://localhost:%PORT%/

REM If a server is already running, just open the browser and quit.
curl -s -o NUL --max-time 2 %URL% >NUL 2>&1
if %errorlevel%==0 (
  echo A server is already running at %URL% - opening it in your browser.
  start "" %URL%
  timeout /t 2 >NUL
  exit /b 0
)

REM Find Python: prefer the py launcher, fall back to plain python.
set PY=
where py >NUL 2>NUL && set PY=py -3
if not defined PY (
  where python >NUL 2>NUL && set PY=python
)
if not defined PY (
  echo.
  echo Python was not found on this PC.
  echo Install it from https://www.python.org/downloads/ and run this file again.
  echo.
  pause
  exit /b 1
)

echo Starting the local server at %URL% ...
echo Close this window to stop the server.
start "" cmd /c "timeout /t 2 /nobreak >NUL & start %URL%"
%PY% tools/serve.py
