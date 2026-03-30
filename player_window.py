import os
import sys
import time
import ctypes
import urllib.parse

# --------------------------------------------------------------------------- #
#  VLC DLL pre-loader                                                          #
# --------------------------------------------------------------------------- #
def _pre_load_vlc():
    try:
        import platform
        bitness = "64" if "64" in platform.architecture()[0] else "32"
        paths = [
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "vlc_bundle"),
            r"C:\Program Files\VideoLAN\VLC",
            r"C:\Program Files (x86)\VideoLAN\VLC",
        ]
        for d in paths:
            dll = os.path.join(d, "libvlc.dll")
            if os.path.exists(dll):
                os.environ['PYTHON_VLC_LIB_PATH'] = dll
                os.environ['VLC_PLUGIN_PATH']      = os.path.join(d, "plugins")
                if hasattr(os, 'add_dll_directory'):
                    os.add_dll_directory(d)
                try:
                    ctypes.CDLL(os.path.join(d, "libvlccore.dll"))
                    ctypes.CDLL(dll)
                    print(f"[VLC] Loaded from {d}")
                    return True
                except Exception as e:
                    print(f"[VLC] DLL load error: {e}")
        print(f"[VLC] libvlc.dll not found ({bitness}-bit)")
    except Exception as e:
        print(f"[VLC] Pre-load fatal: {e}")
    return False

_pre_load_vlc()

# --------------------------------------------------------------------------- #
#  Qt / VLC imports                                                            #
# --------------------------------------------------------------------------- #
try:
    import vlc
    from PyQt5.QtWidgets import (
        QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
        QPushButton, QSlider, QLabel, QFrame, QGraphicsOpacityEffect, qApp,
    )
    from PyQt5.QtCore  import Qt, QTimer, QEvent, QPoint
    from PyQt5.QtGui   import QIcon, QCursor
except Exception as e:
    print(f"[FATAL] Import error: {e}"); time.sleep(5); sys.exit(1)

# --------------------------------------------------------------------------- #
#  Helpers                                                                     #
# --------------------------------------------------------------------------- #
def _fmt(ms):
    if ms < 0: return "--:--"
    s = ms // 1000
    if s >= 3600:
        return f"{s//3600:02d}:{(s%3600)//60:02d}:{s%60:02d}"
    return f"{s//60:02d}:{s%60:02d}"

CTRL_CSS = """
QWidget#ctrl {
    background: qlineargradient(x1:0,y1:0,x2:0,y2:1,
        stop:0 rgba(8,8,18,210), stop:1 rgba(0,0,0,245));
    border-top: 1px solid rgba(255,255,255,0.07);
}
QPushButton {
    background: rgba(255,255,255,0.11);
    border: 1px solid rgba(255,255,255,0.18);
    border-radius: 6px;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    padding: 5px 10px;
    min-width: 52px;
}
QPushButton:hover  { background: rgba(255,255,255,0.24); border-color: rgba(255,255,255,0.38); }
QPushButton:pressed{ background: rgba(255,255,255,0.06); }
QPushButton#playBtn{ background: rgba(41,121,255,0.85);  border-color: #2979ff; min-width: 72px; }
QPushButton#playBtn:hover{ background: rgba(41,121,255,1.0); }
QLabel { background: transparent; color: rgba(255,255,255,0.85); font-size: 11px; }
QSlider::groove:horizontal { background: rgba(255,255,255,0.20); height: 4px; border-radius: 2px; }
QSlider::sub-page:horizontal { background: #2979ff; border-radius: 2px; }
QSlider::handle:horizontal   { background: #fff; width: 14px; height: 14px; margin: -5px 0; border-radius: 7px; }
"""

