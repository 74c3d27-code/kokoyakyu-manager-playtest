@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22が必要です。
  pause
  exit /b 1
)
call npm install --no-audit --no-fund
if errorlevel 1 goto error
call npm test
if errorlevel 1 goto error
echo.
echo 全テストが完了しました。
pause
exit /b 0
:error
echo.
echo 処理に失敗しました。上のエラーを記録してください。
pause
exit /b 1
