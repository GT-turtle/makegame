@echo off
chcp 65001 >nul
set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if not exist "%NODE_EXE%" (
  where node >nul 2>nul
  if errorlevel 1 (
    echo Node.js를 찾을 수 없습니다.
    echo README.md의 실행 안내를 확인해 주세요.
    pause
    exit /b 1
  )
  set "NODE_EXE=node"
)

start "" "http://127.0.0.1:4173"
"%NODE_EXE%" "%~dp0scripts\serve.mjs"
pause
