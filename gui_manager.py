import sys
import os
import socket
import subprocess
import threading
import webbrowser
import time
from datetime import datetime

try:
    # pyrefly: ignore [missing-import]
    from PySide6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, 
                                   QHBoxLayout, QLabel, QPushButton, QLineEdit, 
                                   QTextEdit, QScrollArea, QGridLayout, QFrame,
                                   QListWidget, QListWidgetItem, QSizePolicy, QGraphicsDropShadowEffect,
                                   QMessageBox)
    # pyrefly: ignore [missing-import]
    from PySide6.QtCore import Qt, QThread, Signal, QPoint, QSize, QTimer
    # pyrefly: ignore [missing-import]
    from PySide6.QtGui import QIcon, QFont, QColor, QCursor
except ImportError:
    print("PySide6 is not installed. Please install it using 'pip install PySide6'.")
    sys.exit(1)

try:
    import psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False

# QSS Styles
DARK_THEME = """
QWidget {
    background-color: #0d1117;
    color: #c9d1d9;
    font-family: 'Inter', 'SF Pro Display', 'Segoe UI', sans-serif;
}
QScrollArea {
    border: none;
    background-color: transparent;
}
QScrollArea > QWidget > QWidget {
    background-color: transparent;
}
/* Cards */
.Card {
    background-color: #161b22;
    border: 1px solid #30363d;
    border-radius: 12px;
}
.HeaderCard {
    background-color: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #1f2937, stop:1 #111827);
    border-bottom: 1px solid #30363d;
}
QLabel {
    background-color: transparent;
}
.Title {
    font-size: 18px;
    font-weight: bold;
    color: #ffffff;
}
.Subtitle {
    font-size: 13px;
    color: #8b949e;
}
.ValueText {
    font-size: 24px;
    font-weight: bold;
    color: #ffffff;
}
/* Buttons */
QPushButton {
    background-color: #21262d;
    border: 1px solid #30363d;
    border-radius: 6px;
    color: #c9d1d9;
    padding: 6px 12px;
    font-weight: 500;
}
QPushButton:hover {
    background-color: #30363d;
    border: 1px solid #8b949e;
}
QPushButton:pressed {
    background-color: #282e33;
}
QPushButton:disabled {
    background-color: #161b22;
    color: #484f58;
    border: 1px solid #21262d;
}
/* Specific Buttons */
.PrimaryButton {
    background-color: #238636;
    color: #ffffff;
    border: 1px solid #2ea043;
}
.PrimaryButton:hover {
    background-color: #2ea043;
    border: 1px solid #3fb950;
}
.DangerButton {
    background-color: #da3633;
    color: #ffffff;
    border: 1px solid #f85149;
}
.DangerButton:hover {
    background-color: #f85149;
    border: 1px solid #ff7b72;
}
.AccentButton {
    background-color: #1f6feb;
    color: #ffffff;
    border: 1px solid #388bfd;
}
.AccentButton:hover {
    background-color: #388bfd;
    border: 1px solid #58a6ff;
}
.ActionButton {
    background-color: #161b22;
    border: 1px solid #30363d;
    border-radius: 12px;
    padding: 15px;
    text-align: left;
    font-size: 14px;
    font-weight: bold;
}
.ActionButton:hover {
    background-color: #1f242c;
    border: 1px solid #8b949e;
}
/* Inputs */
QLineEdit {
    background-color: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 8px;
    color: #c9d1d9;
}
QLineEdit:focus {
    border: 1px solid #58a6ff;
}
/* Text Edit (Terminal) */
QTextEdit {
    background-color: #010409;
    border: 1px solid #30363d;
    border-radius: 8px;
    color: #c9d1d9;
    font-family: 'Consolas', 'Courier New', monospace;
    padding: 10px;
}
/* ScrollBar */
QScrollBar:vertical {
    border: none;
    background: #0d1117;
    width: 10px;
    margin: 0px 0px 0px 0px;
}
QScrollBar::handle:vertical {
    background: #30363d;
    min-height: 20px;
    border-radius: 5px;
}
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {
    height: 0px;
}
/* List Widget */
QListWidget {
    background-color: transparent;
    border: none;
}
QListWidget::item {
    background-color: #161b22;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 10px;
    margin-bottom: 5px;
}
/* Window Controls */
.WindowControlButton {
    background-color: transparent;
    border: none;
    border-radius: 0px;
}
.WindowControlButton:hover {
    background-color: #30363d;
}
.CloseButton:hover {
    background-color: #da3633;
}
"""

