@echo off
echo ======================================================
echo     STARTING SECURE DRONE SYSTEM
echo ======================================================

:: Detect virtual environment
IF EXIST "backend\venv\Scripts\python.exe" (
    SET PYTHON_EXEC=backend\venv\Scripts\python.exe
) ELSE (
    SET PYTHON_EXEC=python
)

echo [1/4] Starting GCS Node (Machine Learning ^& Decryption)...
start "GCS Node (Port 5005)" cmd /c "%PYTHON_EXEC% backend\gcs_node.py & pause"
timeout /t 2 /nobreak >nul

echo [2/4] Starting API Server (Flask + WebSocket)...
start "API Server (Port 5000)" cmd /c "%PYTHON_EXEC% backend\api_server.py & pause"
timeout /t 2 /nobreak >nul

echo [3/4] Starting Drone Node (Connecting to SITL)...
echo       (Make sure ArduPilot SITL / Mission Planner is running)
start "Drone Node (Spoofer)" cmd /c "%PYTHON_EXEC% backend\drone_node.py --connect tcp:127.0.0.1:5762 & pause"
timeout /t 2 /nobreak >nul

echo [4/4] Starting React Frontend...
cd frontend
start "React Frontend" cmd /c "npm run dev & pause"
cd ..

echo ======================================================
echo  All services launched in separate windows!
echo  Check the new terminal windows for live logs.
echo ======================================================
pause
