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

# Configuration file for persistence
CONFIG_FILE = "config.json"

class PersonalEntertainmentApp(ctk.CTk):
    def __init__(self):
        super().__init__()

        self.title("Personal Entertainment Hub")
        self.geometry("1100x700")

        # Set appearance mode and color theme
        ctk.set_appearance_mode("Dark")
        ctk.set_default_color_theme("blue")

        # Initialize data
        self.server_url = "http://localhost:3001"
        self.current_provider_value = "vega"
        self.providers_display = []
        self.provider_map = {} # display_name -> value
        self.image_cache = {}
        self.settings = self.load_settings()
        self.current_provider_value = self.settings.get("last_provider", "vega")

        # Configure grid
        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)

        # Create sidebar
        self.sidebar_frame = ctk.CTkFrame(self, width=200, corner_radius=0)
        self.sidebar_frame.grid(row=0, column=0, sticky="nsew")
        self.sidebar_frame.grid_rowconfigure(4, weight=1)

        self.logo_label = ctk.CTkLabel(self.sidebar_frame, text="Vega Hub", font=ctk.CTkFont(size=20, weight="bold"))
        self.logo_label.grid(row=0, column=0, padx=20, pady=(20, 10))

        self.home_button = ctk.CTkButton(self.sidebar_frame, text="Home", command=self.show_home)
        self.home_button.grid(row=1, column=0, padx=20, pady=10)

        self.trending_button = ctk.CTkButton(self.sidebar_frame, text="Trending", command=lambda: self.fetch_data("trending"))
        self.trending_button.grid(row=2, column=0, padx=20, pady=10)

        self.settings_button = ctk.CTkButton(self.sidebar_frame, text="Settings", command=self.show_settings)
        self.settings_button.grid(row=3, column=0, padx=20, pady=10)

        # Provider Selector in Sidebar
        self.provider_label = ctk.CTkLabel(self.sidebar_frame, text="Select Provider:")
        self.provider_label.grid(row=5, column=0, padx=20, pady=(20, 0))
        
        self.provider_menu = ctk.CTkOptionMenu(self.sidebar_frame, values=["Loading..."], command=self.change_provider)
        self.provider_menu.grid(row=6, column=0, padx=20, pady=(10, 20))

        # Main content area
        self.main_content = ctk.CTkFrame(self, corner_radius=0, fg_color="transparent")
        self.main_content.grid(row=0, column=1, sticky="nsew", padx=20, pady=20)
        self.main_content.grid_columnconfigure(0, weight=1)
        self.main_content.grid_rowconfigure(2, weight=1)

        # Top bar with Search
        self.top_bar = ctk.CTkFrame(self.main_content, fg_color="transparent")
        self.top_bar.grid(row=0, column=0, sticky="ew", pady=(0, 20))
        self.top_bar.grid_columnconfigure(0, weight=1)

        self.search_entry = ctk.CTkEntry(self.top_bar, placeholder_text="Search movies, series...")
        self.search_entry.grid(row=0, column=0, sticky="ew", padx=(0, 10))
        self.search_entry.bind("<Return>", lambda e: self.search())

        self.search_button = ctk.CTkButton(self.top_bar, text="Search", width=100, command=self.search)
        self.search_button.grid(row=0, column=1)

        # Media scroll area
        self.media_scroll = ctk.CTkScrollableFrame(self.main_content, label_text="Results")
        self.media_scroll.grid(row=1, column=0, sticky="nsew")
        self.media_scroll.grid_columnconfigure((0, 1, 2, 3), weight=1)

        # Detail View
        self.detail_view = ctk.CTkFrame(self, corner_radius=0)
        self.detail_view.grid_columnconfigure(1, weight=1)
        self.detail_view.grid_rowconfigure(0, weight=1)

        # Status Bar
        self.status_label = ctk.CTkLabel(self, text="Status: Online", font=ctk.CTkFont(size=12))
        self.status_label.place(relx=0.5, rely=0.98, anchor="s")

        # Runtime state
        self.current_meta = None
        self.current_item_type = "movie"

        # Load providers and initial data
        self.load_providers()
        self.show_home()

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
            try:
                resp = requests.get(f"{self.server_url}/manifest.json")
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
            except Exception as e:
                print(f"Error loading providers: {e}")
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
        self.status_label.configure(text="Settings saved.", text_color="green")

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
        for index, item in enumerate(data):
            row = index // 4
            col = index % 4
            card = ctk.CTkFrame(self.media_scroll, width=220, height=360)
            card.grid(row=row, column=col, padx=10, pady=10)
            card.grid_propagate(False)
            
            poster_label = ctk.CTkLabel(card, text="Loading...", width=200, height=240, fg_color="#333", corner_radius=8)
            poster_label.pack(pady=10)
            
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
                        img = ctk.CTkImage(light_image=img_data, dark_image=img_data, size=(200, 240))
                        self.image_cache[url] = img
                    self.after(0, lambda: lbl.configure(image=img, text="") if lbl.winfo_exists() else None)
                except:
                    self.after(0, lambda: lbl.configure(text="No Image") if lbl.winfo_exists() else None)

            threading.Thread(target=load_img, args=(item.get("image"),), daemon=True).start()
            title = item.get("title", "Unknown")
            if len(title) > 30: title = title[:27] + "..."
            ctk.CTkLabel(card, text=title, font=ctk.CTkFont(size=12, weight="bold"), wraplength=180).pack(padx=10)
            ctk.CTkButton(card, text="Details", height=32, command=lambda u=item["link"]: self.get_stream_info(u)).pack(pady=10)

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
            
        left_frame = ctk.CTkFrame(self.detail_view, width=300, fg_color="transparent")
        left_frame.grid(row=0, column=0, sticky="n", padx=20, pady=20)
        self.right_frame = ctk.CTkScrollableFrame(self.detail_view, label_text="Select Quality / Episodes")
        self.right_frame.grid(row=0, column=1, sticky="nsew", padx=20, pady=20)
        
        ctk.CTkButton(left_frame, text="← Back to Home", command=self.close_detail_view).pack(pady=(0, 20), fill="x")
        
        poster_url = info.get("image", "")
        detail_poster = ctk.CTkLabel(left_frame, text="Poster", width=250, height=350, fg_color="#333", corner_radius=10)
        detail_poster.pack(pady=10)
        def load_large_img(url, lbl=detail_poster):
            if not url: return
            try:
                resp = requests.get(url, stream=True, timeout=5)
                img = ctk.CTkImage(Image.open(io.BytesIO(resp.content)), size=(250, 350))
                self.after(0, lambda: lbl.configure(image=img, text=""))
            except: pass
        threading.Thread(target=load_large_img, args=(poster_url,), daemon=True).start()
        
        ctk.CTkLabel(left_frame, text=info.get("title", ""), font=ctk.CTkFont(size=18, weight="bold"), wraplength=250).pack(pady=10)
        syn_lbl = ctk.CTkLabel(left_frame, text=info.get("synopsis", "")[:200]+"...", font=ctk.CTkFont(size=12), wraplength=250, justify="left")
        syn_lbl.pack(pady=10)

        is_series = self.current_item_type == "series"
        link_list = info.get("linkList", [])
        if not link_list:
            ctk.CTkLabel(self.right_frame, text="No links found.", text_color="orange").pack(pady=20)
            return

        for group in link_list:
            g_title = group.get("title", "Download Link")
            if group.get("quality"): g_title += f" [{group['quality']}]"
            ctk.CTkLabel(self.right_frame, text=g_title, font=ctk.CTkFont(size=14, weight="bold"), anchor="w").pack(pady=(10, 5), fill="x", padx=10)

            if is_series and group.get("episodesLink"):
                ctk.CTkButton(self.right_frame, text="View Episodes", fg_color="#2c3e50", 
                             command=lambda u=group["episodesLink"]: self.fetch_episodes(u)).pack(pady=5, fill="x", padx=20)
            else:
                for d_link in group.get("directLinks", []):
                    f = ctk.CTkFrame(self.right_frame)
                    f.pack(pady=2, fill="x", padx=10)
                    ctk.CTkButton(f, text=f"▶ App", width=60, height=28, 
                                 command=lambda u=d_link["link"]: self.extract_and_play(u)).grid(row=0, column=0, padx=2, pady=5)
                    ctk.CTkButton(f, text="🌐 Web", width=60, height=28, fg_color="#2c3e50",
                                 command=lambda u=d_link["link"]: self.extract_and_open_browser(u, title=d_link.get('title'))).grid(row=0, column=1, padx=2, pady=5)
                    ctk.CTkButton(f, text="🧡 VLC", width=60, height=28, fg_color="#d35400",
                                 command=lambda u=d_link["link"]: self.extract_and_vlc(u)).grid(row=0, column=2, padx=2, pady=5)
                    ctk.CTkButton(f, text="📋", width=35, height=28, fg_color="gray",
                                 command=lambda u=d_link["link"]: self.extract_and_copy(u)).grid(row=0, column=3, padx=2, pady=5)

    def fetch_episodes(self, url):
        self.status_label.configure(text="Status: Fetching episodes...", text_color="yellow")
        def task():
            try:
                payload = {"provider": self.current_provider_value, "functionName": "getEpisodes", "params": {"url": url}}
                resp = requests.post(f"{self.server_url}/fetch", json=payload)
                if resp.status_code == 200:
                    self.after(0, lambda: self.show_episodes_view(resp.json()))
                    self.after(0, lambda: self.status_label.configure(text="Status: Online", text_color="green"))
            except: self.after(0, lambda: self.status_label.configure(text="Status: Fetch failed", text_color="red"))
        threading.Thread(target=task, daemon=True).start()

    def show_episodes_view(self, episodes):
        for widget in self.right_frame.winfo_children(): widget.destroy()
        self.right_frame.configure(label_text="Episode Selection")
        ctk.CTkButton(self.right_frame, text="← Back to Qualities", fg_color="transparent", text_color="gray", 
                     command=self.show_meta_view).pack(pady=(0, 10), anchor="w", padx=10)
        
        grid_frame = ctk.CTkFrame(self.right_frame, fg_color="transparent")
        grid_frame.pack(pady=10, fill="both", expand=True, padx=10)
        grid_frame.grid_columnconfigure((0, 1), weight=1)
        for i, ep in enumerate(episodes):
            row, col = i // 2, i % 2
            f = ctk.CTkFrame(grid_frame)
            f.grid(row=row, column=col, padx=5, pady=5, sticky="ew")
            f.grid_columnconfigure(0, weight=1)
            ctk.CTkButton(f, text=ep.get("title", f"Ep {i+1}"), height=32,
                         command=lambda u=ep["link"]: self.extract_and_play(u)).grid(row=0, column=0, padx=2, pady=5, sticky="ew")
            
            f_btns = ctk.CTkFrame(f, fg_color="transparent")
            f_btns.grid(row=0, column=1, padx=2)
            ctk.CTkButton(f_btns, text="🌐", width=35, height=32, fg_color="#2c3e50",
                         command=lambda u=ep["link"]: self.extract_and_open_browser(u, title=ep.get('title'))).grid(row=0, column=0, padx=1)
            ctk.CTkButton(f_btns, text="🧡", width=35, height=32, fg_color="#d35400",
                         command=lambda u=ep["link"]: self.extract_and_vlc(u)).grid(row=0, column=1, padx=1)
            ctk.CTkButton(f_btns, text="📋", width=35, height=32, fg_color="gray",
                         command=lambda u=ep["link"]: self.extract_and_copy(u)).grid(row=0, column=2, padx=1)

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
                    if os.path.exists("artplayer.js"):
                        with open("artplayer.js", "r", encoding="utf-8") as f:
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
        self.status_label.configure(text="Status: Launching player...", text_color="cyan")
        try:
            curr_dir = os.path.dirname(os.path.abspath(__file__))
            player_script = os.path.join(curr_dir, "player_window.py")
            subprocess.Popen([sys.executable, player_script, url, self.current_meta.get("title", "Video Player")])
            self.after(2000, lambda: self.status_label.configure(text="Status: Playing", text_color="green"))
        except Exception as e:
            print(f"Launch failed: {e}")
            self.after(0, lambda: self.status_label.configure(text="Status: Launch failed", text_color="red"))

    def close_detail_view(self):
        self.detail_view.grid_forget()
        self.sidebar_frame.grid(row=0, column=0, sticky="nsew")
        self.main_content.grid(row=0, column=1, sticky="nsew", padx=20, pady=20)
        self.status_label.configure(text="Status: Online", text_color="green")

if __name__ == "__main__":
    PersonalEntertainmentApp().mainloop()
