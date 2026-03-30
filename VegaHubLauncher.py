import subprocess
import atexit
import sys
import os
import time

import shutil

# Ensure we're in the correct directory if run from an exe
if getattr(sys, 'frozen', False):
    exe_dir = os.path.dirname(sys.executable)
    meipass = sys._MEIPASS
    
    # Extract configurable files out to the application directory
    items_to_extract = ['manifest.json', 'dist', 'web', 'artplayer.js']
    for item in items_to_extract:
        src = os.path.join(meipass, item)
        dst = os.path.join(exe_dir, item)
        if not os.path.exists(dst):
            try:
                if os.path.isdir(src):
                    shutil.copytree(src, dst)
                else:
                    shutil.copy2(src, dst)
            except Exception as e:
                print(f"Extraction failed for {item}: {e}")

    # Set working directory to the user-facing exe location
    os.chdir(exe_dir)
    
    node_path = os.path.join(meipass, "node.exe")
    server_path = os.path.join(meipass, "server.bundle.js")
    
    if os.path.exists(node_path) and os.path.exists(server_path):
        server_cmd = f'"{node_path}" "{server_path}"'
    else:
        print("Bundled server not found. Skipping server startup.")
        server_cmd = None
else:
    application_path = os.path.dirname(os.path.abspath(__file__))
    os.chdir(application_path)
    server_cmd = "npm run auto"

import peott

def run():
    server_process = None
    if server_cmd:
        print("Starting Vega Providers Server...")
        creationflags = 0
        if sys.platform == "win32":
            # Hides the console window for the subprocess
            creationflags = subprocess.CREATE_NO_WINDOW
            
        # Start the local server
        try:
            server_process = subprocess.Popen(
                server_cmd,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                shell=True,
                creationflags=creationflags
            )
        except Exception as e:
            print(f"Failed to start server: {e}")

    def cleanup():
        if server_process:
            print("Shutting down Vega Providers Server...")
            if sys.platform == "win32":
                subprocess.call(['taskkill', '/F', '/T', '/PID', str(server_process.pid)], 
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                server_process.terminate()

    # Register cleanup to happen automatically when Python exits
    atexit.register(cleanup)
    
    # Give the node server a moment to spin up if it was started
    if server_process:
        print("Waiting for server to start...")
        time.sleep(2)
    
    # Launch the app GUI
    peott.main()
    return  # main() is blocking (runs webview event loop)
    
if __name__ == "__main__":
    run()
