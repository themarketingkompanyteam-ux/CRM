@echo off
echo ====================================================
echo   Setting up Portable Claude CRM on this Machine
echo ====================================================

set "CRM_PATH=%~dp0"
set "CRM_PATH=%CRM_PATH:\=/%"
set "CRM_PATH=%CRM_PATH:~0,-1%"

echo Installing Python dependencies...
pip install -r requirements.txt

set "CLAUDE_CONFIG=%APPDATA%\Claude\claude_desktop_config.json"

if not exist "%APPDATA%\Claude" (
    mkdir "%APPDATA%\Claude"
)

(
  echo {
  echo   "mcpServers": {
  echo     "company-crm": {
  echo       "command": "python",
  echo       "args": ["%CRM_PATH%/mcp_server.py"]
  echo     }
  echo   }
  echo }
) > "%CLAUDE_CONFIG%"

echo.
echo ====================================================
echo   ✅ CRM Connected to Claude Desktop!
echo   Folder Location: %CRM_PATH%
echo   Please RESTART Claude Desktop to start using it.
echo ====================================================
pause

@echo off
echo ====================================================
echo   Setting up Portable Claude CRM on this Machine
echo ====================================================

:: Navigate to script location
cd /d "%~dp0"

set "CRM_PATH=%~dp0"
set "CRM_PATH=%CRM_PATH:\=/%"
set "CRM_PATH=%CRM_PATH:~0,-1%"

echo Installing Python dependencies...
pip install -r requirements.txt

set "CLAUDE_CONFIG=%APPDATA%\Claude\claude_desktop_config.json"

if not exist "%APPDATA%\Claude" (
    mkdir "%APPDATA%\Claude"
)

(
  echo {
  echo   "mcpServers": {
  echo     "company-crm": {
  echo       "command": "python",
  echo       "args": ["%CRM_PATH%/mcp_server.py"]
  echo     }
  echo   }
  echo }
) > "%CLAUDE_CONFIG%"

echo.
echo ====================================================
echo   CRM Connected to Claude Desktop!
echo   Folder Location: %CRM_PATH%
echo   Please RESTART Claude Desktop to start using it.
echo ====================================================
pause