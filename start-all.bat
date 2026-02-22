@echo off
REM ============================================================
REM  InfraFlow AI — One-command startup script (Windows)
REM  Kills old processes, compiles, starts all services + frontend.
REM
REM  Usage:  start-all.bat          (full startup)
REM          stop-all.bat           (full shutdown)
REM ============================================================

echo.
echo ============================================
echo   InfraFlow AI - Full Stack Startup
echo ============================================
echo.

cd /d "%~dp0"

REM --- Step 1: Kill any existing Java processes ---
echo [1/7] Killing old Java processes...
taskkill /F /IM java.exe >nul 2>&1
timeout /t 2 /nobreak >nul

REM --- Step 2: Verify Docker infrastructure ---
echo [2/7] Checking Docker infrastructure...
docker ps --format "{{.Names}}" | findstr infraflow-redis >nul 2>&1
if errorlevel 1 (
    echo   Starting Docker containers...
    docker-compose up -d
    echo   Waiting for containers to be ready...
    timeout /t 15 /nobreak >nul
) else (
    echo   Docker containers already running.
)

REM --- Step 3: Clean compile all modules ---
echo [3/7] Compiling all modules...
call mvn clean compile -q
if errorlevel 1 (
    echo   COMPILE FAILED! Check errors above.
    pause
    exit /b 1
)
echo   Compile successful.

REM --- Step 4: Flush stale Redis sessions ---
echo [4/7] Flushing stale Redis sessions...
docker exec infraflow-redis redis-cli FLUSHDB >nul 2>&1

REM --- Step 5: Start all microservices (Eureka first, then others) ---
echo [5/7] Starting microservices...

echo   Starting Eureka Server (port 8761)...
start "Eureka" /min cmd /c "cd infraflow-eureka-server && mvn spring-boot:run"
timeout /t 15 /nobreak >nul

echo   Starting API Gateway (port 8080)...
start "Gateway" /min cmd /c "cd infraflow-api-gateway && mvn spring-boot:run"

echo   Starting Event Normalizer (port 8081)...
start "Normalizer" /min cmd /c "cd infraflow-event-normalizer && mvn spring-boot:run"

echo   Starting Healing Engine (port 8082)...
start "Healing" /min cmd /c "cd infraflow-healing-engine && mvn spring-boot:run"

echo   Starting Dashboard Backend (port 8083)...
start "Dashboard" /min cmd /c "cd infraflow-dashboard-backend && mvn spring-boot:run"

echo.
echo   Waiting for backend services to start (30s)...
timeout /t 30 /nobreak >nul

REM --- Step 6: Start Next.js frontend ---
echo [6/7] Starting Next.js frontend (port 3000)...
start "Frontend" /min cmd /c "cd infraflow-dashboard-ui && npm run dev"
timeout /t 5 /nobreak >nul

REM --- Step 7: Health check via Actuator ---
echo.
echo [7/7] Checking service health (Actuator)...
echo ============================================

powershell -NoProfile -Command "foreach ($svc in @(@{Name='Eureka';Port=8761},@{Name='Gateway';Port=8080},@{Name='Normalizer';Port=8081},@{Name='Healing';Port=8082},@{Name='Dashboard';Port=8083})) { try { $r = Invoke-RestMethod -Uri ('http://localhost:'+$svc.Port+'/actuator/health') -TimeoutSec 3 -ErrorAction Stop; Write-Host ('  '+$svc.Name+' :'+$svc.Port+' -> '+$r.status) } catch { try { $c = New-Object Net.Sockets.TcpClient('127.0.0.1',$svc.Port); $c.Close(); Write-Host ('  '+$svc.Name+' :'+$svc.Port+' -> UP (actuator not ready)') } catch { Write-Host ('  '+$svc.Name+' :'+$svc.Port+' -> DOWN (may still be starting)') } } }"

REM Check frontend separately (no actuator)
powershell -NoProfile -Command "try { $c = New-Object Net.Sockets.TcpClient('127.0.0.1', 3000); $c.Close(); Write-Host '  Frontend  :3000 -> UP' } catch { Write-Host '  Frontend  :3000 -> DOWN (may still be starting)' }"

echo.
echo ============================================
echo   InfraFlow AI is ready!
echo.
echo   Dashboard:  http://localhost:3000
echo   Eureka:     http://localhost:8761
echo   Gateway:    http://localhost:8080
echo   Kafka UI:   http://localhost:9080
echo   Neo4j:      http://localhost:7474
echo   pgAdmin:    http://localhost:5050
echo ============================================
echo.
echo   NOTE: Log in at http://localhost:3000 to
echo   see your GitHub repositories.
echo.
echo   To stop everything: run stop-all.bat
echo.
pause

