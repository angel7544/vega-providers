import os
import sys
import time
import ctypes
import traceback
import urllib.parse

# --- Extreme Hardened VLC DLL Loader ---
def pre_load_vlc_dll():
    try:
        import platform
        arch = platform.architecture()[0]
        bitness = "64" if "64" in arch else "32"
        print(f"[DEBUG] Python detect: {arch} ({bitness}-bit)")

        search_paths = [
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "vlc_bundle"),
            r"C:\Program Files\VideoLAN\VLC",
            r"C:\Program Files (x86)\VideoLAN\VLC"
        ]
        
        found_dir = None
        for d in search_paths:
            if d and os.path.exists(os.path.join(d, "libvlc.dll")):
                found_dir = d
                break
        
        if found_dir:
            os.environ['PYTHON_VLC_LIB_PATH'] = os.path.join(found_dir, "libvlc.dll")
            os.environ['VLC_PLUGIN_PATH'] = os.path.join(found_dir, "plugins")
            if hasattr(os, 'add_dll_directory'): os.add_dll_directory(found_dir)
            try:
                ctypes.CDLL(os.path.join(found_dir, "libvlccore.dll"))
                ctypes.CDLL(os.path.join(found_dir, "libvlc.dll"))
                print(f"[INFO] VLC DLLs verified from: {found_dir}")
                return True
            except Exception as e:
                print(f"[ERROR] Failed manual load: {e}"); time.sleep(5)
        else:
            print(f"[ERROR] No libvlc.dll found for {bitness}-bit Python.")
            time.sleep(5)
    except Exception as e:
        print(f"[FATAL] VLC pre-load error: {e}"); time.sleep(5)
    return False

# Load before any VLC imports
pre_load_vlc_dll()

try:
    import vlc
    from PyQt5.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, 
                                 QHBoxLayout, QPushButton, QSlider, QLabel, 
                                 QFrame, QGraphicsOpacityEffect, qApp, QMessageBox)
    from PyQt5.QtCore import Qt, QTimer, QPropertyAnimation, QEvent
    from PyQt5.QtGui import QIcon
except Exception as e:
    print(f"[FATAL] PyQt5/VLC Import Failed: {e}"); time.sleep(5); sys.exit(1)