LIGHT_THEME = """
QWidget {
    background-color: #f6f8fa;
    color: #24292f;
    font-family: 'Inter', 'SF Pro Display', 'Segoe UI', sans-serif;
}
QScrollArea {
    border: none;
    background-color: transparent;
}
QScrollArea > QWidget > QWidget {
    background-color: transparent;
}
/* Cards */
.Card {
    background-color: #ffffff;
    border: 1px solid #d0d7de;
    border-radius: 12px;
}
.HeaderCard {
    background-color: qlineargradient(x1:0, y1:0, x2:1, y2:0, stop:0 #ffffff, stop:1 #f6f8fa);
    border-bottom: 1px solid #d0d7de;
}
QLabel {
    background-color: transparent;
}
.Title {
    font-size: 18px;
    font-weight: bold;
    color: #0969da;
}
.Subtitle {
    font-size: 13px;
    color: #57606a;
}
.ValueText {
    font-size: 24px;
    font-weight: bold;
    color: #24292f;
}
/* Buttons */
QPushButton {
    background-color: #f3f4f6;
    border: 1px solid #d0d7de;
    border-radius: 6px;
    color: #24292f;
    padding: 6px 12px;
    font-weight: 500;
}
QPushButton:hover {
    background-color: #ebecf0;
    border: 1px solid #8c959f;
}
QPushButton:pressed {
    background-color: #e5e7eb;
}
QPushButton:disabled {
    background-color: #f6f8fa;
    color: #8c959f;
    border: 1px solid #d0d7de;
}
/* Specific Buttons */
.PrimaryButton {
    background-color: #2da44e;
    color: #ffffff;
    border: 1px solid #2da44e;
}
.PrimaryButton:hover {
    background-color: #2c974b;
    border: 1px solid #2c974b;
}
.DangerButton {
    background-color: #cf222e;
    color: #ffffff;
    border: 1px solid #cf222e;
}
.DangerButton:hover {
    background-color: #a40e26;
    border: 1px solid #a40e26;
}
.AccentButton {
    background-color: #0969da;
    color: #ffffff;
    border: 1px solid #0969da;
}
.AccentButton:hover {
    background-color: #0550ae;
    border: 1px solid #0550ae;
}
.ActionButton {
    background-color: #ffffff;
    border: 1px solid #d0d7de;
    border-radius: 12px;
    padding: 15px;
    text-align: left;
    font-size: 14px;
    font-weight: bold;
}
.ActionButton:hover {
    background-color: #f6f8fa;
    border: 1px solid #0969da;
}
/* Inputs */
QLineEdit {
    background-color: #ffffff;
    border: 1px solid #d0d7de;
    border-radius: 6px;
    padding: 8px;
    color: #24292f;
}
QLineEdit:focus {
    border: 1px solid #0969da;
}
/* Text Edit (Terminal) */
QTextEdit {
    background-color: #1e1e1e;
    border: 1px solid #d0d7de;
    border-radius: 8px;
    color: #d4d4d4;
    font-family: 'Consolas', 'Courier New', monospace;
    padding: 10px;
}
/* ScrollBar */
QScrollBar:vertical {
    border: none;
    background: #f6f8fa;
    width: 10px;
    margin: 0px 0px 0px 0px;
}
QScrollBar::handle:vertical {
    background: #d0d7de;
    min-height: 20px;
    border-radius: 5px;
}
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {
    height: 0px;
}
/* List Widget */
QListWidget {
    background-color: transparent;
    border: none;
}
QListWidget::item {
    background-color: #ffffff;
    border: 1px solid #d0d7de;
    border-radius: 6px;
    padding: 10px;
    margin-bottom: 5px;
}
/* Window Controls */
.WindowControlButton {
    background-color: transparent;
    border: none;
    border-radius: 0px;
}
.WindowControlButton:hover {
    background-color: #d0d7de;
}
.CloseButton:hover {
    background-color: #cf222e;
    color: white;
}
"""

