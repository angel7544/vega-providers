@echo off
echo Installing PyInstaller...
python -m pip install pyinstaller

echo.
echo Building VegaHub.exe as a SINGLE file...
echo This might take a minute...
python -m PyInstaller --noconfirm --onefile --windowed --icon="icon.ico" --add-data "icon.ico;." --add-data "icon.png;." --name "VegaHub" "VegaHubLauncher.py"

echo.
echo =======================================================
echo Build Complete!
echo You can find your single executable file in:
echo   d:\SteamLibrary\vega-providers\dist\VegaHub.exe
echo.
echo Note: Because this EXE launches the Node.js server, you should 
echo move this VegaHub.exe out of the 'dist' folder and put it in your 
echo main 'vega-providers' folder (where package.json and node_modules are)
echo so it can successfully find and run your server!
echo =======================================================
pause
