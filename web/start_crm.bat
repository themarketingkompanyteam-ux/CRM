@echo off
echo ====================================================
echo   Starting Workspace CRM
echo ====================================================

cd /d "%~dp0"

echo Starting PostgreSQL + Redis (Docker)...
docker compose up -d

echo Starting CSV import worker...
start "CRM Import Worker" cmd /k npm run worker

echo Starting web server...
start "CRM Web Server" cmd /k npm run dev

timeout /t 5 /nobreak >nul

echo Opening http://localhost:3000 ...
start http://localhost:3000

echo ====================================================
echo   CRM is starting. Two terminal windows opened:
echo   - CRM Import Worker
echo   - CRM Web Server
echo   Leave both open while you use the CRM.
echo   Close them (or this window) to stop everything.
echo ====================================================
