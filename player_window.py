import os
import sys
import webbrowser

# --- VLC DLL Path Handling (Must be before import vlc) ---
def setup_vlc_dll_path():
    if sys.platform == "win32":
        # Search for VLC installation paths
        vlc_paths = [
            os.environ.get("PYTHON_VLC_LIB_PATH", ""), # User override
        ]
        
        # Prioritize bundled VLC
        if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
            bundle_vlc = os.path.join(sys._MEIPASS, "vlc_bundle")
            if os.path.exists(bundle_vlc):
                vlc_paths.append(bundle_vlc)
        
        local_bundle = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vlc_bundle")
        if os.path.exists(local_bundle):
            vlc_paths.append(local_bundle)
            
        # Fallback to system paths
        vlc_paths.extend([
            r"C:\Program Files\VideoLAN\VLC",
            r"C:\Program Files (x86)\VideoLAN\VLC",
        ])
        
        found_path = None
        for p in vlc_paths:
            if p and os.path.exists(os.path.join(p, "libvlc.dll")):
                found_path = p
                break
        
        if found_path:
            # Check for bit-depth mismatch (common error)
            python_bits = 8 * 8 if sys.maxsize > 2**32 else 4 * 8
            vlc_bits = 64 if " (x86)" not in found_path else 32
            
            if python_bits != vlc_bits:
                print(f"ERROR: VLC Architecture Mismatch!")
                print(f"Python is {python_bits}-bit, but found VLC {vlc_bits}-bit at: {found_path}")
                print(f"Please install the {python_bits}-bit version of VLC Media Player.")
            
            # CRITICAL: Set environment variable for python-vlc to find the DLL
            lib_file = os.path.join(found_path, "libvlc.dll")
            os.environ['PYTHON_VLC_LIB_PATH'] = lib_file
            
            try:
                os.add_dll_directory(found_path)
            except AttributeError:
                # Python < 3.8
                os.environ['PATH'] = found_path + os.pathsep + os.environ['PATH']
        else:
            print("ERROR: libvlc.dll not found. Please install VLC Media Player.")

setup_vlc_dll_path()

# We defer 'import vlc' to inside the VLCPlayer class to avoid 
# import-time DLL errors in the launcher.
vlc = None
def get_vlc():
    global vlc
    if vlc is None:
        try:
            import vlc as vlc_module
            vlc = vlc_module
        except ImportError as e:
            print(f"Failed to import vlc module: {e}")
    return vlc

import customtkinter as ctk
import tkinter as tk
from tkinter import ttk
import sys
import os
import threading
import time

# Set appearance mode and color theme
ctk.set_appearance_mode("Dark")
ctk.set_default_color_theme("blue")

