@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "QUIZ_PHP=%~dp0..\..\php\php.exe"
if not exist "%QUIZ_PHP%" set "QUIZ_PHP=C:\xampp\php\php.exe"
if not exist "%QUIZ_PHP%" (
  echo PHP not found. Open XAMPP Shell and run: php server/check.php
  echo Then run: php server/setup.php
  pause
  exit /b 1
)
"%QUIZ_PHP%" server\check.php
if errorlevel 1 goto end
"%QUIZ_PHP%" server\setup.php
:end
pause
