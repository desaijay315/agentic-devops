@echo off
REM ============================================================
REM  InfraFlow AI — One-command shutdown script (Windows)
REM  Stops all Java services, optionally stops Docker infra.
REM ============================================================

echo.
echo ============================================
echo   InfraFlow AI - Full Stack Shutdown
echo ============================================
echo.

cd /d "%~dp0"

REM --- Step 1: Kill all Java processes (microservices) ---
echo [1/4] Stopping Java microservices...
taskkill /F /IM java.exe >nul 2>&1
if errorlevel 1 (
    echo   No Java processes were running.
) else (
    echo   All Java services stopped.
)

REM --- Step 2: Kill Next.js dev server (node on port 3000) ---
echo [2/4] Stopping Next.js frontend (port 3000)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
echo   Frontend stopped.

REM --- Step 3: Stop Docker containers ---
echo [3/4] Stopping Docker containers...
docker-compose down >nul 2>&1
if errorlevel 1 (
    echo   Docker containers were not running or docker-compose not available.
) else (
    echo   Docker containers stopped.
)

REM --- Step 4: Summary ---
echo.
echo [4/4] Verifying ports are free...
set "ALL_FREE=1"
for %%p in (8761 8080 8081 8082 8083 3000 9092 5432 6379 7474) do (
    powershell -NoProfile -Command "try { $c = New-Object Net.Sockets.TcpClient('127.0.0.1', %%p); $c.Close(); Write-Host '  Port %%p: STILL IN USE (may need a moment)' } catch { Write-Host '  Port %%p: FREE' }"
)

echo.
echo ============================================
echo   InfraFlow AI shutdown complete.
echo ============================================
echo.
pause

