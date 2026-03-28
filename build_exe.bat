@echo off
echo Installing PyInstaller...
python -m pip install pyinstaller

echo.
echo Bundling Node.js server...
call npx esbuild dev-server.js --bundle --platform=node --outfile=server.bundle.js

echo.
echo Copying node.exe to current directory...
copy "C:\Program Files\nodejs\node.exe" .\node.exe

echo.
echo Building VegaHub.exe as a SINGLE file...
echo This might take a minute...
python -m PyInstaller --noconfirm --onefile --windowed --icon="icon.ico" --add-data "icon.ico;." --add-data "icon.png;." --add-data "node.exe;." --add-data "package.json;." --add-data "server.bundle.js;." --add-data "build-bundled.js;." --add-data "manifest.json;." --add-data "artplayer.js;." --add-data "dist;dist" --add-data "web;web" --name "VegaHub" "VegaHubLauncher.py"

echo.
echo Cleaning up temporary node.exe...
del node.exe

echo.
echo =======================================================
echo Build Complete!
echo You can find your completely standalone executable file in:
echo   d:\SteamLibrary\vega-providers\dist\OrbixPlay.exe
echo.
echo Note: This executable now contains everything needed to run!
echo You can move it to any folder or share it on Windows, and it will 
echo work automatically without needing node.js installed on the other end.
echo =======================================================
pause
