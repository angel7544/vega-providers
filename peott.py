import customtkinter as ctk
import requests
import json
import os
import threading
import io
import subprocess
import sys
import webbrowser
from PIL import Image
import urllib.parse
import time
import re
import zipfile
import urllib.request
import shutil

import sys
# Configuration file for persistence
if getattr(sys, 'frozen', False):
    CONFIG_FILE = os.path.join(os.path.dirname(sys.executable), "config.json")
else:
    CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")


class PersonalEntertainmentApp(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("Personal Entertainment Hub")
        self.geometry("1100x700")

        # Load Window Title Bar Icon
        try:
            icon_path = "icon.ico"
            # Prioritize bundled PyInstaller path if frozen
            if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
                bundled_icon = os.path.join(sys._MEIPASS, "icon.ico")
                if os.path.exists(bundled_icon):
                    icon_path = bundled_icon
            
            if os.path.exists(icon_path):
                self.iconbitmap(icon_path)
        except Exception as e:
            print(f"Could not load title bar icon: {e}")

        # Set appearance mode and color theme
        ctk.set_appearance_mode("Dark")
        ctk.set_default_color_theme("blue")

        # Initialize data
        self.providers_display = []
        self.provider_map = {} # display_name -> value
        self.image_cache = {}
        self.settings = self.load_settings()
        self.server_url = self.settings.get("server_url", "http://localhost:3001")
        self.current_provider_value = self.settings.get("last_provider", "vega")

        # Configure grid
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)
        self.grid_rowconfigure(1, weight=0) # Bottom bar

        # Create sidebar
        self.sidebar_frame = ctk.CTkFrame(self, width=180, corner_radius=0, fg_color="#18181A")
        self.sidebar_frame.grid(row=0, column=0, sticky="nsew")
        self.sidebar_frame.grid_rowconfigure(5, weight=1)

        self.logo_label = ctk.CTkLabel(self.sidebar_frame, text="✨\nOrbix Play", font=ctk.CTkFont(size=22, weight="bold"))
        self.logo_label.grid(row=0, column=0, padx=20, pady=(20, 0))
        self.subtitle_label = ctk.CTkLabel(self.sidebar_frame, text="Personal Entertainment Hub", font=ctk.CTkFont(size=10), text_color="gray")
        self.subtitle_label.grid(row=1, column=0, padx=20, pady=(0, 30))

        btn_kwargs = {"fg_color": "transparent", "text_color": "lightgray", "hover_color": "#2a2d33", "anchor": "w", "font": ctk.CTkFont(size=14)}
        self.home_button = ctk.CTkButton(self.sidebar_frame, text="🏠 Home", command=self.show_home, **btn_kwargs)
        self.home_button.grid(row=2, column=0, padx=10, pady=5, sticky="ew")

        self.trending_button = ctk.CTkButton(self.sidebar_frame, text="📈 Trending", command=lambda: self.fetch_data("trending"), **btn_kwargs)
        self.trending_button.grid(row=3, column=0, padx=10, pady=5, sticky="ew")

        self.settings_button = ctk.CTkButton(self.sidebar_frame, text="⚙️ Settings", command=self.show_settings, **btn_kwargs)
        self.settings_button.grid(row=4, column=0, padx=10, pady=5, sticky="ew")

        # Bottom Bar
        self.bottom_bar = ctk.CTkFrame(self, height=45, corner_radius=0, fg_color="#18181A")
        self.bottom_bar.grid(row=1, column=0, columnspan=2, sticky="ew")
        self.bottom_bar.grid_columnconfigure((0, 2), weight=1)

        bottom_left = ctk.CTkFrame(self.bottom_bar, fg_color="transparent")
        bottom_left.grid(row=0, column=0, sticky="w", padx=20)
        self.provider_label = ctk.CTkLabel(bottom_left, text="Select Provider:")
        self.provider_label.pack(side="left", padx=(0, 10), pady=10)
        self.provider_menu = ctk.CTkOptionMenu(bottom_left, values=["Loading..."], command=self.change_provider, fg_color="#2b2b2b", button_color="#333", button_hover_color="#444")
        self.provider_menu.pack(side="left", pady=10)

        made_with_love = ctk.CTkLabel(self.bottom_bar, text="Made with ❤️ by angel mehul singh | @br31technologies", font=ctk.CTkFont(size=12, weight="bold"), text_color="gray")
        made_with_love.grid(row=0, column=1, sticky="ew", pady=10)

        self.status_label = ctk.CTkLabel(self.bottom_bar, text="Status: Online 🟢", font=ctk.CTkFont(size=12))
        self.status_label.grid(row=0, column=2, padx=20, pady=10, sticky="e")

        # Main content area
        self.main_content = ctk.CTkFrame(self, corner_radius=0, fg_color="transparent")
        self.main_content.grid(row=0, column=1, sticky="nsew", padx=20, pady=20)
        self.main_content.grid_columnconfigure(0, weight=1)
        self.main_content.grid_rowconfigure(1, weight=1)

        # Top bar with Search
        self.top_bar = ctk.CTkFrame(self.main_content, fg_color="transparent")
        self.top_bar.grid(row=0, column=0, sticky="ew", pady=(0, 20))
        self.top_bar.grid_columnconfigure(0, weight=1)

        self.search_entry = ctk.CTkEntry(self.top_bar, placeholder_text="🔍 Search movies, series, shows...", height=40, corner_radius=8, fg_color="#1C1C1E", border_width=1, border_color="#333")
        self.search_entry.grid(row=0, column=0, sticky="ew")
        self.search_entry.bind("<Return>", lambda e: self.search())

        # Media scroll area
        self.media_scroll = ctk.CTkScrollableFrame(self.main_content, label_text="Results", fg_color="transparent")
        self.media_scroll.grid(row=1, column=0, sticky="nsew")
        self.media_scroll.grid_columnconfigure((0, 1, 2, 3), weight=1)

        # Detail View
        self.detail_view = ctk.CTkFrame(self, corner_radius=0, fg_color="transparent")
        self.detail_view.grid_columnconfigure(1, weight=1)
        self.detail_view.grid_rowconfigure(0, weight=1)

        # Runtime state
        self.current_meta = {}
        self.current_item_type = "movie"

        # Load providers and initial data
        self.load_providers()
        self.show_home()

    def crop_to_aspect(self, img, target_width, target_height):
        target_aspect = target_width / target_height
        w, h = img.size
        aspect = w / h
        if aspect > target_aspect:
            new_w = int(target_aspect * h)
            offset = (w - new_w) // 2
            img = img.crop((offset, 0, offset + new_w, h))
        elif aspect < target_aspect:
            new_h = int(w / target_aspect)
            offset = (h - new_h) // 2
            img = img.crop((0, offset, w, offset + new_h))
        return img

    def clean_title(self, raw_title):
        t = re.sub(r'(?i)^Download\s+', '', raw_title)
        network = ""
        if re.search(r'(?i)apple tv\+', raw_title): network = "Apple TV+"
        elif re.search(r'(?i)amazon|prime', raw_title): network = "Amazon"
        elif re.search(r'(?i)netflix', raw_title): network = "Netflix"
        elif re.search(r'(?i)disney\+', raw_title): network = "Disney+"
        
        match = re.search(r'(?i)(\s\(\d{4}\)|\sSeason\s\d+|\sS\d+E\d+|\s720p|\s1080p|\s2160p|\s4K|\sWEB-DL|\sHDRip|\[)', t)
        if match: t = t[:match.start()]
        t = re.sub(r'[\s\-:|]+$', '', t).strip()
        return t, network

    def load_settings(self):
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, "r") as f:
                    return json.load(f)
            except:
                return {}
        return {}

    def save_settings(self):
        self.settings["last_provider"] = self.current_provider_value
        with open(CONFIG_FILE, "w") as f:
            json.dump(self.settings, f)

    def load_providers(self):
        def task():
            for attempt in range(15):
                try:
                    resp = requests.get(f"{self.server_url}/manifest.json", timeout=3)
                    if resp.status_code == 200:
                        manifest = resp.json()
                        self.provider_map = {p["display_name"]: p["value"] for p in manifest if not p.get("disabled")}
                        self.providers_display = list(self.provider_map.keys())
                        self.after(0, lambda: self.provider_menu.configure(values=self.providers_display))
                        last_provider_display = next((k for k, v in self.provider_map.items() if v == self.current_provider_value), None)
                        if last_provider_display:
                            self.after(0, lambda: self.provider_menu.set(last_provider_display))
                        elif self.providers_display:
                            first_display = self.providers_display[0]
                            self.current_provider_value = self.provider_map[first_display]
                            self.after(0, lambda: self.provider_menu.set(first_display))
                        
                        # Once loaded, show home page
                        self.after(0, self.show_home)
                        return
                except Exception as e:
                    print(f"Server not ready, retrying ({attempt+1}/15): {e}")
                    time.sleep(2)
            self.after(0, lambda: self.provider_menu.configure(values=["Server Offline"]))
        threading.Thread(target=task, daemon=True).start()

    def change_provider(self, choice):
        self.current_provider_value = self.provider_map.get(choice, "vega")
        self.save_settings()
        self.status_label.configure(text=f"Status: Switched to {choice}", text_color="cyan")
        self.show_home()

    def show_home(self):
        self.fetch_data("")

    def search(self):
        query = self.search_entry.get()
        if query:
            self.fetch_data(query, search=True)

    def show_settings(self):
        self.status_label.configure(text="Status: Settings 🟢", text_color="cyan")
        
        # Hide standard views
        self.detail_view.grid_forget()
        self.main_content.grid(row=0, column=1, sticky="nsew", padx=20, pady=20)
        
        # Setup settings view in media scroll
        self.media_scroll.configure(label_text="Settings")
        for widget in self.media_scroll.winfo_children():
            widget.destroy()

        st_frame = ctk.CTkFrame(self.media_scroll, fg_color="transparent")
        st_frame.pack(fill="both", expand=True, padx=20, pady=20)
        
        ctk.CTkLabel(st_frame, text="Configuration", font=ctk.CTkFont(size=18, weight="bold"), anchor="w").pack(fill="x", pady=(0, 15))
        
        ctk.CTkLabel(st_frame, text="Server URL:", font=ctk.CTkFont(size=14), anchor="w").pack(fill="x", pady=(0, 5))
        server_entry = ctk.CTkEntry(st_frame, height=35, corner_radius=8, fg_color="#1C1C1E", border_width=1, border_color="#333")
        server_entry.insert(0, self.server_url)
        server_entry.pack(fill="x", pady=(0, 20))
        
        def save_url():
            new_url = server_entry.get().strip()
            if new_url:
                self.server_url = new_url
                self.settings["server_url"] = new_url
                self.save_settings()
                self.status_label.configure(text="Status: Settings saved 🟢", text_color="green")
                self.load_providers() # Reload manifest on server change
                
        ctk.CTkButton(st_frame, text="Save Settings", command=save_url, fg_color="#2b6bba", hover_color="#1f5394", height=35).pack(anchor="w", pady=(0, 30))
        
        # About section
        about_frame = ctk.CTkFrame(st_frame, fg_color="#1a1a1c", corner_radius=10, border_width=1, border_color="#333")
        about_frame.pack(fill="x", pady=20)
        
        ctk.CTkLabel(about_frame, text="About", font=ctk.CTkFont(size=16, weight="bold")).pack(pady=(20, 5))
        ctk.CTkLabel(about_frame, text="Developed by angel mehl singh", font=ctk.CTkFont(size=14), text_color="gray").pack(pady=(0, 20))

        # FFmpeg Section
        ctk.CTkLabel(st_frame, text="FFmpeg (Required for MKV Multi-Audio)", font=ctk.CTkFont(size=16, weight="bold"), anchor="w").pack(fill="x", pady=(20, 5))
        
        ffmpeg_status = "Status: Installed ✅" if self.check_ffmpeg_local() else "Status: Not Found ❌"
        self.ffmpeg_lbl = ctk.CTkLabel(st_frame, text=ffmpeg_status, font=ctk.CTkFont(size=13), anchor="w")
        self.ffmpeg_lbl.pack(fill="x", pady=(0, 10))
        
        self.ffmpeg_btn = ctk.CTkButton(st_frame, text="Install FFmpeg Locally", command=self.download_ffmpeg, fg_color="#2b6bba", hover_color="#1f5394")
        self.ffmpeg_btn.pack(anchor="w", pady=(0, 10))
        if self.check_ffmpeg_local(): self.ffmpeg_btn.configure(state="disabled", text="FFmpeg Already Installed")

    def check_ffmpeg_local(self):
        base = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))
        return os.path.exists(os.path.join(base, "ffmpeg.exe")) or os.path.exists(os.path.join(base, "bin", "ffmpeg.exe"))

    def download_ffmpeg(self):
        self.ffmpeg_btn.configure(state="disabled", text="Installing... (Please wait)")
        def task():
            try:
                base = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))
                zip_path = os.path.join(base, "ffmpeg_temp.zip")
                # Using a direct GitHub redirect which is often faster/more reliable
                url = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
                
                self.after(0, lambda: self.status_label.configure(text="Status: Connecting to Server...", text_color="yellow"))
                
                # Use requests for streaming download to show progress
                response = requests.get(url, stream=True, timeout=15)
                total_size = int(response.headers.get('content-length', 0))
                
                with open(zip_path, "wb") as f:
                    downloaded = 0
                    for chunk in response.iter_content(chunk_size=1024*1024): # 1MB chunks
                        if chunk:
                            f.write(chunk)
                            downloaded += len(chunk)
                            if total_size > 0:
                                percent = int((downloaded / total_size) * 100)
                                self.after(0, lambda p=percent: self.status_label.configure(text=f"Status: Downloading FFmpeg ({p}%)..."))
                
                self.after(0, lambda: self.status_label.configure(text="Status: Extracting FFmpeg...", text_color="yellow"))
                with zipfile.ZipFile(zip_path, 'r') as zip_ref:
                    # Find the bin folder and extract ffmpeg.exe and ffprobe.exe
                    for member in zip_ref.namelist():
                        if member.endswith("ffmpeg.exe") or member.endswith("ffprobe.exe"):
                            filename = os.path.basename(member)
                            source = zip_ref.open(member)
                            target = open(os.path.join(base, filename), "wb")
                            with source, target:
                                shutil.copyfileobj(source, target)
                
                if os.path.exists(zip_path): os.remove(zip_path)
                
                self.after(0, lambda: self.status_label.configure(text="Status: FFmpeg Installed!", text_color="green"))
                self.after(0, lambda: self.ffmpeg_lbl.configure(text="Status: Installed ✅"))
                self.after(0, lambda: self.ffmpeg_btn.configure(text="Installation Complete"))
            except Exception as e:
                print(f"FFmpeg install failed: {e}")
                self.after(0, lambda: self.status_label.configure(text="Status: Install Failed", text_color="red"))
                self.after(0, lambda: self.ffmpeg_btn.configure(state="normal", text="Retry Install"))
        threading.Thread(target=task, daemon=True).start()

    def fetch_data(self, filter_text, page=1, search=False):
        self.status_label.configure(text="Status: Fetching data...", text_color="yellow")
        for widget in self.media_scroll.winfo_children():
            widget.destroy()

        def task():
            try:
                func = "getSearchPosts" if search else "getPosts"
                params = {"searchQuery": filter_text, "page": page} if search else {"filter": filter_text, "page": page}
                payload = {"provider": self.current_provider_value, "functionName": func, "params": params}
                response = requests.post(f"{self.server_url}/fetch", json=payload)
                if response.status_code == 200:
                    data = response.json()
                    self.after(0, lambda: self.populate_media(data))
                    self.after(0, lambda: self.status_label.configure(text="Status: Online", text_color="green"))
                else:
                    self.after(0, lambda: self.status_label.configure(text=f"Status: Fetch Error {response.status_code}", text_color="red"))
            except Exception as e:
                print(f"Fetch failed: {e}")
                self.after(0, lambda: self.status_label.configure(text="Status: Fetch failed", text_color="red"))

        threading.Thread(target=task, daemon=True).start()

    def populate_media(self, data):
        # We assume 4 items per row for simplicity 
        # width 210 gives neat cards
        for index, item in enumerate(data):
            row = index // 4
            col = index % 4
            card = ctk.CTkFrame(self.media_scroll, width=220, height=310, fg_color="transparent")
            card.grid(row=row, column=col, padx=15, pady=15)
            card.grid_propagate(False)
            
            # Using a frame to draw the border effect like the image (subtle blue edge)
            inner_card = ctk.CTkFrame(card, fg_color="#1a1a1c", corner_radius=12, border_width=1, border_color="#2b6bba")
            inner_card.pack(fill="both", expand=True)

            poster_label = ctk.CTkLabel(inner_card, text="Loading...", width=200, height=250, fg_color="#222", corner_radius=8)
            poster_label.pack(pady=(10, 5), padx=10)
            
            def load_img(url, lbl=poster_label):
                if not url:
                    self.after(0, lambda: lbl.configure(text="No Image") if lbl.winfo_exists() else None)
                    return
                try:
                    if url in self.image_cache:
                        img = self.image_cache[url]
                    else:
                        resp = requests.get(url, stream=True, timeout=5)
                        img_data = Image.open(io.BytesIO(resp.content))
                        img_data = self.crop_to_aspect(img_data, 200, 250)
                        img = ctk.CTkImage(light_image=img_data, dark_image=img_data, size=(200, 250))
                        self.image_cache[url] = img
                    self.after(0, lambda: lbl.configure(image=img, text="") if lbl.winfo_exists() else None)
                except:
                    self.after(0, lambda: lbl.configure(text="No Image") if lbl.winfo_exists() else None)

            threading.Thread(target=load_img, args=(item.get("image"),), daemon=True).start()
            raw_title = item.get("title", "Unknown")
            clean_t, net = self.clean_title(raw_title)
            display_title = clean_t
            if net: display_title += f" ({net})"
            if len(display_title) > 28: display_title = display_title[:25] + "..."
            ctk.CTkLabel(inner_card, text=display_title, font=ctk.CTkFont(size=13, weight="bold"), text_color="#E0E0E0").pack(padx=10, pady=(0, 10))
            
            def on_click(event, u=item["link"]):
                self.get_stream_info(u)

            poster_label.bind("<Button-1>", on_click)
            inner_card.bind("<Button-1>", on_click)

    def get_stream_info(self, link):
        self.status_label.configure(text="Status: Fetching metadata...", text_color="yellow")
        def task():
            try:
                meta_payload = {"provider": self.current_provider_value, "functionName": "getMeta", "params": {"link": link}}
                meta_resp = requests.post(f"{self.server_url}/fetch", json=meta_payload)
                if meta_resp.status_code == 200:
                    self.current_meta = meta_resp.json()
                    self.current_item_type = self.current_meta.get("type", "movie")
                    self.after(0, lambda: self.show_meta_view())
                else:
                    self.after(0, lambda: self.status_label.configure(text="Status: Meta Error", text_color="red"))
            except Exception as e:
                print(f"Metadata error: {e}")
                self.after(0, lambda: self.status_label.configure(text="Status: Error", text_color="red"))
        threading.Thread(target=task, daemon=True).start()

    def show_meta_view(self):
        info = self.current_meta
        self.main_content.grid_forget()
        self.sidebar_frame.grid_forget()
        self.detail_view.grid(row=0, column=0, columnspan=2, sticky="nsew", padx=20, pady=20)
        for widget in self.detail_view.winfo_children(): widget.destroy()
            
        left_frame = ctk.CTkFrame(self.detail_view, width=320, fg_color="transparent")
        left_frame.grid(row=0, column=0, sticky="n", padx=(0, 20), pady=0)
        self.right_frame = ctk.CTkScrollableFrame(self.detail_view, label_text="Select Quality / Episodes", corner_radius=10, fg_color="transparent")
        self.right_frame.grid(row=0, column=1, sticky="nsew", padx=0, pady=0)
        
        btn_back = ctk.CTkButton(left_frame, text="← Back to Home", command=self.close_detail_view, fg_color="#2b6bba", hover_color="#1f5394", height=35)
        btn_back.pack(pady=(0, 15), fill="x")
        
        poster_url = info.get("image", "")
        # Card style poster
        poster_frame = ctk.CTkFrame(left_frame, fg_color="transparent")
        poster_frame.pack(pady=(0, 10))
        detail_poster = ctk.CTkLabel(poster_frame, text="Loading Poster...", width=260, height=380, fg_color="#222", corner_radius=12)
        detail_poster.pack()
        
        def load_large_img(url, lbl=detail_poster):
            if not url: return
            try:
                resp = requests.get(url, stream=True, timeout=5)
                img_data = Image.open(io.BytesIO(resp.content))
                img_data = self.crop_to_aspect(img_data, 260, 380)
                img = ctk.CTkImage(light_image=img_data, dark_image=img_data, size=(260, 380))
                self.after(0, lambda: lbl.configure(image=img, text=""))
            except: pass
        threading.Thread(target=load_large_img, args=(poster_url,), daemon=True).start()
        
        raw_title = info.get("title", "")
        clean_t, net = self.clean_title(raw_title)
        
        # Title
        ctk.CTkLabel(left_frame, text=clean_t, font=ctk.CTkFont(size=20, weight="bold"), wraplength=280).pack(pady=(5, 5))
        
        # Subtitle
        subtitle_text = info.get("subtitle", "")
        if not subtitle_text:
            year = info.get("year", info.get("releaseDate", ""))
            type_label = info.get("type", "Movie").capitalize()
            subtitle_text = f"{type_label} | Premiere: {year}" if year else f"{type_label}"
        
        if net: subtitle_text += f" • {net}"
        ctk.CTkLabel(left_frame, text=subtitle_text, font=ctk.CTkFont(size=12), text_color="gray").pack(pady=(0, 5))
        
        # Tags (4K, HDR, etc)
        tags_text = info.get("tagsText", info.get("quality", "HD"))
        tags_label = ctk.CTkLabel(left_frame, text=f"🏷️ {tags_text} | CC", font=ctk.CTkFont(size=11), text_color="lightgray")
        tags_label.pack(pady=(0, 15))
        
        # IMDb style box
        imdb_frame = ctk.CTkFrame(left_frame, fg_color="#1a1a1c", corner_radius=8, border_width=1, border_color="#333")
        imdb_frame.pack(fill="x", pady=(0, 15))
        
        imdb_top = ctk.CTkFrame(imdb_frame, fg_color="transparent")
        imdb_top.pack(fill="x", padx=10, pady=5)
        
        imdb_logo = ctk.CTkLabel(imdb_top, text="IMDb", text_color="black", fg_color="#f5c518", font=ctk.CTkFont(size=11, weight="bold"), corner_radius=4, width=40)
        imdb_logo.pack(side="left")
        
        rating = info.get("rating", info.get("imdbRating", "Scraping..."))
        votes = info.get("votes", info.get("imdbVotes", ""))
        
        self.db_rating_label = ctk.CTkLabel(imdb_top, text=f"⭐ {rating}", font=ctk.CTkFont(size=14, weight="bold"))
        self.db_rating_label.pack(side="left", padx=10)
        self.db_votes_label = ctk.CTkLabel(imdb_top, text=f"👥 {votes} Votes" if votes else "👥 Scraping...", font=ctk.CTkFont(size=11), text_color="gray")
        self.db_votes_label.pack(side="right")
        
        # Trigger async imdb scrape
        self.fetch_imdb_meta(clean_t)
        
        # Top Episodes or Details
        top_episodes = info.get("topEpisodes", [])
        if top_episodes:
            ctk.CTkLabel(left_frame, text="Top Episodes", font=ctk.CTkFont(size=12, weight="bold"), anchor="w").pack(fill="x", pady=(0, 2))
            eps_str = " | ".join(top_episodes)
            ctk.CTkLabel(left_frame, text=eps_str, font=ctk.CTkFont(size=11), text_color="gray", wraplength=280, justify="left", anchor="w").pack(fill="x", pady=(0, 10))
            
        # Cast
        cast = info.get("cast", [])
        if cast:
            cast_str = ", ".join(cast)
            ctk.CTkLabel(left_frame, text="Key Cast", font=ctk.CTkFont(size=12, weight="bold"), anchor="w").pack(fill="x", pady=(0, 2))
            ctk.CTkLabel(left_frame, text=cast_str, font=ctk.CTkFont(size=11), text_color="gray", wraplength=280, justify="left", anchor="w").pack(fill="x", pady=(0, 10))
        elif info.get("synopsis"):
            synopsis = info.get("synopsis", "")
            if len(synopsis) > 200: synopsis = synopsis[:197] + "..."
            ctk.CTkLabel(left_frame, text="Synopsis", font=ctk.CTkFont(size=12, weight="bold"), anchor="w").pack(fill="x", pady=(0, 2))
            ctk.CTkLabel(left_frame, text=synopsis, font=ctk.CTkFont(size=11), text_color="gray", wraplength=280, justify="left", anchor="w").pack(fill="x", pady=(0, 10))

        is_series = self.current_item_type == "series"
        link_list = info.get("linkList", [])
        if not link_list:
            ctk.CTkLabel(self.right_frame, text="No links found.", text_color="orange").pack(pady=20)
            return

        for group in link_list:
            g_title = group.get("title", "Download Link")
            if group.get("size"): g_title += f" [{group['size']}]"
            
            g_frame = ctk.CTkFrame(self.right_frame, fg_color="#1a1a1c", corner_radius=10, border_width=1, border_color="#333")
            g_frame.pack(pady=8, fill="x", padx=10)
            
            ctk.CTkLabel(g_frame, text=g_title, font=ctk.CTkFont(size=13), anchor="center", text_color="#E0E0E0", wraplength=600).pack(pady=(15, 10), fill="x", padx=15)

            if is_series and group.get("episodesLink"):
                ctk.CTkButton(g_frame, text="View Episodes", fg_color="#2b6bba", hover_color="#1f5394", width=200, height=35,
                             command=lambda u=group["episodesLink"]: self.fetch_episodes(u)).pack(pady=(0, 15))
            else:
                d_links = group.get("directLinks", [])
                if len(d_links) == 1:
                    btns_frame = ctk.CTkFrame(g_frame, fg_color="transparent")
                    btns_frame.pack(pady=(0, 15))
                    d_link = d_links[0]
                    btn_args = {"height": 32, "corner_radius": 6, "fg_color": "#2a2d33", "hover_color": "#3f434a"}
                    ctk.CTkButton(btns_frame, text="▶ App", width=100, command=lambda u=d_link["link"]: self.extract_and_play(u), **btn_args).grid(row=0, column=0, padx=8)
                    ctk.CTkButton(btns_frame, text="🌐 Web", width=100, command=lambda u=d_link["link"]: self.extract_and_open_browser(u, title=d_link.get('title')), **btn_args).grid(row=0, column=1, padx=8)
                    ctk.CTkButton(btns_frame, text="🧡 VLC", width=100, command=lambda u=d_link["link"]: self.extract_and_vlc(u), **btn_args).grid(row=0, column=2, padx=8)
                    ctk.CTkButton(btns_frame, text="📋", width=40, command=lambda u=d_link["link"]: self.extract_and_copy(u), **btn_args).grid(row=0, column=3, padx=8)
                elif len(d_links) > 1:
                    list_container = ctk.CTkFrame(g_frame, fg_color="transparent")
                    list_container.pack(pady=(0, 15), fill="x", padx=15)
                    for idx, d_link in enumerate(d_links):
                        link_row = ctk.CTkFrame(list_container, fg_color="transparent")
                        link_row.pack(pady=4, fill="x")
                        link_row.grid_columnconfigure(0, weight=1)
                        
                        d_title = d_link.get("title", f"Episode {idx+1}" if is_series else f"Link {idx+1}")
                        
                        title_btn = ctk.CTkButton(link_row, text=d_title, fg_color="#2a2d33", hover_color="#3f434a", anchor="w", height=30,
                                                command=lambda u=d_link["link"]: self.extract_and_play(u))
                        title_btn.grid(row=0, column=0, sticky="ew", padx=(0, 10))
                        
                        btns_frame = ctk.CTkFrame(link_row, fg_color="transparent")
                        btns_frame.grid(row=0, column=1)
                        
                        s_btn_args = {"height": 28, "width": 35, "corner_radius": 6, "fg_color": "#2a2d33", "hover_color": "#3f434a"}
                        ctk.CTkButton(btns_frame, text="🌐", command=lambda u=d_link["link"]: self.extract_and_open_browser(u, title=d_link.get('title')), **s_btn_args).grid(row=0, column=0, padx=3)
                        ctk.CTkButton(btns_frame, text="🧡", command=lambda u=d_link["link"]: self.extract_and_vlc(u), **s_btn_args).grid(row=0, column=1, padx=3)
                        ctk.CTkButton(btns_frame, text="📋", command=lambda u=d_link["link"]: self.extract_and_copy(u), **s_btn_args).grid(row=0, column=2, padx=3)

    def fetch_episodes(self, url):
        self.status_label.configure(text="Status: Fetching episodes...", text_color="yellow")
        def task():
            try:
                payload = {"provider": self.current_provider_value, "functionName": "getEpisodes", "params": {"url": url}}
                resp = requests.post(f"{self.server_url}/fetch", json=payload)
                if resp.status_code == 200:
                    self.after(0, lambda: self.show_episodes_view(resp.json()))
                    self.after(0, lambda: self.status_label.configure(text="Status: Online 🟢", text_color="green"))
            except: self.after(0, lambda: self.status_label.configure(text="Status: Fetch failed", text_color="red"))
        threading.Thread(target=task, daemon=True).start()

    def fetch_imdb_meta(self, title):
        if not title: return
        def task():
            try:
                # 1. Get IMDb ID from IMDb Suggestion API
                first_letter = title.lower()[0] if title else 'a'
                q_safe = urllib.parse.quote(title.lower())
                sug_url = f"https://v3.sg.media-imdb.com/suggestion/x/{first_letter}/{q_safe}.json"
                
                headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
                sug_resp = requests.get(sug_url, headers=headers, timeout=5)
                
                imdb_id = None
                if sug_resp.status_code == 200:
                    data = sug_resp.json()
                    if "d" in data and len(data["d"]) > 0:
                        imdb_id = data["d"][0]["id"]
                
                if not imdb_id:
                    self.after(0, lambda: self.update_imdb_ui("N/A", "N/A"))
                    return
                    
                # 2. Get Rating from Cinemeta API
                tipo = "series" if self.current_item_type == "series" else "movie"
                meta_url = f"https://v3-cinemeta.strem.io/meta/{tipo}/{imdb_id}.json"
                meta_resp = requests.get(meta_url, headers=headers, timeout=5)
                
                rating = "N/A"
                votes = ""
                if meta_resp.status_code == 200:
                    meta_data = meta_resp.json().get("meta", {})
                    rating = str(meta_data.get("imdbRating", "N/A"))
                    if rating != "N/A" and not rating: rating = "N/A"
                    # Cinemeta usually doesn't provide vote count
                    votes = ""
                
                self.after(0, lambda: self.update_imdb_ui(rating, votes))
            except Exception as e:
                print(f"IMDb Scrape error: {e}")
                self.after(0, lambda: self.update_imdb_ui("N/A", "N/A"))

        threading.Thread(target=task, daemon=True).start()

    def update_imdb_ui(self, rating, votes):
        if hasattr(self, 'db_rating_label') and self.db_rating_label.winfo_exists():
            self.db_rating_label.configure(text=f"⭐ {rating}")
        if hasattr(self, 'db_votes_label') and self.db_votes_label.winfo_exists():
            v_text = f"👥 {votes} Votes" if votes and votes != "N/A" else "👥 N/A"
            self.db_votes_label.configure(text=v_text)

    def show_episodes_view(self, episodes):
        for widget in self.right_frame.winfo_children(): widget.destroy()
        self.right_frame.configure(label_text="Episode Selection")
        ctk.CTkButton(self.right_frame, text="← Back to Qualities", fg_color="transparent", text_color="gray", hover_color="#2a2d33",
                     command=self.show_meta_view).pack(pady=(0, 10), anchor="w", padx=10)
        
        for i, ep in enumerate(episodes):
            g_frame = ctk.CTkFrame(self.right_frame, fg_color="#1a1a1c", corner_radius=10, border_width=1, border_color="#333")
            g_frame.pack(pady=6, fill="x", padx=10)
            
            # Use columns inside g_frame
            g_frame.grid_columnconfigure(0, weight=1)
            
            title_btn = ctk.CTkButton(g_frame, text=ep.get("title", f"Episode {i+1}"), fg_color="transparent", hover_color="#2a2d33", anchor="w",
                                    command=lambda u=ep["link"]: self.extract_and_play(u))
            title_btn.grid(row=0, column=0, sticky="ew", padx=(10, 5), pady=10)
            
            btns_frame = ctk.CTkFrame(g_frame, fg_color="transparent")
            btns_frame.grid(row=0, column=1, padx=10, pady=10)
            
            btn_args = {"height": 30, "width": 35, "corner_radius": 6, "fg_color": "#2a2d33", "hover_color": "#3f434a"}
            ctk.CTkButton(btns_frame, text="🌐", command=lambda u=ep["link"]: self.extract_and_open_browser(u, title=ep.get('title')), **btn_args).grid(row=0, column=0, padx=4)
            ctk.CTkButton(btns_frame, text="🧡", command=lambda u=ep["link"]: self.extract_and_vlc(u), **btn_args).grid(row=0, column=1, padx=4)
            ctk.CTkButton(btns_frame, text="📋", command=lambda u=ep["link"]: self.extract_and_copy(u), **btn_args).grid(row=0, column=2, padx=4)

    def copy_to_clipboard(self, text):
        self.clipboard_clear()
        self.clipboard_append(text)
        self.status_label.configure(text="Status: Link copied!", text_color="cyan")

    def get_direct_link(self, link, pref_exts=[".mkv", ".mp4"]):
        payload = {"provider": self.current_provider_value, "functionName": "getStream", 
                  "params": {"link": link, "type": self.current_item_type}}
        response = requests.post(f"{self.server_url}/fetch", json=payload)
        if response.status_code == 200:
            streams = response.json()
            if streams:
                final_link = streams[0]["link"]
                # First pass: look for exact preference matches in order
                for ext in pref_exts:
                    for s in streams:
                        if ext in s["link"].lower():
                            return s["link"]
                return final_link
        return None

    def extract_and_play(self, link):
        self.status_label.configure(text="Status: Extracting stream...", text_color="yellow")
        def task():
            try:
                final_url = self.get_direct_link(link)
                if final_url:
                    self.after(0, lambda: self.play_video_now(final_url))
                else: 
                    self.after(0, lambda: self.status_label.configure(text="Status: No links found", text_color="orange"))
            except Exception as e:
                print(f"Stream error: {e}")
                self.after(0, lambda: self.status_label.configure(text="Status: Error", text_color="red"))
        threading.Thread(target=task, daemon=True).start()

    def extract_and_vlc(self, link):
        self.status_label.configure(text="Status: Extracting MKV for VLC...", text_color="yellow")
        def task():
            try:
                # Strictly prioritize .mkv for VLC
                final_url = self.get_direct_link(link, pref_exts=[".mkv"])
                if final_url:
                    # Common VLC paths on Windows
                    vlc_paths = [
                        r"C:\Program Files\VideoLAN\VLC\vlc.exe",
                        r"C:\Program Files (x86)\VideoLAN\VLC\vlc.exe",
                        os.path.join(os.environ.get("ProgramFiles", "C:\\"), "VideoLAN", "VLC", "vlc.exe")
                    ]
                    vlc_bin = next((p for p in vlc_paths if os.path.exists(p)), "vlc")
                    subprocess.Popen([vlc_bin, final_url])
                    self.after(0, lambda: self.status_label.configure(text="Status: Playing in VLC", text_color="green"))
                else: self.after(0, lambda: self.status_label.configure(text="Status: No links found", text_color="orange"))
            except: self.after(0, lambda: self.status_label.configure(text="Status: VLC failed", text_color="red"))
        threading.Thread(target=task, daemon=True).start()

    def extract_and_copy(self, link):
        self.status_label.configure(text="Status: Extracting link for copy...", text_color="yellow")
        def task():
            try:
                final_url = self.get_direct_link(link)
                if final_url:
                    self.after(0, lambda: self.copy_to_clipboard(final_url))
                else: 
                    self.after(0, lambda: self.status_label.configure(text="Status: No links found", text_color="orange"))
            except: 
                self.after(0, lambda: self.status_label.configure(text="Status: Error", text_color="red"))
        threading.Thread(target=task, daemon=True).start()

    def extract_and_open_browser(self, link, title=None):
        self.status_label.configure(text="Status: Extracting for browser...", text_color="yellow")
        def task():
            try:
                final_url = self.get_direct_link(link)
                if final_url:
                    # Create temporary HTML player file with local ArtPlayer
                    temp_html = os.path.join(os.getcwd(), "browser_player.html")
                    title_str = title or self.current_meta.get("title", "Video Player")
                    
                    # Try to embed local artplayer.js for multi-audio support
                    artplayer_js = ""
                    
                    if getattr(sys, 'frozen', False):
                        base_path = os.path.dirname(sys.executable)
                    else:
                        base_path = os.path.dirname(os.path.abspath(__file__))
                    
                    artplayer_path = os.path.join(base_path, "artplayer.js")
                    if os.path.exists(artplayer_path):
                        with open(artplayer_path, "r", encoding="utf-8") as f:
                            artplayer_js = f.read()

                    html_content = f"""
                    <!DOCTYPE html>
                    <html>
                    <head>
                        <title>{title_str}</title>
                        <meta charset="UTF-8" />
                        <script>{artplayer_js}</script>
                        <style>
                            body {{ background-color: black; margin: 0; padding: 0; color: white; }}
                            .artplayer-app {{ width: 100vw; height: 100vh; }}
                        </style>
                    </head>
                    <body>
                        <div class="artplayer-app"></div>
                        <script>
                            if (window.ArtPlayer) {{
                                var art = new ArtPlayer({{
                                    container: '.artplayer-app',
                                    url: '{final_url}',
                                    title: '{title_str}',
                                    autoplay: true,
                                    setting: true,
                                    playbackRate: true,
                                    aspectRatio: true,
                                    audio: [{{ default: true, html: 'Default Track', url: '{final_url}' }}],
                                }});
                            }} else {{
                                document.body.innerHTML = '<video src="{final_url}" controls autoplay style="width:100%; height:100%;"></video>';
                            }}
                        </script>
                    </body>
                    </html>
                    """
                    with open(temp_html, "w", encoding="utf-8") as f:
                        f.write(html_content)
                    
                    self.after(0, lambda: webbrowser.open(f"file:///{os.path.abspath(temp_html)}"))
                    self.after(0, lambda: self.status_label.configure(text="Status: Opened Browser Player", text_color="cyan"))
                else: 
                    self.after(0, lambda: self.status_label.configure(text="Status: No links found", text_color="orange"))
            except Exception as e:
                print(f"Browser player error: {e}")
                self.after(0, lambda: self.status_label.configure(text="Status: Error", text_color="red"))
        threading.Thread(target=task, daemon=True).start()

    def play_video_now(self, url):
        self.status_label.configure(text="Status: Launching VLC player...", text_color="cyan")
        
        try:
            title = self.current_meta.get("title", "Video Player")
            if getattr(sys, 'frozen', False):
                # In frozen state, launcher handles 'player_window' subcommand
                subprocess.Popen([sys.executable, "player_window", url, title])
            else:
                curr_dir = os.path.dirname(os.path.abspath(__file__))
                player_script = os.path.join(curr_dir, "player_window.py")
                subprocess.Popen([sys.executable, player_script, url, title])
            
            self.after(1000, lambda: self.status_label.configure(text="Status: Online", text_color="green"))
        except Exception as e:
            print(f"Player launch failed: {e}")
            self.after(0, lambda: self.status_label.configure(text="Status: Player Error", text_color="red"))
            self.after(0, lambda: self.status_label.configure(text="Status: Launch failed", text_color="red"))

    def close_detail_view(self):
        self.detail_view.grid_forget()
        self.sidebar_frame.grid(row=0, column=0, sticky="nsew")
        self.main_content.grid(row=0, column=1, sticky="nsew", padx=20, pady=20)
        self.status_label.configure(text="Status: Online 🟢", text_color="green")

if __name__ == "__main__":
    PersonalEntertainmentApp().mainloop()
