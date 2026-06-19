@echo off
echo ========================================================
echo Building OrbiPlay Vega Provider Server Executable
echo ========================================================

echo.
echo Installing PyInstaller if not present...
pip install pyinstaller

echo.
echo Building executable with PyInstaller...
python -m PyInstaller --noconfirm --onefile --windowed --icon=web\icon.ico gui_manager.py

echo.
echo Copying required application files to 'dist' folder...
xcopy "package.json" "dist\" /Y
xcopy "dev-server.js" "dist\" /Y
xcopy "providers" "dist\providers\" /E /I /Y
xcopy "web" "dist\web\" /E /I /Y

echo.
echo ========================================================
echo Build Complete!
echo Your executable and required files are in the 'dist' folder.
echo You can run 'dist\gui_manager.exe' to start the application.
echo ========================================================
pause
