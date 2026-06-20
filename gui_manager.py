import tkinter as tk
from tkinter import messagebox
import subprocess
import threading
import os
import socket

class ServerManagerApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Vega Providers Server Manager")
        self.root.geometry("400x350")
        
        self.server_process = None
        
        # Check required files
        self.required_files = ["package.json", "dev-server.js", "providers"]
        
        self.setup_ui()

    def setup_ui(self):
        # Title
        tk.Label(self.root, text="Node Server Manager", font=("Helvetica", 16, "bold")).pack(pady=10)
        
        # Status
        self.status_label = tk.Label(self.root, text="Status: Stopped", fg="red", font=("Helvetica", 12))
        self.status_label.pack(pady=5)
        
        # URL Frame
        url_frame = tk.Frame(self.root)
        url_frame.pack(pady=5)
        
        self.url_label = tk.Label(url_frame, text="URL: N/A", font=("Helvetica", 10), fg="blue")
        self.url_label.grid(row=0, column=0, padx=5)
        
        self.btn_copy_url = tk.Button(url_frame, text="Copy", command=self.copy_url, font=("Helvetica", 8))
        self.btn_copy_url.grid(row=0, column=1, padx=5)
        
        # Buttons Frame
        btn_frame = tk.Frame(self.root)
        btn_frame.pack(pady=20)
        
        self.btn_start = tk.Button(btn_frame, text="Start Server", command=self.start_server, width=15, bg="#4CAF50", fg="white", font=("Helvetica", 10, "bold"))
        self.btn_start.grid(row=0, column=0, padx=5, pady=5)
        
        self.btn_stop = tk.Button(btn_frame, text="Stop Server", command=self.stop_server, state=tk.DISABLED, width=15, bg="#f44336", fg="white", font=("Helvetica", 10, "bold"))
        self.btn_stop.grid(row=0, column=1, padx=5, pady=5)
        
        self.btn_install = tk.Button(btn_frame, text="NPM Install", command=self.npm_install, width=15, font=("Helvetica", 10))
        self.btn_install.grid(row=1, column=0, padx=5, pady=5)
        
        self.btn_check = tk.Button(btn_frame, text="Check Files", command=self.check_files_popup, width=15, font=("Helvetica", 10))
        self.btn_check.grid(row=1, column=1, padx=5, pady=5)
        
        # Log Text Area
        self.log_area = tk.Text(self.root, height=8, width=45)
        self.log_area.pack(pady=10)
        
        # Check files on startup
        if not self.check_required_files():
            self.show_missing_files_error()

    def copy_url(self):
        url_text = self.url_label.cget("text").replace("URL: ", "").strip()
        if url_text and url_text != "N/A":
            self.root.clipboard_clear()
            self.root.clipboard_append(url_text)
            self.root.update()
            messagebox.showinfo("Copied", f"Copied {url_text} to clipboard!")

    def check_required_files(self):
        for item in self.required_files:
            if not os.path.exists(item):
                return False
        return True
        
    def show_missing_files_error(self):
        messagebox.showerror("Error", "add/install provider files to run server")

    def check_files_popup(self):
        if self.check_required_files():
            messagebox.showinfo("Success", "All required files are present!")
        else:
            self.show_missing_files_error()

    def get_local_ip(self):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            return ip
        except Exception:
            return "127.0.0.1"

    def kill_port(self, port):
        try:
            if os.name == 'nt':
                output = subprocess.check_output(f"netstat -ano | findstr :{port}", shell=True).decode()
                for line in output.splitlines():
                    if "LISTENING" in line:
                        parts = line.strip().split()
                        pid = parts[-1]
                        if pid and pid != "0":
                            subprocess.call(f"taskkill /F /PID {pid}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                subprocess.call(f"lsof -i tcp:{port} | grep LISTEN | awk '{{print $2}}' | xargs kill -9", shell=True)
        except Exception:
            pass

    def start_server(self):
        if not self.check_required_files():
            self.show_missing_files_error()
            return
            
        if self.server_process is not None:
            return
            
        self.log_area.insert(tk.END, "Cleaning up old processes on port 3001...\n")
        self.kill_port(3001)
        self.log_area.insert(tk.END, "Starting server...\n")
        
        try:
            # Using shell=True for Windows to resolve npm
            self.server_process = subprocess.Popen(
                "npm start", 
                shell=True, 
                stdout=subprocess.PIPE, 
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0
            )
            
            self.status_label.config(text="Status: Running", fg="green")
            self.btn_start.config(state=tk.DISABLED)
            self.btn_stop.config(state=tk.NORMAL)
            
            ip = self.get_local_ip()
            port = 3001 # Defined in dev-server.js
            self.url_label.config(text=f"URL: http://{ip}:{port}")
            
            # Start a thread to read output
            threading.Thread(target=self.read_output, daemon=True).start()
            
        except Exception as e:
            messagebox.showerror("Error", f"Failed to start server: {e}")
            self.server_process = None

    def read_output(self):
        if self.server_process:
            for line in iter(self.server_process.stdout.readline, ''):
                self.log_area.insert(tk.END, line)
                self.log_area.see(tk.END)
            self.server_process.stdout.close()

    def stop_server(self):
        if self.server_process:
            try:
                if os.name == 'nt':
                    # Kill the process group on Windows
                    subprocess.call(['taskkill', '/F', '/T', '/PID', str(self.server_process.pid)])
                else:
                    self.server_process.terminate()
            except Exception as e:
                print(f"Error killing process: {e}")
                
            self.server_process = None
            self.status_label.config(text="Status: Stopped", fg="red")
            self.btn_start.config(state=tk.NORMAL)
            self.btn_stop.config(state=tk.DISABLED)
            self.url_label.config(text="URL: N/A")
            self.log_area.insert(tk.END, "Server stopped.\n")
            self.log_area.see(tk.END)

    def npm_install(self):
        if not self.check_required_files():
            self.show_missing_files_error()
            return
            
        self.btn_install.config(state=tk.DISABLED)
        self.log_area.insert(tk.END, "Running npm install...\n")
        self.log_area.see(tk.END)
        
        def run_install():
            try:
                process = subprocess.Popen("npm install", shell=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
                for line in iter(process.stdout.readline, ''):
                    self.log_area.insert(tk.END, line)
                    self.log_area.see(tk.END)
                process.wait()
                
                self.root.after(0, lambda: messagebox.showinfo("Success", "npm install completed!"))
            except Exception as e:
                self.root.after(0, lambda: messagebox.showerror("Error", f"npm install failed: {e}"))
            finally:
                self.root.after(0, lambda: self.btn_install.config(state=tk.NORMAL))
                
        threading.Thread(target=run_install, daemon=True).start()

if __name__ == "__main__":
    root = tk.Tk()
    app = ServerManagerApp(root)
    root.protocol("WM_DELETE_WINDOW", lambda: (app.stop_server(), root.destroy()))
    root.mainloop()
