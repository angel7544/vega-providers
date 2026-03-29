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
                os.environ['VLC_ARCH_MISMATCH'] = f"Python {python_bits}-bit vs VLC {vlc_bits}-bit"
            
            # Set environment variable for python-vlc to find the DLL
            os.environ['PYTHON_VLC_LIB_PATH'] = os.path.join(found_path, "libvlc.dll")
            
            try:
                os.add_dll_directory(found_path)
            except Exception:
                pass
        else:
            os.environ['VLC_NOT_FOUND'] = "1"

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
        mismatch = os.environ.get('VLC_ARCH_MISMATCH')
        not_found = os.environ.get('VLC_NOT_FOUND')

        if vlc_lib is None or not hasattr(vlc_lib, 'Instance') or mismatch or not_found:
            err_msg = ""
            if mismatch: err_msg = mismatch
            elif not_found: err_msg = "VLC Not Found"
            self.show_vlc_error(err_msg)
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
        # Added --network-caching=3000 for better remote stream stability
        # Added --no-video-title-show to prevent VLC from showing filename atop the video
        self.vlc_instance = vlc_lib.Instance('--no-xlib', '--quiet', '--network-caching=3000', '--no-video-title-show')
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

        # Auto-hide Tracking
        self.last_mouse_move_time = time.time()
        self.controls_visible = True
        
        # Mouse movement tracking
        self.bind("<Motion>", self.on_mouse_move)
        self.video_frame.bind("<Motion>", self.on_mouse_move)
        self.controls_frame.bind("<Enter>", self.on_controls_enter)
        self.controls_frame.bind("<Leave>", self.on_controls_leave)
        self.is_mouse_on_controls = False

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

        # Audio Track Selection Button (Cycles through tracks)
        self.audio_btn = ctk.CTkButton(self.buttons_frame, text="🌐 Audio: Default", width=160, fg_color="#333", command=self.cycle_audio_track)
        self.audio_btn.pack(side="left", padx=5)

        # Subtitle Selection Button
        self.subtitle_btn = ctk.CTkButton(self.buttons_frame, text="💬 Sub: Off", width=120, fg_color="#333", command=self.cycle_subtitle_track)
        self.subtitle_btn.pack(side="left", padx=5)

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
        self.bind("f", lambda e: self.toggle_fullscreen())
        self.bind("<Escape>", lambda e: self.exit_fullscreen())
        self.protocol("WM_DELETE_WINDOW", self.on_closing)

        # Start Playback
        self.after(500, self.start_play)
        self.update_ui_task()

    def exit_fullscreen(self, event=None):
        self.attributes("-fullscreen", False)
        self.controls_frame.grid(row=1, column=0, sticky="ew")

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
        try:
            vlc_lib = get_vlc()
            # Guard: Only seek if playing or paused
            if not vlc_lib or self.player.get_state() not in [vlc_lib.State.Playing, vlc_lib.State.Paused]:
                return

            curr_time = self.player.get_time()
            if curr_time < 0: return

            new_time = curr_time + (seconds * 1000)
            if new_time < 0: new_time = 0
            
            # Additional check: don't seek past length if known
            total_ms = self.player.get_length()
            if total_ms > 0 and new_time > total_ms:
                new_time = total_ms - 1000 # 1s before end
                if new_time < 0: new_time = 0

            self.player.set_time(new_time)
        except Exception as e:
            self._log_error(f"seek_relative error: {e}")

    def on_slider_move(self, value):
        # Update time label while dragging for feedback
        total_ms = self.player.get_length()
        if total_ms > 0:
            curr_ms = int((value / 1000.0) * total_ms)
            self.time_label.configure(text=f"{self.format_time(curr_ms)} / {self.format_time(total_ms)}")

    def on_slider_press(self, event):
        self.updating_slider = True

    def on_slider_release(self, event):
        try:
            # Only seek when user releases the slider for better performance
            vlc_lib = get_vlc()
            if not vlc_lib: return

            # Guard: Only seek if player is active
            state = self.player.get_state()
            if state not in [vlc_lib.State.Playing, vlc_lib.State.Paused, vlc_lib.State.Opening, vlc_lib.State.Buffering]:
                self.updating_slider = False
                return

            value = self.slider.get()
            new_pos = value / 1000.0
            
            # Bounds check
            if new_pos < 0: new_pos = 0
            if new_pos > 1: new_pos = 1
            
            self.player.set_position(new_pos)
        except Exception as e:
            self._log_error(f"on_slider_release error: {e}")
        finally:
            self.updating_slider = False

    def set_volume(self, value):
        self.player.audio_set_volume(int(value))

    def cycle_audio_track(self):
        tracks = self.player.audio_get_track_description()
        if not tracks or len(tracks) <= 1:
            return
            
        curr_track = self.player.audio_get_track()
        
        # Find next track index
        next_idx = 0
        for i, (tid, name) in enumerate(tracks):
            if tid == curr_track:
                next_idx = (i + 1) % len(tracks)
                break
        
        # Skip 'Disabled' or weird tracks if possible
        next_tid = tracks[next_idx][0]
        self.player.audio_set_track(next_tid)
        
        # Update button text immediately
        try:
            new_name = tracks[next_idx][1]
            if isinstance(new_name, bytes): new_name = new_name.decode('utf-8', errors='ignore')
            self.audio_btn.configure(text=f"🌐 Audio: {new_name}")
        except Exception as e:
            print(f"Error decoding audio track: {e}")

    def cycle_subtitle_track(self):
        tracks = self.player.video_get_spu_description()
        if not tracks:
            return
            
        curr_track = self.player.video_get_spu()
        
        # Find next track index
        next_idx = 0
        for i, (tid, name) in enumerate(tracks):
            if tid == curr_track:
                next_idx = (i + 1) % len(tracks)
                break
        
        next_tid = tracks[next_idx][0]
        self.player.video_set_spu(next_tid)
        
        # Update button text
        try:
            new_name = tracks[next_idx][1]
            if isinstance(new_name, bytes): new_name = new_name.decode('utf-8', errors='ignore')
            if next_tid == -1 or "Disable" in str(new_name) or "off" in str(new_name).lower():
                label = "Off"
            else:
                label = new_name
            self.subtitle_btn.configure(text=f"💬 Sub: {label}")
        except Exception as e:
            print(f"Error decoding sub track: {e}")

    def on_mouse_move(self, event=None):
        self.last_mouse_move_time = time.time()
        if not self.controls_visible:
            self.show_controls()

    def on_controls_enter(self, event=None):
        self.is_mouse_on_controls = True
        self.show_controls()

    def on_controls_leave(self, event=None):
        self.is_mouse_on_controls = False

    def show_controls(self):
        if not self.controls_visible:
            self.controls_frame.grid(row=1, column=0, sticky="ew")
            self.controls_visible = True
            # Re-configure grid weights if needed
            self.grid_rowconfigure(0, weight=1)
            self.grid_rowconfigure(1, weight=0)

    def hide_controls(self):
        if self.controls_visible:
            self.controls_frame.grid_forget()
            self.controls_visible = False
            # Allow video to fill entire window
            self.grid_rowconfigure(0, weight=1)

    def toggle_fullscreen(self):
        state = self.attributes("-fullscreen")
        self.attributes("-fullscreen", not state)
        # Force controls to show on toggle
        self.show_controls()
        self.focus_set()

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
            curr_track = self.player.audio_get_track()
            tracks = self.player.audio_get_track_description()
            if tracks:
                for tid, name in tracks:
                    if tid == curr_track:
                        try:
                            t_name = name
                            if isinstance(t_name, bytes): t_name = t_name.decode('utf-8', errors='ignore')
                            if t_name not in self.audio_btn.cget("text"):
                                self.audio_btn.configure(text=f"🌐 Audio: {t_name}")
                        except Exception: pass
                        break

            # Update Subtitle Track if needed
            curr_spu = self.player.video_get_spu()
            spus = self.player.video_get_spu_description()
            if spus:
                for tid, name in spus:
                    if tid == curr_spu:
                        try:
                            s_name = name
                            if isinstance(s_name, bytes): s_name = s_name.decode('utf-8', errors='ignore')
                            if "Disable" in str(s_name) or "off" in str(s_name).lower():
                                s_label = "Off"
                            else:
                                s_label = s_name
                            if s_label not in self.subtitle_btn.cget("text"):
                                self.subtitle_btn.configure(text=f"💬 Sub: {s_label}")
                        except Exception: pass
                        break

            # Auto-hide logic check
            if self.controls_visible and not self.is_mouse_on_controls:
                inactivity_time = time.time() - self.last_mouse_move_time
                if inactivity_time > 3.0: # 3 seconds
                    self.hide_controls()

            # Check for end of media
            vlc_lib = get_vlc()
            if vlc_lib and self.player.get_state() == vlc_lib.State.Ended:
                self.on_closing()

        except Exception as e:
            # Don't flood stdout with every error, but log it once if it's new
            # print(f"UI update Error: {e}")
            pass
            
        if self.winfo_exists():
            self.after(500, self.update_ui_task)

    def _log_error(self, message):
        try:
            import traceback
            log_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "player_error.log")
            with open(log_file, "a", encoding="utf-8") as f:
                f.write(f"\n[{time.strftime('%Y-%m-%d %H:%M:%S')}] ERROR: {message}\n")
                f.write(traceback.format_exc())
        except:
            pass

    def show_vlc_error(self, specific_error=""):
        # Clear any existing widgets
        for widget in self.winfo_children():
            widget.destroy()
            
        err_frame = ctk.CTkFrame(self, fg_color="#1a1a1c", corner_radius=15, border_width=2, border_color="#ff4444")
        err_frame.place(relx=0.5, rely=0.5, anchor="center", relwidth=0.8, relheight=0.7)
        
        ctk.CTkLabel(err_frame, text="❌ VLC Initialization Failed", font=ctk.CTkFont(size=24, weight="bold"), text_color="#ff4444").pack(pady=(30, 10))
        
        python_bits = 8 * 8 if sys.maxsize > 2**32 else 4 * 8
        msg = f"Your Python environment is {python_bits}-bit.\n\n"
        
        if "Python" in specific_error:
            msg += f"Architecture Mismatch Detected: {specific_error}\n\n"
            msg += "The 'vlc_bundle' or installed VLC must be 64-bit to work with this Python version."
        elif "Not Found" in specific_error:
            msg += "VLC was not found in 'vlc_bundle' or standard system paths."
        else:
            msg += f"Detailed Error: {specific_error}"
        
        ctk.CTkLabel(err_frame, text=msg, font=ctk.CTkFont(size=14), wraplength=600, justify="center").pack(pady=10)
        
        btn_download = ctk.CTkButton(err_frame, text="Download VLC 64-bit", fg_color="#2b6bba", command=lambda: webbrowser.open("https://www.videolan.org/vlc/download-windows.html"))
        btn_download.pack(pady=15)
        
        ctk.CTkButton(err_frame, text="Close Player", fg_color="transparent", border_width=1, command=self.destroy).pack(pady=5)

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
    def global_log(msg):
        try:
            import traceback
            log_f = os.path.join(os.path.dirname(os.path.abspath(__file__)), "player_error.log")
            with open(log_f, "a", encoding="utf-8") as f:
                f.write(f"\n[{time.strftime('%Y-%m-%d %H:%M:%S')}] PID {os.getpid()}: {msg}\n")
                f.write(traceback.format_exc())
            print(f"CRASH: Error written to {log_f}")
        except:
            pass

    if len(sys.argv) > 1:
        try:
            u = sys.argv[1]
            # Join all remaining arguments for the title (handles spaces)
            t = " ".join(sys.argv[2:]) if len(sys.argv) > 2 else "Video Player"
            play_video(u, t)
        except BaseException as e:
            # Catching BaseException to handle even SystemExit or weird hardware/vlc aborts
            global_log(f"CRASH: {e}")
            sys.exit(1)
    else:
        # No args, just exit
        sys.exit(0)
