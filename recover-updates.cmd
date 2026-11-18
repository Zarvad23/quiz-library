@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "QUIZ_RECOVERY_PHP=%~dp0..\..\php\php.exe"
if not exist "%QUIZ_RECOVERY_PHP%" set "QUIZ_RECOVERY_PHP=C:\xampp\php\php.exe"
if not exist "%QUIZ_RECOVERY_PHP%" (
  echo PHP not found. Open XAMPP Shell and run: php server/recover-update.php
  pause
  exit /b 1
)
"%QUIZ_RECOVERY_PHP%" server\recover-update.php
pause
