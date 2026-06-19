import tkinter as tk
from tkinter import messagebox
import subprocess
import threading
import os
import socket
import webbrowser

class ServerManagerApp:
    def __init__(self, root):
        self.root = root
        self.root.title("OrbiPlay Vega Provider Server by Br31 Technology and Angel Mehul Singh")
        self.root.geometry("480x450")
        self.dark_mode = False
        try:
            self.root.iconbitmap(r"web\icon.ico")
        except Exception:
            pass
        
        self.server_process = None
        
        # Check required files
        self.required_files = ["package.json", "dev-server.js", "providers"]
        
        self.setup_ui()

    def setup_ui(self):
        # Title Frame
        title_frame = tk.Frame(self.root)
        title_frame.pack(pady=10, fill=tk.X)
        
        tk.Label(title_frame, text="OrbiPlay Vega Provider Server", font=("Helvetica", 14, "bold")).pack(side=tk.LEFT, padx=10)
        
        self.btn_help = tk.Button(title_frame, text=" i ", command=self.show_help, font=("Helvetica", 10, "bold"), fg="blue", bd=1)
        self.btn_help.pack(side=tk.RIGHT, padx=10)
        
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
        
        self.btn_open_url = tk.Button(url_frame, text="Open Portal", command=self.open_portal, font=("Helvetica", 8))
        self.btn_open_url.grid(row=0, column=2, padx=5)
        
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
        
        # Bottom controls: Theme toggle & Developer Info
        bottom_frame = tk.Frame(self.root)
        bottom_frame.pack(pady=5, fill=tk.X, padx=10)
        
        self.btn_theme = tk.Button(bottom_frame, text="🌙 Dark Mode", command=self.toggle_theme, font=("Helvetica", 8))
        self.btn_theme.pack(side=tk.LEFT)
        
        dev_frame = tk.Frame(bottom_frame)
        dev_frame.pack(side=tk.RIGHT)
        
        tk.Label(dev_frame, text="Dev Info:", font=("Helvetica", 8)).pack(side=tk.LEFT)
        
        btn_github = tk.Label(dev_frame, text="GitHub", font=("Helvetica", 8, "underline"), fg="blue", cursor="hand2")
        btn_github.pack(side=tk.LEFT, padx=4)
        btn_github.bind("<Button-1>", lambda e: webbrowser.open("https://github.com/angel7544"))
        
        btn_linkedin = tk.Label(dev_frame, text="LinkedIn", font=("Helvetica", 8, "underline"), fg="blue", cursor="hand2")
        btn_linkedin.pack(side=tk.LEFT, padx=4)
        btn_linkedin.bind("<Button-1>", lambda e: webbrowser.open("https://www.linkedin.com/in/angel3002/"))
        
        btn_email = tk.Label(dev_frame, text="Email", font=("Helvetica", 8, "underline"), fg="blue", cursor="hand2")
        btn_email.pack(side=tk.LEFT, padx=4)
        btn_email.bind("<Button-1>", lambda e: webbrowser.open("mailto:ajktalent@gmail.com"))
        
        # Check files on startup
        if not self.check_required_files():
            self.show_missing_files_error()

    def toggle_theme(self):
        self.dark_mode = not self.dark_mode
        if self.dark_mode:
            self.root.config(bg="#2b2b2b")
            self.log_area.config(bg="#1e1e1e", fg="#00ff00", insertbackground="white")
            self.btn_theme.config(text="☀️ Light Mode")
        else:
            self.root.config(bg="SystemButtonFace")
            self.log_area.config(bg="white", fg="black", insertbackground="black")
            self.btn_theme.config(text="🌙 Dark Mode")

    def show_help(self):
        help_text = (
            "Required Files to run Server:\n"
            "- package.json\n"
            "- dev-server.js\n"
            "- providers (folder)\n\n"
            "This can be run on a mini PC as a 24*7 home entertainment server!"
        )
        messagebox.showinfo("Help / Info", help_text)

    def open_portal(self):
        url_text = self.url_label.cget("text").replace("URL: ", "").strip()
        if url_text and url_text != "N/A":
            index_path = os.path.abspath(os.path.join("web", "index.html"))
            if os.path.exists(index_path):
                webbrowser.open(f"file://{index_path}")
            else:
                webbrowser.open(url_text)
        else:
            messagebox.showwarning("Not Running", "Start the server first to open the portal.")

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