class VLCPlayer(QMainWindow):
    def __init__(self, url, title="Video Player"):
        super().__init__()
        try:
            self.setWindowTitle(title)
            self.resize(1100, 750)
            self.setStyleSheet("background-color: black; color: white;")
            
            icon_p = "icon.ico"
            if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
                icon_p = os.path.join(sys._MEIPASS, "icon.ico")
            if os.path.exists(icon_p): self.setWindowIcon(QIcon(icon_p))

            # Store URL (decoded and raw fallback)
            self.url = url
            self.instance, self.player = None, None
            self.creation_time, self.is_dragging = time.time(), False

            # UI Setup
            self.central_widget = QWidget(); self.setCentralWidget(self.central_widget)
            self.layout = QVBoxLayout(self.central_widget); self.layout.setContentsMargins(0, 0, 0, 0)
            self.video_frame = QFrame(); self.video_frame.setAttribute(Qt.WA_NativeWindow); self.video_frame.setStyleSheet("background-color: black;"); self.layout.addWidget(self.video_frame)

            # Controls Overlay
            self.controls_overlay = QWidget(self); self.controls_overlay.setObjectName("controlsBar")
            self.controls_overlay.setStyleSheet("""
                QWidget#controlsBar { background-color: rgba(20, 20, 22, 230); border: 1px solid #333; border-radius: 15px; }
                QPushButton { background-color: #333; border: none; border-radius: 5px; padding: 6px; min-width: 65px; font-weight: bold; color: white; font-size: 11px; }
                QPushButton:hover { background-color: #444; }
                #playBtn { background-color: #2b6bba; min-width: 80px; }
            """)
            self.controls_layout = QVBoxLayout(self.controls_overlay); self.controls_layout.setContentsMargins(25, 12, 25, 18)
            self.slider = QSlider(Qt.Horizontal); self.slider.setRange(0, 1000); self.slider.sliderPressed.connect(self.on_slider_press); self.slider.sliderReleased.connect(self.on_slider_release); self.controls_layout.addWidget(self.slider)

            self.btns_row = QHBoxLayout(); self.time_label = QLabel("Loading..."); self.time_label.setFixedWidth(120); self.btns_row.addWidget(self.time_label); self.btns_row.addStretch()
            self.play_btn = QPushButton("⏸ Pause"); self.play_btn.setObjectName("playBtn"); self.play_btn.clicked.connect(self.toggle_play); self.btns_row.addWidget(self.play_btn)
            self.back_btn = QPushButton("⏪ 10s"); self.back_btn.clicked.connect(lambda: self.seek_relative(-10)); self.btns_row.addWidget(self.back_btn)
            self.fwd_btn = QPushButton("10s ⏩"); self.fwd_btn.clicked.connect(lambda: self.seek_relative(10)); self.btns_row.addWidget(self.fwd_btn)
            self.stop_btn = QPushButton("⏹ Stop"); self.stop_btn.clicked.connect(self.close); self.btns_row.addWidget(self.stop_btn); self.btns_row.addSpacing(15)
            self.audio_btn = QPushButton("🌐 Audio"); self.audio_btn.clicked.connect(self.cycle_audio); self.btns_row.addWidget(self.audio_btn)
            self.sub_btn = QPushButton("💬 Sub"); self.sub_btn.clicked.connect(self.cycle_subs); self.btns_row.addWidget(self.sub_btn); self.btns_row.addStretch()
            self.vol_slider = QSlider(Qt.Horizontal); self.vol_slider.setRange(0, 100); self.vol_slider.setValue(80); self.vol_slider.setFixedWidth(70); self.vol_slider.valueChanged.connect(self.set_volume); self.btns_row.addWidget(QLabel("🔊")); self.btns_row.addWidget(self.vol_slider)
            self.aspect_btn = QPushButton("📺 Fit"); self.aspect_btn.clicked.connect(self.cycle_aspect); self.btns_row.addWidget(self.aspect_btn)
            self.pip_btn = QPushButton("🖼 PiP"); self.pip_btn.clicked.connect(self.toggle_pip); self.btns_row.addWidget(self.pip_btn)
            self.fs_btn = QPushButton("Full Screen"); self.fs_btn.clicked.connect(self.toggle_fullscreen); self.btns_row.addWidget(self.fs_btn)
            self.controls_layout.addLayout(self.btns_row)

            # State & Anim
            self._aspect_modes, self._aspect_idx, self._is_pip, self._old_geom = ["Original", "16:9", "4:3", "Fill"], 0, False, None
            self.opacity_effect = QGraphicsOpacityEffect(self.controls_overlay); self.controls_overlay.setGraphicsEffect(self.opacity_effect)
            self.fade_anim = QPropertyAnimation(self.opacity_effect, b"opacity"); self.fade_anim.setDuration(300)
            self.ui_timer = QTimer(); self.ui_timer.setInterval(200); self.ui_timer.timeout.connect(self.update_ui)
            self.hide_timer = QTimer(); self.hide_timer.setInterval(3000); self.hide_timer.timeout.connect(self.hide_controls)
            qApp.installEventFilter(self)
            self.controls_visible = True
        except Exception as e:
            print(f"[FATAL] Init: {e}"); time.sleep(5); sys.exit(1)

    def start_playback(self):
        try:
            wid = int(self.video_frame.winId())
            # --- FINAL NETWORK BYPASS ARGS ---
            # Shared UA with peott.py extractor
            ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            ref = "https://cloud.unblockedgames.world/"
            
            vlc_args = [
                '--quiet',
                '--no-video-title-show',
                '--network-caching=5000',
                '--no-check-ssl',
                f'--user-agent={ua}',
                f'--http-referrer={ref}',
                '--http-reconnect',
                '--http-continuous'
            ]
            
            self.instance = vlc.Instance(*vlc_args)
            if not self.instance: self.instance = vlc.Instance('--quiet')
            
            self.player = self.instance.media_player_new()
            if sys.platform == "win32": self.player.set_hwnd(wid)
            
            # Smart URL Handling: Try unquoted brackets [] if the worker expects them raw
            final_url = self.url
            if "%5B" in final_url or "%20" in final_url:
                # Many workers expect raw [] and spaces instead of percent-encoded for routing
                final_url = urllib.parse.unquote(self.url)
                print(f"[DEBUG] Attempting unquoted raw path bypass...")

            print(f"[DEBUG] Synchronized Identity Stream: {final_url[:130]}...")
            media = self.instance.media_new(final_url)
            self.player.set_media(media)
            self.player.play()
            
            self.ui_timer.start(); self.hide_timer.start()
        except Exception as e:
            print(f"[ERROR] Playback Startup: {e}")

    def eventFilter(self, obj, event):
        if event.type() in [QEvent.MouseMove, QEvent.MouseButtonPress]: self.show_controls()
        if event.type() == QEvent.KeyPress:
            if not event.isAutoRepeat(): self.keyPressEvent(event)
            return True
        return super().eventFilter(obj, event)

    def resizeEvent(self, event):
        w, h = self.width(), self.height()
        cw = w - 40 # Increased width to fill screen with small margins
        self.controls_overlay.setGeometry((w - cw)//2, h - 135, cw, 115)
        super().resizeEvent(event)

    def keyPressEvent(self, event):
        k = event.key()
        if k == Qt.Key_Space: self.toggle_play()
        elif k == Qt.Key_Left: self.seek_relative(-10)
        elif k == Qt.Key_Right: self.seek_relative(10)
        elif k in [Qt.Key_F, Qt.Key_F11]: self.toggle_fullscreen()
        elif k == Qt.Key_C: self.cycle_aspect()
        elif k == Qt.Key_P: self.toggle_pip()
        elif k == Qt.Key_Escape and self.isFullScreen(): self.toggle_fullscreen()

    def toggle_play(self):
        if self.player and self.player.is_playing(): self.player.pause(); self.play_btn.setText("▶ Play")
        elif self.player: self.player.play(); self.play_btn.setText("⏸ Pause")

    def seek_relative(self, seconds):
        if self.player:
            t = self.player.get_time()
            if t >= 0: self.player.set_time(t + (seconds * 1000))

    def on_slider_press(self): self.is_dragging = True
    def on_slider_release(self):
        if self.player: self.player.set_position(self.slider.value() / 1000.0); self.is_dragging = False

    def set_volume(self, val):
        if self.player: self.player.audio_set_volume(val)

    def cycle_audio(self):
        if not self.player: return
        ts = self.player.audio_get_track_description()
        if not ts or len(ts) <= 1:
            self.audio_btn.setText("🌐 1 Track")
            return
        c, idx = self.player.audio_get_track(), 0
        for i, (tid, name) in enumerate(ts):
            if tid == c: idx = (i+1)%len(ts); break
        self.player.audio_set_track(ts[idx][0])
        name_str = ts[idx][1].decode('utf-8', 'ignore') if isinstance(ts[idx][1], bytes) else str(ts[idx][1])
        self.audio_btn.setText(f"🌐 {name_str[:8]}")

    def cycle_subs(self):
        if not self.player: return
        ts = self.player.video_get_spu_description()
        if not ts or len(ts) <= 1:
            self.sub_btn.setText("💬 No Subs")
            return
        c, idx = self.player.video_get_spu(), 0
        for i, (tid, name) in enumerate(ts):
            if tid == c: idx = (i+1)%len(ts); break
        self.player.video_set_spu(ts[idx][0])
        name_str = ts[idx][1].decode('utf-8', 'ignore') if isinstance(ts[idx][1], bytes) else str(ts[idx][1])
        self.sub_btn.setText(f"💬 {name_str[:8]}")

    def cycle_aspect(self):
        if not self.player: return
        self._aspect_idx = (self._aspect_idx + 1) % len(self._aspect_modes)
        m = self._aspect_modes[self._aspect_idx]
        self.player.video_set_aspect_ratio(None); self.player.video_set_crop_geometry(None)
        if m in ["16:9", "4:3"]: self.player.video_set_aspect_ratio(m)
        elif m == "Fill":
            w, h = self.video_frame.width(), self.video_frame.height()
            if h > 0: self.player.video_set_crop_geometry(f"{w}:{h}")
        self.aspect_btn.setText(f"📺 {m}")

    def toggle_pip(self):
        if not self._is_pip:
            self._old_geom = self.geometry()
            s = QApplication.desktop().screenGeometry().size(); w, h = 320, 180
            self.setWindowFlags(self.windowFlags() | Qt.WindowStaysOnTopHint | Qt.FramelessWindowHint)
            self.setGeometry(s.width() - w - 20, s.height() - h - 60, w, h); self.show(); self._is_pip = True
        else:
            self.setWindowFlags(self.windowFlags() & ~Qt.WindowStaysOnTopHint & ~Qt.FramelessWindowHint)
            if self._old_geom: self.setGeometry(self._old_geom)
            self.show(); self._is_pip = False

    def toggle_fullscreen(self):
        if self.isFullScreen(): self.showNormal()
        else: self.showFullScreen()

    def show_controls(self):
        self.hide_timer.start()
        if not self.controls_visible:
            self.controls_visible = True; self.controls_overlay.raise_()
            if self.fade_anim.state() == QPropertyAnimation.Running: self.fade_anim.stop()
            self.fade_anim.setStartValue(self.opacity_effect.opacity()); self.fade_anim.setEndValue(1.0); self.fade_anim.start(); self.controls_overlay.show()

    def hide_controls(self):
        if self.controls_visible:
            self.controls_visible = False; self.fade_anim.setStartValue(self.opacity_effect.opacity()); self.fade_anim.setEndValue(0.0)
            try: self.fade_anim.finished.disconnect()
            except: pass
            self.fade_anim.finished.connect(lambda: self.controls_overlay.hide() if not self.controls_visible else None)
            self.fade_anim.start()

    def update_ui(self):
        if not self.player: return
        try:
            state = self.player.get_state()
            if state in [vlc.State.Ended, vlc.State.Error]:
                if time.time() - self.creation_time < 12:
                    self.time_label.setText("Link fail.")
                    print(f"[RETRY] Server blocked player ID: {self.creation_time}. Try a different provider.")
                else: self.close()
                return

            if not self.is_dragging:
                p = self.player.get_position()
                if p >= 0: self.slider.setValue(int(p * 1000))
            
            ms, ln = self.player.get_time(), self.player.get_length()
            if ms >= 0 and ln > 0: self.time_label.setText(f"{ms//60000:02d}:{(ms//1000)%60:02d} / {ln//60000:02d}:{(ln//1000)%60:02d}")
        except: pass

    def closeEvent(self, event):
        try: self.player.stop(); self.instance.release()
        except: pass
        super().closeEvent(event)

def main():
    if len(sys.argv) < 2: return
    app = QApplication(sys.argv)
    url, title = sys.argv[1], " ".join(sys.argv[2:])
    player = VLCPlayer(url, title); player.show()
    QTimer.singleShot(1500, player.start_playback)
    sys.exit(app.exec_())

if __name__ == "__main__": main()
