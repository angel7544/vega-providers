import os
import sys
import subprocess
import shutil

# Install required build tools if not present
def install_requirements():
    print("Checking build requirements...")
    subprocess.run([sys.executable, "-m", "pip", "install", "pyinstaller", "pillow", "customtkinter", "pywebview", "requests", "python-vlc"], check=True)

# Generate icon.ico from the provided PNG
def generate_ico(png_path, ico_path):
    print("Generating ICO file...")
    try:
        from PIL import Image
        img = Image.open(png_path)
        img.save(ico_path, format='ICO', sizes=[(256, 256)])
        print(f"Saved {ico_path}")
    except Exception as e:
        print(f"Warning: Failed to convert icon: {e}")

def run_build():
    png_source = r"C:\Users\angel\.gemini\antigravity\brain\21dd77e0-ce88-4206-88e4-34fc46874708\orbix_play_icon_1774789305435.png"
    if os.path.exists(png_source):
        shutil.copy(png_source, "icon.png")
    
    if os.path.exists("icon.png"):
        generate_ico("icon.png", "icon.ico")

    # Clean previous builds
    if os.path.exists("build"):
        shutil.rmtree("build", ignore_errors=True)
    if os.path.exists("dist"):
        shutil.rmtree("dist", ignore_errors=True)

    print("\nStarting PyInstaller build with custom .spec file...")
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--noconfirm",
        "OrbixPlay.spec"
    ]

    subprocess.run(cmd, check=True)

    print("\n✅ Build completed successfully! Executable is at 'dist/OrbixPlay/OrbixPlay.exe'")

if __name__ == "__main__":
    install_requirements()
    run_build()