class SubprocessThread(QThread):
    new_output = Signal(str)
    process_finished = Signal()

    def __init__(self, command, parent=None):
        super().__init__(parent)
        self.command = command
        self.process = None
        self._is_running = False

    def run(self):
        self._is_running = True
        try:
            self.process = subprocess.Popen(
                self.command,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0
            )
            for line in iter(self.process.stdout.readline, ''):
                if not self._is_running:
                    break
                self.new_output.emit(line)
            
            self.process.stdout.close()
            self.process.wait()
        except Exception as e:
            self.new_output.emit(f"[ERROR] Failed to execute {self.command}: {e}\n")
        finally:
            self._is_running = False
            self.process_finished.emit()

    def stop(self):
        self._is_running = False
        if self.process:
            try:
                if os.name == 'nt':
                    subprocess.call(['taskkill', '/F', '/T', '/PID', str(self.process.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                else:
                    self.process.terminate()
            except Exception as e:
                pass


class TitleBar(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.parent = parent
        self.layout = QHBoxLayout(self)
        self.layout.setContentsMargins(10, 0, 0, 0)
        self.layout.setSpacing(5)
        self.setFixedHeight(40)
        
        self.setProperty("class", "HeaderCard")
        
        # Logo placeholder
        self.logo = QLabel("🔵")
        self.logo.setFont(QFont("Segoe UI Emoji", 14))
        self.layout.addWidget(self.logo)
        
        # Title
        self.title_label = QLabel("OrbiPlay Vega Provider Server")
        self.title_label.setProperty("class", "Title")
        self.layout.addWidget(self.title_label)
        
        # Version Badge
        self.version_label = QLabel("v1.0.0")
        self.version_label.setProperty("class", "Subtitle")
        self.version_label.setStyleSheet("background-color: #1f6feb; color: white; border-radius: 10px; padding: 2px 8px;")
        self.layout.addWidget(self.version_label)
        
        self.layout.addStretch()
        
        # Theme Toggle
        self.btn_theme = QPushButton("☀️")
        self.btn_theme.setCursor(QCursor(Qt.PointingHandCursor))
        self.btn_theme.setToolTip("Toggle Theme")
        self.btn_theme.setFixedSize(30, 30)
        self.btn_theme.clicked.connect(self.parent.toggle_theme)
        self.layout.addWidget(self.btn_theme)
        
        # Settings & Info
        self.btn_settings = QPushButton("⚙️")
        self.btn_settings.setFixedSize(30, 30)
        self.btn_settings.setCursor(QCursor(Qt.PointingHandCursor))
        self.btn_settings.clicked.connect(lambda: QMessageBox.information(self, "Settings", "Settings feature coming soon."))
        self.layout.addWidget(self.btn_settings)
        
        self.btn_info = QPushButton("ℹ️")
        self.btn_info.setFixedSize(30, 30)
        self.btn_info.setCursor(QCursor(Qt.PointingHandCursor))
        self.btn_info.clicked.connect(self.parent.show_help)
        self.layout.addWidget(self.btn_info)
        
        # Window controls
        self.btn_min = QPushButton("—")
        self.btn_min.setProperty("class", "WindowControlButton")
        self.btn_min.setFixedSize(40, 40)
        self.btn_min.clicked.connect(self.parent.showMinimized)
        self.layout.addWidget(self.btn_min)
        
        self.btn_max = QPushButton("☐")
        self.btn_max.setProperty("class", "WindowControlButton")
        self.btn_max.setFixedSize(40, 40)
        self.btn_max.clicked.connect(self.toggle_max_restore)
        self.layout.addWidget(self.btn_max)
        
        self.btn_close = QPushButton("✕")
        self.btn_close.setProperty("class", "WindowControlButton CloseButton")
        self.btn_close.setFixedSize(40, 40)
        self.btn_close.clicked.connect(self.parent.close)
        self.layout.addWidget(self.btn_close)
        
        # For dragging the frameless window
        self.start_pos = None

    def toggle_max_restore(self):
        if self.parent.isMaximized():
            self.parent.showNormal()
        else:
            self.parent.showMaximized()

    def mousePressEvent(self, event):
        if event.button() == Qt.LeftButton:
            self.start_pos = event.globalPosition().toPoint()

    def mouseMoveEvent(self, event):
        if self.start_pos is not None:
            delta = event.globalPosition().toPoint() - self.start_pos
            self.parent.move(self.parent.pos() + delta)
            self.start_pos = event.globalPosition().toPoint()

    def mouseReleaseEvent(self, event):
        self.start_pos = None


class ServerManagerApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.Window)
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.setMinimumSize(900, 600)
        self.resize(1100, 700)
        
        self.dark_mode = True
        self.server_thread = None
        self.npm_thread = None
        self.start_time = None
        self.required_files = ["package.json", "dev-server.js", "providers"]
        
        # Central widget and main layout
        self.central_widget = QWidget()
        self.setCentralWidget(self.central_widget)
        self.main_layout = QVBoxLayout(self.central_widget)
        self.main_layout.setContentsMargins(1, 1, 1, 1) # Small margin for border
        self.main_layout.setSpacing(0)
        
        # Wrapper to apply border radius and background
        self.wrapper = QWidget()
        self.wrapper.setObjectName("AppWrapper")
        self.wrapper_layout = QVBoxLayout(self.wrapper)
        self.wrapper_layout.setContentsMargins(0, 0, 0, 0)
        self.wrapper_layout.setSpacing(0)
        self.main_layout.addWidget(self.wrapper)
        
        self.setup_ui()
        self.apply_theme()
        
        # Check files on startup
        if not self.check_required_files():
            self.log("[ERROR] Missing required files to run the server. Check package.json, dev-server.js, providers.")

        # Update timer
        self.timer = QTimer(self)
        self.timer.timeout.connect(self.update_stats)
        self.timer.start(1000)

    def setup_ui(self):
        # 1. Title Bar
        self.title_bar = TitleBar(self)
        self.wrapper_layout.addWidget(self.title_bar)
        
        # 2. Scroll Area for main content
        self.scroll_area = QScrollArea()
        self.scroll_area.setWidgetResizable(True)
        self.content_widget = QWidget()
        self.content_layout = QVBoxLayout(self.content_widget)
        self.content_layout.setContentsMargins(20, 20, 20, 20)
        self.content_layout.setSpacing(20)
        self.scroll_area.setWidget(self.content_widget)
        self.wrapper_layout.addWidget(self.scroll_area)
        
        # Top Row: Status and URL
        top_row_layout = QHBoxLayout()
        top_row_layout.setSpacing(20)
        self.content_layout.addLayout(top_row_layout)
        
        # Server Status Card
        self.status_card = QFrame()
        self.status_card.setProperty("class", "Card")
        status_layout = QVBoxLayout(self.status_card)
        
        status_header = QHBoxLayout()
        self.status_indicator = QLabel("🔴")
        status_header.addWidget(self.status_indicator)
        status_title = QLabel("Server Status")
        status_title.setProperty("class", "Subtitle")
        status_header.addWidget(status_title)
        status_header.addStretch()
        status_layout.addLayout(status_header)
        
        self.status_text = QLabel("Stopped")
        self.status_text.setProperty("class", "ValueText")
        status_layout.addWidget(self.status_text)
        
        self.uptime_text = QLabel("Uptime: 00:00:00")
        self.uptime_text.setProperty("class", "Subtitle")
        status_layout.addWidget(self.uptime_text)
        
        top_row_layout.addWidget(self.status_card, 1)
        
        # Public URL Card
        self.url_card = QFrame()
        self.url_card.setProperty("class", "Card")
        url_layout = QVBoxLayout(self.url_card)
        
        url_title = QLabel("Public URL")
        url_title.setProperty("class", "Subtitle")
        url_layout.addWidget(url_title)
        
        url_input_layout = QHBoxLayout()
        self.url_input = QLineEdit()
        self.url_input.setText("http://localhost:3001")
        self.url_input.setReadOnly(True)
        url_input_layout.addWidget(self.url_input)
        
        self.btn_copy_url = QPushButton("Copy")
        self.btn_copy_url.clicked.connect(self.copy_url)
        url_input_layout.addWidget(self.btn_copy_url)
        
        self.btn_open_portal = QPushButton("Open Portal")
        self.btn_open_portal.setProperty("class", "AccentButton")
        self.btn_open_portal.clicked.connect(self.open_portal)
        url_input_layout.addWidget(self.btn_open_portal)
        
        url_layout.addLayout(url_input_layout)
        top_row_layout.addWidget(self.url_card, 2)
        
        # Quick Actions Grid
        actions_label = QLabel("Quick Actions")
        actions_label.setProperty("class", "Title")
        self.content_layout.addWidget(actions_label)
        
        self.actions_grid = QGridLayout()
        self.actions_grid.setSpacing(15)
        self.content_layout.addLayout(self.actions_grid)
        
        # Buttons Setup
        self.btn_start = QPushButton("▶ Start Server")
        self.btn_start.setProperty("class", "ActionButton PrimaryButton")
        self.btn_start.clicked.connect(self.start_server)
        
        self.btn_stop = QPushButton("⏹ Stop Server")
        self.btn_stop.setProperty("class", "ActionButton DangerButton")
        self.btn_stop.setEnabled(False)
        self.btn_stop.clicked.connect(self.stop_server)
        
        self.btn_restart = QPushButton("🔄 Restart Server")
        self.btn_restart.setProperty("class", "ActionButton")
        self.btn_restart.clicked.connect(self.restart_server)
        
        self.btn_npm = QPushButton("📦 NPM Install")
        self.btn_npm.setProperty("class", "ActionButton")
        self.btn_npm.clicked.connect(self.npm_install)
        
        self.btn_check_files = QPushButton("📁 Check Files")
        self.btn_check_files.setProperty("class", "ActionButton")
        self.btn_check_files.clicked.connect(self.check_files_popup)
        
        self.btn_view_config = QPushButton("⚙️ View Config")
        self.btn_view_config.setProperty("class", "ActionButton")
        self.btn_view_config.clicked.connect(lambda: self.log("[INFO] Config viewer coming soon."))
        
        self.actions_grid.addWidget(self.btn_start, 0, 0)
        self.actions_grid.addWidget(self.btn_stop, 0, 1)
        self.actions_grid.addWidget(self.btn_restart, 0, 2)
        self.actions_grid.addWidget(self.btn_npm, 0, 3)
        self.actions_grid.addWidget(self.btn_check_files, 1, 0)
        self.actions_grid.addWidget(self.btn_view_config, 1, 1)
        
        # Statistics Row
        stats_label = QLabel("Statistics")
        stats_label.setProperty("class", "Title")
        self.content_layout.addWidget(stats_label)
        
        self.stats_layout = QHBoxLayout()
        self.content_layout.addLayout(self.stats_layout)
        
        self.lbl_cpu = self.create_stat_card("CPU Usage", "0%")
        self.lbl_ram = self.create_stat_card("RAM Usage", "0 MB")
        self.lbl_users = self.create_stat_card("Active Users", "0")
        self.lbl_streams = self.create_stat_card("Active Streams", "0")
        
        # Main Area (Logs + Activity)
        main_area_layout = QHBoxLayout()
        main_area_layout.setSpacing(20)
        self.content_layout.addLayout(main_area_layout)
        
        # Live Logs
        logs_card = QFrame()
        logs_card.setProperty("class", "Card")
        logs_layout = QVBoxLayout(logs_card)
        
        logs_header = QHBoxLayout()
        logs_title = QLabel("Live Logs")
        logs_title.setProperty("class", "Subtitle")
        logs_header.addWidget(logs_title)
        
        self.chk_autoscroll = QPushButton("Auto-scroll: ON")
        self.chk_autoscroll.setCheckable(True)
        self.chk_autoscroll.setChecked(True)
        self.chk_autoscroll.clicked.connect(self.toggle_autoscroll)
        logs_header.addWidget(self.chk_autoscroll)
        
        btn_clear_logs = QPushButton("Clear")
        btn_clear_logs.clicked.connect(lambda: self.log_area.clear())
        logs_header.addWidget(btn_clear_logs)
        
        logs_layout.addLayout(logs_header)
        
        self.log_area = QTextEdit()
        self.log_area.setReadOnly(True)
        self.log_area.setMinimumHeight(200)
        logs_layout.addWidget(self.log_area)
        main_area_layout.addWidget(logs_card, 2)
        
        # Activity Timeline
        activity_card = QFrame()
        activity_card.setProperty("class", "Card")
        activity_layout = QVBoxLayout(activity_card)
        
        activity_title = QLabel("Recent Events")
        activity_title.setProperty("class", "Subtitle")
        activity_layout.addWidget(activity_title)
        
        self.activity_list = QListWidget()
        activity_layout.addWidget(self.activity_list)
        main_area_layout.addWidget(activity_card, 1)
        
        # Footer
        footer_layout = QHBoxLayout()
        footer_layout.setContentsMargins(0, 10, 0, 0)
        self.content_layout.addLayout(footer_layout)
        
        dev_info = QLabel("Powered by <b>BR31 Technology</b>")
        dev_info.setProperty("class", "Subtitle")
        footer_layout.addWidget(dev_info)
        footer_layout.addStretch()
        
        for name, link in [("GitHub", "https://github.com/angel7544"), 
                           ("LinkedIn", "https://www.linkedin.com/in/angel3002/"),
                           ("Email", "mailto:ajktalent@gmail.com")]:
            btn = QPushButton(name)
            btn.setCursor(QCursor(Qt.PointingHandCursor))
            btn.setStyleSheet("background: transparent; border: none; color: #1f6feb; text-decoration: underline;")
            btn.clicked.connect(lambda checked=False, l=link: webbrowser.open(l))
            footer_layout.addWidget(btn)
            
        self.log("[INFO] Application initialized.")

    def create_stat_card(self, title, value):
        card = QFrame()
        card.setProperty("class", "Card")
        layout = QVBoxLayout(card)
        
        lbl_title = QLabel(title)
        lbl_title.setProperty("class", "Subtitle")
        layout.addWidget(lbl_title)
        
        lbl_val = QLabel(value)
        lbl_val.setProperty("class", "ValueText")
        layout.addWidget(lbl_val)
        
        self.stats_layout.addWidget(card)
        return lbl_val

    def add_shadows(self):
        for widget in self.findChildren(QFrame):
            if widget.property("class") == "Card":
                shadow = QGraphicsDropShadowEffect(self)
                shadow.setBlurRadius(15)
                shadow.setXOffset(0)
                shadow.setYOffset(4)
                if self.dark_mode:
                    shadow.setColor(QColor(0, 0, 0, 100))
                else:
                    shadow.setColor(QColor(0, 0, 0, 30))
                widget.setGraphicsEffect(shadow)

    def toggle_theme(self):
        self.dark_mode = not self.dark_mode
        self.apply_theme()
        if self.dark_mode:
            self.title_bar.btn_theme.setText("☀️")
            self.log_area.setStyleSheet("background-color: #010409; color: #c9d1d9;")
        else:
            self.title_bar.btn_theme.setText("🌙")
            self.log_area.setStyleSheet("background-color: #1e1e1e; color: #d4d4d4;")
        self.add_shadows()

    def apply_theme(self):
        if self.dark_mode:
            self.setStyleSheet(DARK_THEME)
            self.wrapper.setStyleSheet("background-color: #0d1117; border: 1px solid #30363d; border-radius: 8px;")
        else:
            self.setStyleSheet(LIGHT_THEME)
            self.wrapper.setStyleSheet("background-color: #f6f8fa; border: 1px solid #d0d7de; border-radius: 8px;")
        
        # Re-apply shadows for the new theme
        self.add_shadows()

    def log(self, text):
        # Add timestamp
        timestamp = datetime.now().strftime("%H:%M:%S")
        formatted = text.strip()
        if not formatted:
            return
            
        color = "#c9d1d9"
        if "[INFO]" in formatted: color = "#3fb950"
        elif "[ERROR]" in formatted: color = "#f85149"
        elif "[WARNING]" in formatted: color = "#d29922"
        elif "[SUCCESS]" in formatted: color = "#2ea043"
        
        html_text = f"<span style='color: #8b949e'>[{timestamp}]</span> <span style='color: {color}'>{formatted}</span>"
        self.log_area.append(html_text)
        
        if self.chk_autoscroll.isChecked():
            scrollbar = self.log_area.verticalScrollBar()
            scrollbar.setValue(scrollbar.maximum())

    def toggle_autoscroll(self):
        if self.chk_autoscroll.isChecked():
            self.chk_autoscroll.setText("Auto-scroll: ON")
        else:
            self.chk_autoscroll.setText("Auto-scroll: OFF")

    def add_activity(self, text):
        item = QListWidgetItem(f"{datetime.now().strftime('%H:%M')} - {text}")
        self.activity_list.insertItem(0, item)
        if self.activity_list.count() > 50:
            self.activity_list.takeItem(self.activity_list.count() - 1)

    def show_help(self):
        help_text = (
            "Required Files to run Server:\n"
            "- package.json\n"
            "- dev-server.js\n"
            "- providers (folder)\n\n"
            "This can be run on a mini PC as a 24*7 home entertainment server!"
        )
        QMessageBox.information(self, "Help / Info", help_text)

    def copy_url(self):
        url = self.url_input.text()
        QApplication.clipboard().setText(url)
        self.log(f"[SUCCESS] Copied URL to clipboard: {url}")
        self.add_activity("Copied URL to clipboard")

    def open_portal(self):
        url = self.url_input.text()
        if self.server_thread and self.server_thread.isRunning():
            webbrowser.open(f"{url}/web/index.html")
            self.log("[INFO] Opened portal in browser.")
            self.add_activity("Opened Web Portal")
        else:
            QMessageBox.warning(self, "Not Running", "Start the server first to open the portal.")

    def check_required_files(self):
        for item in self.required_files:
            if not os.path.exists(item):
                return False
        return True

    def check_files_popup(self):
        if self.check_required_files():
            QMessageBox.information(self, "Success", "All required files are present!")
            self.log("[SUCCESS] File check passed.")
            self.add_activity("File Check Completed: Passed")
        else:
            QMessageBox.critical(self, "Error", "Add/install provider files to run server.")
            self.log("[ERROR] File check failed. Missing required files.")
            self.add_activity("File Check Completed: Failed")

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
            self.check_files_popup()
            return
            
        if self.server_thread and self.server_thread.isRunning():
            return
            
        self.log("[INFO] Cleaning up old processes on port 3001...")
        self.kill_port(3001)
        self.log("[INFO] Starting server...")
        
        self.btn_start.setEnabled(False)
        self.btn_stop.setEnabled(True)
        self.status_text.setText("Starting...")
        self.status_text.setStyleSheet("color: #d29922;") # yellow
        self.status_indicator.setText("🟡")
        
        ip = self.get_local_ip()
        port = 3001
        self.url_input.setText(f"http://{ip}:{port}")
        
        self.server_thread = SubprocessThread("npm start")
        self.server_thread.new_output.connect(self.handle_server_output)
        self.server_thread.process_finished.connect(self.server_stopped)
        self.server_thread.start()
        
        self.start_time = time.time()
        self.add_activity("Server Started")

    def handle_server_output(self, line):
        self.log(line)
        if "ready on" in line.lower() or "server listening" in line.lower() or "started" in line.lower() or "port 3001" in line.lower():
            self.status_text.setText("Running")
            self.status_text.setStyleSheet("color: #3fb950;") # green
            self.status_indicator.setText("🟢")

    def stop_server(self):
        if self.server_thread and self.server_thread.isRunning():
            self.log("[INFO] Stopping server...")
            self.server_thread.stop()
            self.add_activity("Server Stopped")

    def restart_server(self):
        self.stop_server()
        # Small delay to allow process to die before restarting
        QTimer.singleShot(1000, self.start_server)

    def server_stopped(self):
        self.status_text.setText("Stopped")
        self.status_text.setStyleSheet("color: #f85149;") # red
        self.status_indicator.setText("🔴")
        self.btn_start.setEnabled(True)
        self.btn_stop.setEnabled(False)
        self.start_time = None
        self.uptime_text.setText("Uptime: 00:00:00")
        self.log("[INFO] Server process terminated.")

    def npm_install(self):
        if not self.check_required_files():
            self.check_files_popup()
            return
            
        if self.npm_thread and self.npm_thread.isRunning():
            return
            
        self.btn_npm.setEnabled(False)
        self.log("[INFO] Running npm install...")
        self.add_activity("Started NPM Install")
        
        self.npm_thread = SubprocessThread("npm install")
        self.npm_thread.new_output.connect(self.log)
        self.npm_thread.process_finished.connect(self.npm_install_finished)
        self.npm_thread.start()

    def npm_install_finished(self):
        self.btn_npm.setEnabled(True)
        self.log("[SUCCESS] npm install completed!")
        QMessageBox.information(self, "Success", "npm install completed!")
        self.add_activity("Completed NPM Install")

    def update_stats(self):
        # Update Uptime
        if self.start_time:
            elapsed = int(time.time() - self.start_time)
            hours, remainder = divmod(elapsed, 3600)
            minutes, seconds = divmod(remainder, 60)
            self.uptime_text.setText(f"Uptime: {hours:02d}:{minutes:02d}:{seconds:02d}")
            
        # Mock users/streams if running
        if self.server_thread and self.server_thread.isRunning():
            # In a real scenario, this would query an API endpoint on the server.
            # Here we just leave it as placeholders.
            pass
            
        # Hardware Stats
        if HAS_PSUTIL:
            try:
                cpu = psutil.cpu_percent()
                mem = psutil.virtual_memory()
                self.lbl_cpu.setText(f"{cpu}%")
                self.lbl_ram.setText(f"{mem.used // (1024*1024)} MB")
            except Exception:
                pass

    def mousePressEvent(self, event):
        # Handle moving the window by dragging the background
        if event.button() == Qt.LeftButton:
            self.drag_start_pos = event.globalPosition().toPoint()

    def mouseMoveEvent(self, event):
        if hasattr(self, 'drag_start_pos') and self.drag_start_pos is not None:
            delta = event.globalPosition().toPoint() - self.drag_start_pos
            self.move(self.pos() + delta)
            self.drag_start_pos = event.globalPosition().toPoint()

    def mouseReleaseEvent(self, event):
        self.drag_start_pos = None


if __name__ == "__main__":
    app = QApplication(sys.argv)
    
    # Set default font
    font = QFont("Inter", 10)
    app.setFont(font)
    
    window = ServerManagerApp()
    window.show()
    sys.exit(app.exec())