# --------------------------------------------------------------------------- #
#  Player window                                                               #
# --------------------------------------------------------------------------- #
class VLCPlayer(QMainWindow):

    CTRL_H   = 114    # controls bar height (px)
    FADE_MS  = 16     # fade timer interval (~60 fps)
    HIDE_MS  = 3500   # idle-before-hide delay

    def __init__(self, url, title="Video Player"):
        super().__init__()
        self.url           = url
        self.instance      = None
        self.player        = None
        self.creation_time = time.time()
        self.is_dragging   = False
        self._aspect_modes = ["Original", "16:9", "4:3", "Fill"]
        self._aspect_idx   = 0
        self._is_pip       = False
        self._old_geom     = None

        # ---- fade state ----
        self._fade_cur    = 1.0   # current opacity (0–1)
        self._fade_target = 1.0
        self._ctrl_shown  = True

        # ---- mouse poll ----
        self._last_mouse = QPoint(-1, -1)

        self._build_ui(title)

    # ---------------------------------------------------------------------- #
    def _build_ui(self, title):
        self.setWindowTitle(title)
        self.resize(1100, 700)
        self.setMinimumSize(640, 400)
        self.setStyleSheet("QMainWindow { background: #000; }")

        for p in [os.path.join(getattr(sys, '_MEIPASS', ''), 'icon.ico'), 'icon.ico']:
            if os.path.exists(p): self.setWindowIcon(QIcon(p)); break

        central = QWidget()
        self.setCentralWidget(central)
        central.setStyleSheet("background:#000;")

        root = QVBoxLayout(central)
        root.setContentsMargins(0, 0, 0, 0)
        root.setSpacing(0)

        # --- Video frame (native HWND for VLC) ---
        self.video_frame = QFrame()
        self.video_frame.setAttribute(Qt.WA_NativeWindow)
        self.video_frame.setStyleSheet("background:#000;")
        root.addWidget(self.video_frame, 1)   # stretch = 1 → fills space

        # --- Controls bar (normal Qt widget, NOT native → opacity effect works) ---
        self.ctrl_bar = QWidget()
        self.ctrl_bar.setObjectName("ctrl")
        self.ctrl_bar.setFixedHeight(self.CTRL_H)
        self.ctrl_bar.setStyleSheet(CTRL_CSS)
        root.addWidget(self.ctrl_bar)

        # Opacity effect (works because ctrl_bar is NOT WA_NativeWindow)
        self.opacity_fx = QGraphicsOpacityEffect(self.ctrl_bar)
        self.ctrl_bar.setGraphicsEffect(self.opacity_fx)
        self.opacity_fx.setOpacity(1.0)

        self._build_controls()

        # ---- Timers ----
        self.ui_timer = QTimer(self)
        self.ui_timer.setInterval(250)
        self.ui_timer.timeout.connect(self._update_ui)

        # Auto-hide countdown
        self.hide_timer = QTimer(self)
        self.hide_timer.setSingleShot(True)
        self.hide_timer.setInterval(self.HIDE_MS)
        self.hide_timer.timeout.connect(self._start_fade_out)

        # Smooth fade ticker
        self.fade_timer = QTimer(self)
        self.fade_timer.setInterval(self.FADE_MS)
        self.fade_timer.timeout.connect(self._fade_step)

        # Mouse position poll — catches moves over native VLC HWND which
        # swallows OS events before Qt ever sees them.
        self.mouse_poll = QTimer(self)
        self.mouse_poll.setInterval(80)
        self.mouse_poll.timeout.connect(self._poll_mouse)
        self.mouse_poll.start()

        # Also keep Qt event filter for non-video areas
        qApp.installEventFilter(self)

        self.hide_timer.start()

    def _build_controls(self):
        cl = QVBoxLayout(self.ctrl_bar)
        cl.setContentsMargins(22, 12, 22, 14)
        cl.setSpacing(8)

        # Seek slider
        self.slider = QSlider(Qt.Horizontal)
        self.slider.setRange(0, 1000)
        self.slider.sliderPressed.connect(self._on_press)
        self.slider.sliderReleased.connect(self._on_release)
        cl.addWidget(self.slider)

        # Button row
        row = QHBoxLayout(); row.setSpacing(5)

        self.time_lbl = QLabel("--:-- / --:--")
        self.time_lbl.setFixedWidth(145)
        row.addWidget(self.time_lbl)
        row.addStretch(1)

        self.play_btn = QPushButton("⏸ Pause")
        self.play_btn.setObjectName("playBtn")
        self.play_btn.clicked.connect(self.toggle_play)
        row.addWidget(self.play_btn)

        for lbl, fn in [("⏪ 10s", lambda: self.seek_rel(-10)),
                         ("10s ⏩", lambda: self.seek_rel(10))]:
            b = QPushButton(lbl); b.clicked.connect(fn); row.addWidget(b)

        s = QPushButton("⏹ Stop"); s.clicked.connect(self.close); row.addWidget(s)
        row.addSpacing(8)

        self.audio_btn = QPushButton("🌐 Audio")
        self.audio_btn.clicked.connect(self.cycle_audio); row.addWidget(self.audio_btn)
        self.sub_btn = QPushButton("💬 Sub")
        self.sub_btn.clicked.connect(self.cycle_subs); row.addWidget(self.sub_btn)
        row.addSpacing(8)

        row.addWidget(QLabel("🔊"))
        self.vol = QSlider(Qt.Horizontal)
        self.vol.setRange(0, 100); self.vol.setValue(80); self.vol.setFixedWidth(80)
        self.vol.valueChanged.connect(
            lambda v: self.player.audio_set_volume(v) if self.player else None)
        row.addWidget(self.vol)
        row.addSpacing(8)

        self.aspect_btn = QPushButton("📺 Orig")
        self.aspect_btn.clicked.connect(self.cycle_aspect); row.addWidget(self.aspect_btn)
        pip_b = QPushButton("🖼 PiP"); pip_b.clicked.connect(self.toggle_pip); row.addWidget(pip_b)
        self.fs_btn = QPushButton("⛶ Full")
        self.fs_btn.clicked.connect(self.toggle_fullscreen); row.addWidget(self.fs_btn)
        row.addStretch(1)
        cl.addLayout(row)

    # ---------------------------------------------------------------------- #
    #  Mouse polling — reliable even when cursor is over VLC's native HWND    #
    # ---------------------------------------------------------------------- #
    def _poll_mouse(self):
        pos = QCursor.pos()
        if pos != self._last_mouse:
            self._last_mouse = pos
            # Only react if cursor is inside our window
            if self.rect().contains(self.mapFromGlobal(pos)):
                self._show_ctrl()

    # ---------------------------------------------------------------------- #
    #  Smooth fade                                                             #
    # ---------------------------------------------------------------------- #
    def _show_ctrl(self):
        self._fade_target = 1.0
        if not self._ctrl_shown:
            self._ctrl_shown = True
            self.ctrl_bar.show()
        self.fade_timer.start()
        self.hide_timer.start()   # restart idle countdown

    def _start_fade_out(self):
        self._fade_target = 0.0
        self.fade_timer.start()

    def _fade_step(self):
        diff = self._fade_target - self._fade_cur
        if abs(diff) < 0.03:
            self._fade_cur = self._fade_target
            self.opacity_fx.setOpacity(self._fade_cur)
            self.fade_timer.stop()
            if self._fade_cur == 0.0:
                self._ctrl_shown = False
                self.ctrl_bar.hide()   # remove from layout → video fills space
        else:
            self._fade_cur += diff * 0.20   # ease factor (tweak for speed)
            self.opacity_fx.setOpacity(max(0.0, min(1.0, self._fade_cur)))

    # ---------------------------------------------------------------------- #
    #  Qt event filter (keyboard + non-video mouse)                           #
    # ---------------------------------------------------------------------- #
    def eventFilter(self, obj, event):
        t = event.type()
        if t in (QEvent.MouseMove, QEvent.MouseButtonPress):
            self._show_ctrl()
        if t == QEvent.KeyPress and not event.isAutoRepeat():
            self.keyPressEvent(event)
            return True
        return super().eventFilter(obj, event)

    def keyPressEvent(self, event):
        k = event.key()
        if   k == Qt.Key_Space:                         self.toggle_play()
        elif k == Qt.Key_Left:                          self.seek_rel(-10)
        elif k == Qt.Key_Right:                         self.seek_rel(10)
        elif k in (Qt.Key_F, Qt.Key_F11):              self.toggle_fullscreen()
        elif k == Qt.Key_C:                             self.cycle_aspect()
        elif k == Qt.Key_P:                             self.toggle_pip()
        elif k == Qt.Key_Escape and self.isFullScreen(): self.toggle_fullscreen()

    # ---------------------------------------------------------------------- #
    #  Playback                                                                #
    # ---------------------------------------------------------------------- #
    def start_playback(self):
        try:
            wid = int(self.video_frame.winId())
            ua  = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) "
                   "Chrome/122.0.0.0 Safari/537.36")
            ref = "https://cloud.unblockedgames.world/"

            vlc_args = [
                '--quiet', '--no-video-title-show',
                '--network-caching=3000', '--live-caching=3000',
                '--no-check-ssl',
                f'--user-agent={ua}',
                f'--http-referrer={ref}',
                '--avcodec-hw=any',     # GPU hardware decode
                '--clock-jitter=0',
                '--clock-synchro=0',
                '--drop-late-frames',
                '--skip-frames',
            ]
            self.instance = vlc.Instance(*vlc_args) or vlc.Instance('--quiet')
            self.player   = self.instance.media_player_new()

            if sys.platform == "win32":
                self.player.set_hwnd(wid)

            final_url = self.url
            if "%5B" in final_url or "%20" in final_url:
                final_url = urllib.parse.unquote(self.url)

            print(f"[PLAY] {final_url[:110]}...")
            media = self.instance.media_new(final_url)
            self.player.set_media(media)
            self.player.play()
            self.player.audio_set_volume(self.vol.value())

            self.ui_timer.start()
        except Exception as e:
            print(f"[ERROR] start_playback: {e}")

    # ---------------------------------------------------------------------- #
    #  UI update                                                               #
    # ---------------------------------------------------------------------- #
    def _update_ui(self):
        if not self.player: return
        try:
            state = self.player.get_state()
            if state in (vlc.State.Ended, vlc.State.Error):
                if time.time() - self.creation_time < 12:
                    self.time_lbl.setText("⚠ Stream failed — try another provider")
                    self._show_ctrl()
                else:
                    self.close()
                return
            if not self.is_dragging:
                p = self.player.get_position()
                if p >= 0: self.slider.setValue(int(p * 1000))
            ms = self.player.get_time()
            ln = self.player.get_length()
            if ms >= 0:
                self.time_lbl.setText(f"{_fmt(ms)} / {_fmt(ln)}")
        except: pass

    # ---------------------------------------------------------------------- #
    #  Controls                                                                #
    # ---------------------------------------------------------------------- #
    def toggle_play(self):
        if not self.player: return
        if self.player.is_playing():
            self.player.pause(); self.play_btn.setText("▶ Play")
        else:
            self.player.play();  self.play_btn.setText("⏸ Pause")

    def seek_rel(self, secs):
        if self.player:
            t = self.player.get_time()
            if t >= 0: self.player.set_time(max(0, t + secs * 1000))

    def _on_press(self): self.is_dragging = True
    def _on_release(self):
        if self.player: self.player.set_position(self.slider.value() / 1000.0)
        self.is_dragging = False

    def cycle_audio(self):
        if not self.player: return
        ts = self.player.audio_get_track_description()
        if not ts or len(ts) <= 1: self.audio_btn.setText("🌐 1 Track"); return
        c = self.player.audio_get_track(); idx = 0
        for i, (tid, _) in enumerate(ts):
            if tid == c: idx = (i + 1) % len(ts); break
        self.player.audio_set_track(ts[idx][0])
        n = ts[idx][1].decode('utf-8', 'ignore') if isinstance(ts[idx][1], bytes) else str(ts[idx][1])
        self.audio_btn.setText(f"🌐 {n[:12]}")

    def cycle_subs(self):
        if not self.player: return
        ts = self.player.video_get_spu_description()
        if not ts or len(ts) <= 1: self.sub_btn.setText("💬 Off"); return
        c = self.player.video_get_spu(); idx = 0
        for i, (tid, _) in enumerate(ts):
            if tid == c: idx = (i + 1) % len(ts); break
        self.player.video_set_spu(ts[idx][0])
        n = ts[idx][1].decode('utf-8', 'ignore') if isinstance(ts[idx][1], bytes) else str(ts[idx][1])
        self.sub_btn.setText(f"💬 {n[:12]}")

    def cycle_aspect(self):
        if not self.player: return
        self._aspect_idx = (self._aspect_idx + 1) % len(self._aspect_modes)
        m = self._aspect_modes[self._aspect_idx]
        self.player.video_set_aspect_ratio(None)
        self.player.video_set_crop_geometry(None)
        if m in ("16:9", "4:3"): self.player.video_set_aspect_ratio(m)
        elif m == "Fill":
            w, h = self.video_frame.width(), self.video_frame.height()
            if h > 0: self.player.video_set_crop_geometry(f"{w}:{h}")
        self.aspect_btn.setText(f"📺 {m}")

    def toggle_pip(self):
        if not self._is_pip:
            self._old_geom = self.geometry()
            scr = QApplication.desktop().screenGeometry()
            w, h = 340, 200
            self.setWindowFlags(self.windowFlags() | Qt.WindowStaysOnTopHint | Qt.FramelessWindowHint)
            self.setGeometry(scr.width() - w - 20, scr.height() - h - 60, w, h)
            self.show(); self._is_pip = True
        else:
            self.setWindowFlags(self.windowFlags() & ~Qt.WindowStaysOnTopHint & ~Qt.FramelessWindowHint)
            if self._old_geom: self.setGeometry(self._old_geom)
            self.show(); self._is_pip = False

    def toggle_fullscreen(self):
        if self.isFullScreen():
            self.showNormal();     self.fs_btn.setText("⛶ Full")
        else:
            self.showFullScreen(); self.fs_btn.setText("⊠ Exit Full")

    # ---------------------------------------------------------------------- #
    #  Cleanup                                                                 #
    # ---------------------------------------------------------------------- #
    def closeEvent(self, event):
        for t in (self.ui_timer, self.hide_timer, self.fade_timer, self.mouse_poll):
            try: t.stop()
            except: pass
        try:
            if self.player: self.player.stop()
        except: pass
        try:
            if self.instance: self.instance.release()
        except: pass
        super().closeEvent(event)


# --------------------------------------------------------------------------- #
#  Entry points                                                                #
# --------------------------------------------------------------------------- #
def play_video(url, title="Video Player"):
    app = QApplication.instance() or QApplication(sys.argv)
    w = VLCPlayer(url, title); w.show()
    QTimer.singleShot(1200, w.start_playback)
    sys.exit(app.exec_())


def main():
    if len(sys.argv) < 2:
        print("[ERROR] Usage: player_window.py <url> [title...]"); return
    app   = QApplication(sys.argv)
    url   = sys.argv[1]
    title = " ".join(sys.argv[2:]) if len(sys.argv) > 2 else "Video Player"
    w = VLCPlayer(url, title); w.show()
    QTimer.singleShot(1200, w.start_playback)
    sys.exit(app.exec_())


if __name__ == "__main__":
    main()
