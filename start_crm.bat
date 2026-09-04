@echo off
echo Starting Portable AI CRM Dashboard...
cd /d "%~dp0"
pip install fastapi uvicorn openai edge-tts pydantic
start http://localhost:8000
uvicorn agent:app --port 8000 --reload
pause