#!/bin/bash

echo "======================================================"
echo "    STARTING SECURE DRONE SYSTEM"
echo "======================================================"

# Handle cleanup on exit
trap 'echo "Stopping all services..."; kill $(jobs -p) 2>/dev/null' SIGINT SIGTERM EXIT

# Detect virtual environment
if [ -d "backend/venv/Scripts" ]; then
    PYTHON_EXEC="backend/venv/Scripts/python"
elif [ -d "backend/venv/bin" ]; then
    PYTHON_EXEC="backend/venv/bin/python"
else
    PYTHON_EXEC="python"
fi

echo "[1/4] Starting GCS Node (Machine Learning & Decryption)..."
$PYTHON_EXEC backend/gcs_node.py &
sleep 2

echo "[2/4] Starting API Server (Flask + WebSocket)..."
$PYTHON_EXEC backend/api_server.py &
sleep 2

echo "[3/4] Starting Drone Node (Connecting to SITL)..."
echo "      (Make sure ArduPilot SITL / Mission Planner is running!)"
$PYTHON_EXEC backend/drone_node.py &
sleep 2

echo "[4/4] Starting React Frontend..."
cd frontend || exit
npm run dev &
cd ..

echo "======================================================"
echo " All services launched! Press Ctrl+C to stop all."
echo "======================================================"

# Wait for background processes so the script doesn't exit immediately
wait
