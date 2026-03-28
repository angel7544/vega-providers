import subprocess
import atexit
import sys
import os
import time
import player_window

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
    server_cmd = f'"{os.path.join(meipass, "node.exe")}" "{os.path.join(meipass, "server.bundle.js")}"'
else:
    application_path = os.path.dirname(os.path.abspath(__file__))
    os.chdir(application_path)
    server_cmd = "npm run auto"

from peott import PersonalEntertainmentApp

def run():
    print("Starting Vega Providers Server...")
    creationflags = 0
    if sys.platform == "win32":
        # Hides the console window for the subprocess
        creationflags = subprocess.CREATE_NO_WINDOW
        
    # Start the local server
    server_process = subprocess.Popen(
        server_cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        shell=True,
        creationflags=creationflags
    )

    def cleanup():
        print("Shutting down Vega Providers Server...")
        if sys.platform == "win32":
            subprocess.call(['taskkill', '/F', '/T', '/PID', str(server_process.pid)], 
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            server_process.terminate()

    # Register cleanup to happen automatically when Python exits
    atexit.register(cleanup)
    
    # Give the node server a moment to spin up
    print("Waiting for server to start...")
    time.sleep(2)
    
    # Launch the app GUI
    app = PersonalEntertainmentApp()
    
    # Modify the app closure protocol to also force-exit sys (which triggers atexit)
    def on_closing():
        app.destroy()
        sys.exit(0)
        
    app.protocol("WM_DELETE_WINDOW", on_closing)
    app.mainloop()

if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == 'player_window':
        url = sys.argv[2] if len(sys.argv) > 2 else ""
        title = sys.argv[3] if len(sys.argv) > 3 else "Video Player"
        player_window.play_video(url, title)
        sys.exit(0)
    run()
