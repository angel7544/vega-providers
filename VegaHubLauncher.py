import subprocess
import atexit
import sys
import os
import time

# Ensure we're in the correct directory if run from an exe
if getattr(sys, 'frozen', False):
    application_path = os.path.dirname(sys.executable)
    os.chdir(application_path)

from peott import PersonalEntertainmentApp

def run():
    print("Starting Vega Providers Server...")
    creationflags = 0
    if sys.platform == "win32":
        # Hides the console window for the subprocess
        creationflags = subprocess.CREATE_NO_WINDOW
        
    # Start the local server
    server_process = subprocess.Popen(
        "npm run auto",
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
    run()
