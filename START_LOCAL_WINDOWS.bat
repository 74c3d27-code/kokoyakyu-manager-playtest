@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo 高校野球監督ゲーム v0.2.0 を準備します。
where node >nul 2>nul
if errorlevel 1 (
  echo Node.jsが見つかりません。
  echo Node.js 22をインストールしてから、もう一度実行してください。
  pause
  exit /b 1
)
echo Node.js:
node --version
echo.
echo 必要な開発ファイルを確認します。
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo.
  echo npm installに失敗しました。インターネット接続を確認してください。
  pause
  exit /b 1
)
echo.
echo 自動テストを実行します。
call npm test
if errorlevel 1 (
  echo.
  echo テストに失敗しました。表示内容を記録してください。
  pause
  exit /b 1
)
echo.
echo ブラウザで http://localhost:4173 を開いてください。
echo 終了するときは、この画面で Ctrl+C を押します。
call npm run dev
pause
