@echo off
echo Installing PyInstaller...
python -m pip install pyinstaller

echo.
echo Building VegaHub.exe as a SINGLE file (without Node.js/Server)...
echo This might take a minute...
echo Building VegaHub.exe as a SINGLE file (using VegaHub1.spec)...
echo This might take a minute...
python -m PyInstaller --noconfirm VegaHub1.spec

echo.
echo =======================================================
echo Build Complete!
echo You can find your executable file in:
echo   d:\SteamLibrary\vega-providers\dist\VegaHub.exe
echo.
echo Note: This version does NOT include the Node.js server.
echo Make sure your backend provider is running separately.
echo =======================================================
pause
