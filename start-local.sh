#!/bin/sh
set -eu
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 22をインストールしてください。" >&2
  exit 1
fi
npm install --no-audit --no-fund
npm test
echo "ブラウザで http://localhost:4173 を開いてください。"
echo "終了するときは Ctrl+C を押します。"
npm run dev