class VLCPlayer(ctk.CTk):
    def __init__(self, url, title="Video Player"):
        super().__init__()

        self.title(title)
        self.geometry("1000x700")
        self.configure(fg_color="#000000")

        self.url = url
        self.is_paused = False
        self.updating_slider = False

        # Error handling if VLC failed to import or find DLLs
        vlc_lib = get_vlc()
        if vlc_lib is None or not hasattr(vlc_lib, 'Instance'):
            self.show_vlc_error()
            return

        # Load Window Title Bar Icon
        try:
            icon_path = "icon.ico"
            if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
                bundled_icon = os.path.join(sys._MEIPASS, "icon.ico")
                if os.path.exists(bundled_icon):
                    icon_path = bundled_icon
            
            if os.path.exists(icon_path):
                self.iconbitmap(icon_path)
        except:
            pass

        # VLC Initialization
        # On Windows, we might need to specify the plugin path if not in env
        self.vlc_instance = vlc_lib.Instance('--no-xlib', '--quiet')
        self.player = self.vlc_instance.media_player_new()

        # UI Layout
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(0, weight=1) # Video area
        self.grid_rowconfigure(1, weight=0) # Controls area

        # Video Frame
        self.video_frame = tk.Frame(self, bg="black")
        self.video_frame.grid(row=0, column=0, sticky="nsew")

        # Controls Frame
        self.controls_frame = ctk.CTkFrame(self, height=120, corner_radius=0, fg_color="#121212")
        self.controls_frame.grid(row=1, column=0, sticky="ew")
        
        # --- Seek Bar ---
        self.slider = ctk.CTkSlider(self.controls_frame, from_=0, to=1000, command=self.on_slider_move, height=18)
        self.slider.pack(fill="x", padx=20, pady=(10, 5))
        self.slider.set(0)
        self.slider.bind("<Button-1>", self.on_slider_press)
        self.slider.bind("<ButtonRelease-1>", self.on_slider_release)

        # Time Labels
        self.time_frame = ctk.CTkFrame(self.controls_frame, fg_color="transparent")
        self.time_frame.pack(fill="x", padx=22)
        self.time_label = ctk.CTkLabel(self.time_frame, text="00:00 / 00:00", font=ctk.CTkFont(size=12))
        self.time_label.pack(side="left")

        # --- Buttons and Audio Selection ---
        self.buttons_frame = ctk.CTkFrame(self.controls_frame, fg_color="transparent")
        self.buttons_frame.pack(fill="x", padx=20, pady=(5, 15))

        # Play/Pause
        self.play_btn = ctk.CTkButton(self.buttons_frame, text="⏸ Pause", width=90, command=self.toggle_play)
        self.play_btn.pack(side="left", padx=5)

        # Skip Back
        self.back_btn = ctk.CTkButton(self.buttons_frame, text="⏪ 10s", width=60, fg_color="#333", command=lambda: self.seek_relative(-10))
        self.back_btn.pack(side="left", padx=5)

        # Skip Forward
        self.fwd_btn = ctk.CTkButton(self.buttons_frame, text="10s ⏩", width=60, fg_color="#333", command=lambda: self.seek_relative(10))
        self.fwd_btn.pack(side="left", padx=5)

        # Stop
        self.stop_btn = ctk.CTkButton(self.buttons_frame, text="⏹ Stop", width=70, fg_color="#442222", hover_color="#663333", command=self.on_closing)
        self.stop_btn.pack(side="left", padx=20)

        # Audio Track Selection
        ctk.CTkLabel(self.buttons_frame, text="Audio:").pack(side="left", padx=(10, 5))
        self.audio_menu = ctk.CTkOptionMenu(self.buttons_frame, values=["Default"], command=self.change_audio_track, width=150)
        self.audio_menu.pack(side="left", padx=5)

        # Volume
        ctk.CTkLabel(self.buttons_frame, text="🔊").pack(side="left", padx=(20, 5))
        self.volume_slider = ctk.CTkSlider(self.buttons_frame, from_=0, to=100, width=120, command=self.set_volume)
        self.volume_slider.set(80)
        self.volume_slider.pack(side="left", padx=5)

        # Fullscreen Toggle
        self.fs_btn = ctk.CTkButton(self.buttons_frame, text="Full Screen", width=100, fg_color="#2b6bba", command=self.toggle_fullscreen)
        self.fs_btn.pack(side="right", padx=5)

        # Events and Shortcuts
        self.bind("<space>", lambda e: self.toggle_play())
        self.bind("<Left>", lambda e: self.seek_relative(-10))
        self.bind("<Right>", lambda e: self.seek_relative(10))
        self.protocol("WM_DELETE_WINDOW", self.on_closing)

        # Start Playback
        self.after(500, self.start_play)
        self.update_ui_task()

    def start_play(self):
        # Media handle
        media = self.vlc_instance.media_new(self.url)
        self.player.set_media(media)

        # Set window handle for video output
        if sys.platform == "win32":
            self.player.set_hwnd(self.video_frame.winfo_id())
        elif sys.platform == "darwin":
            self.player.set_nsobject(self.video_frame.winfo_id())
        else:
            self.player.set_xwindow(self.video_frame.winfo_id())

        self.player.play()
        self.player.audio_set_volume(80)

    def toggle_play(self):
        if self.player.is_playing():
            self.player.pause()
            self.play_btn.configure(text="▶ Play")
            self.is_paused = True
        else:
            self.player.play()
            self.play_btn.configure(text="⏸ Pause")
            self.is_paused = False

    def seek_relative(self, seconds):
        curr_time = self.player.get_time()
        new_time = curr_time + (seconds * 1000)
        if new_time < 0: new_time = 0
        self.player.set_time(new_time)

    def on_slider_move(self, value):
        if self.updating_slider:
            new_pos = value / 1000.0
            self.player.set_position(new_pos)

    def on_slider_press(self, event):
        self.updating_slider = True

    def on_slider_release(self, event):
        self.updating_slider = False

    def set_volume(self, value):
        self.player.audio_set_volume(int(value))

    def change_audio_track(self, choice):
        tracks = self.player.audio_get_track_description()
        for track_id, track_name in tracks:
            if track_name.decode('utf-8') == choice:
                self.player.audio_set_track(track_id)
                break

    def toggle_fullscreen(self):
        state = self.attributes("-fullscreen")
        self.attributes("-fullscreen", not state)
        if not state:
            self.controls_frame.grid_forget()
        else:
            self.controls_frame.grid(row=1, column=0, sticky="ew")

    def format_time(self, ms):
        s = ms // 1000
        m, s = divmod(s, 60)
        h, m = divmod(m, 60)
        if h > 0:
            return f"{h:02d}:{m:02d}:{s:02d}"
        else:
            return f"{m:02d}:{s:02d}"

    def update_ui_task(self):
        try:
            if not self.updating_slider:
                pos = self.player.get_position()
                if pos >= 0:
                    self.slider.set(pos * 1000)
            
            curr_ms = self.player.get_time()
            total_ms = self.player.get_length()
            if curr_ms >= 0 and total_ms > 0:
                self.time_label.configure(text=f"{self.format_time(curr_ms)} / {self.format_time(total_ms)}")

            # Update Audio Tracks if needed
            if len(self.audio_menu._values) <= 1:
                tracks = self.player.audio_get_track_description()
                if tracks:
                    track_names = [t[1].decode('utf-8') for t in tracks]
                    if track_names:
                        self.audio_menu.configure(values=track_names)
                        curr_track = self.player.audio_get_track()
                        for tid, name in tracks:
                            if tid == curr_track:
                                self.audio_menu.set(name.decode('utf-8'))

            # Check for end of media
            vlc_lib = get_vlc()
            if vlc_lib and self.player.get_state() == vlc_lib.State.Ended:
                self.on_closing()

        except Exception as e:
            print(f"UI update Error: {e}")
            
        if self.winfo_exists():
            self.after(500, self.update_ui_task)

    def show_vlc_error(self):
        # Clear any existing widgets
        for widget in self.winfo_children():
            widget.destroy()
            
        err_frame = ctk.CTkFrame(self, fg_color="#1a1a1c", corner_radius=15, border_width=2, border_color="#ff4444")
        err_frame.place(relx=0.5, rely=0.5, anchor="center", relwidth=0.8, relheight=0.6)
        
        ctk.CTkLabel(err_frame, text="❌ VLC Initialization Failed", font=ctk.CTkFont(size=24, weight="bold"), text_color="#ff4444").pack(pady=(40, 20))
        
        python_bits = 8 * 8 if sys.maxsize > 2**32 else 4 * 8
        msg = f"Your Python environment is {python_bits}-bit.\n\n"
        msg += "To use this player, you MUST install the 64-bit version of VLC Media Player.\n"
        msg += "The currently installed VLC (in Program Files x86) is 32-bit and incompatible."
        
        ctk.CTkLabel(err_frame, text=msg, font=ctk.CTkFont(size=14), wraplength=600, justify="center").pack(pady=20)
        
        btn_download = ctk.CTkButton(err_frame, text="Download VLC 64-bit", fg_color="#2b6bba", command=lambda: webbrowser.open("https://www.videolan.org/vlc/download-windows.html"))
        btn_download.pack(pady=10)
        
        ctk.CTkButton(err_frame, text="Close Player", fg_color="transparent", border_width=1, command=self.destroy).pack(pady=10)

    def on_closing(self):
        self.player.stop()
        self.vlc_instance.release()
        self.destroy()
        sys.exit(0)

def play_video(url, title="Video Player", audio_tracks_json=None):
    # Ignoring audio_tracks_json as VLC handles internal tracks natively
    app = VLCPlayer(url, title)
    app.mainloop()

if __name__ == "__main__":
    if len(sys.argv) > 1:
        u = sys.argv[1]
        t = sys.argv[2] if len(sys.argv) > 2 else "Video Player"
        play_video(u, t)
