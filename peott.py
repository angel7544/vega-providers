import webview
import requests
import json
import os
import sys
import threading
import subprocess
import shutil
import zipfile
import urllib.parse
import time
import webbrowser

# IMPORTANT: Fix for "maximum recursion depth exceeded" on Windows
# Storing objects (like window) on the JsApi instance causes circular serialization loops.
# We store app state in a module-level dictionary instead.
sys.setrecursionlimit(10000)

if getattr(sys, 'frozen', False):
    DATA_DIR = sys._MEIPASS
    USER_DIR = os.path.dirname(sys.executable)
else:
    DATA_DIR = os.path.dirname(os.path.abspath(__file__))
    USER_DIR = DATA_DIR

CONFIG_FILE = os.path.join(USER_DIR, "config.json")
UI_DIR = os.path.join(DATA_DIR, "ui")


API_STATE = {
    "window": None,
    "settings": {},
    "server_url": "http://localhost:3001",
    "player_process": None
}


def load_settings():
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                API_STATE["settings"] = json.load(f)
                API_STATE["server_url"] = API_STATE["settings"].get("server_url", "http://localhost:3001")
        except Exception as e:
            print(f"[ERROR] load_settings: {e}")


def save_settings_file():
    try:
        with open(CONFIG_FILE, "w") as f:
            json.dump(API_STATE["settings"], f, indent=2)
    except Exception as e:
        print(f"[ERROR] save_settings_file: {e}")


class JsApi:
    """Methods exposed to JavaScript as window.pywebview.api.*"""

    def get_settings(self):
        print("[API] get_settings")
        return API_STATE["settings"]

    def save_settings(self, data):
        print(f"[API] save_settings -> {data}")
        API_STATE["settings"].update(data)
        API_STATE["server_url"] = API_STATE["settings"].get("server_url", "http://localhost:3001")
        save_settings_file()
        return {"ok": True}

    def get_providers(self):
        print(f"[API] get_providers (server: {API_STATE['server_url']})")
        for attempt in range(15):
            try:
                resp = requests.get(f"{API_STATE['server_url']}/manifest.json", timeout=3)
                if resp.status_code == 200:
                    providers = [p for p in resp.json() if not p.get("disabled")]
                    print(f"[SUCCESS] Found {len(providers)} providers")
                    return providers
            except Exception as e:
                print(f"[RETRY] ({attempt + 1}/15) Loading providers: {e}")
                time.sleep(2)
        return []

    def fetch_media(self, provider, filter_text, page, is_search):
        print(f"[API] fetch_media -> provider:{provider}, query:'{filter_text}', search:{is_search}")
        try:
            func = "getSearchPosts" if is_search else "getPosts"
            params = ({"searchQuery": filter_text, "page": page} if is_search 
                      else {"filter": filter_text, "page": page})
            payload = {"provider": provider, "functionName": func, "params": params}
            
            resp = requests.post(f"{API_STATE['server_url']}/fetch", json=payload, timeout=20)
            if resp.status_code == 200:
                data = resp.json()
                print(f"[SUCCESS] Fetched {len(data)} items")
                return data
            print(f"[ERROR] Backend status: {resp.status_code}")
        except Exception as e:
            print(f"[ERROR] fetch_media: {e}")
        return []

    def get_meta(self, provider, link):
        print(f"[API] get_meta -> provider:{provider}, link:{link}")
        try:
            payload = {"provider": provider, "functionName": "getMeta", "params": {"link": link}}
            resp = requests.post(f"{API_STATE['server_url']}/fetch", json=payload, timeout=20)
            if resp.status_code == 200:
                data = resp.json()
                keys = list(data.keys())
                print(f"[SUCCESS] get_meta keys: {keys}")
                # Check for buried episodes/seasons
                ep_keys = [k for k in keys if k.lower() in ["episodes", "seasons", "chapters", "series_list"]]
                if ep_keys:
                    print(f"[INFO] Detected potential episodes in meta: {ep_keys}")
                return data
            print(f"[ERROR] get_meta status: {resp.status_code}")
        except Exception as e:
            print(f"[ERROR] get_meta: {e}")
        return {}

    def get_episodes(self, provider, url):
        print(f"[API] get_episodes -> provider:{provider}, url:{url}")
        try:
            payload = {"provider": provider, "functionName": "getEpisodes", "params": {"url": url}}
            resp = requests.post(f"{API_STATE['server_url']}/fetch", json=payload, timeout=20)
            if resp.status_code == 200:
                return resp.json()
        except Exception as e:
            print(f"[ERROR] get_episodes: {e}")
        return []

    def _get_stream_url(self, provider, link, item_type, pref_exts=None):
        if pref_exts is None: pref_exts = [".mkv", ".mp4", ".webm", ".avi", ".mov"]
        # Normalize item_type to lowercase (expected by many providers)
        normal_type = str(item_type).lower()
        print(f"[DEBUG] _get_stream_url -> link:{link}, type:{normal_type}")
        
        try:
            payload = {"provider": provider, "functionName": "getStream", "params": {"link": link, "type": normal_type}}
            resp = requests.post(f"{API_STATE['server_url']}/fetch", json=payload, timeout=25)
            if resp.status_code == 200:
                streams = resp.json()
                if streams:
                    print(f"[SUCCESS] Found {len(streams)} streams")
                    final_link = streams[0]["link"]
                    for ext in pref_exts:
                        for s in streams:
                            if ext in s["link"].lower():
                                print(f"[DEBUG] Selected preferred ext {ext}: {s['link'][:60]}...")
                                return s["link"]
                    print(f"[DEBUG] Selected default: {final_link[:60]}...")
                    return final_link
            print(f"[ERROR] Stream status: {resp.status_code}")
        except Exception as e:
            print(f"[ERROR] _get_stream_url: {e}")
        return None

    def play_app(self, provider, link, item_type, title=""):
        print(f"[API] play_app -> {title}")
        url = self._get_stream_url(provider, link, item_type)
        if url:
            threading.Thread(target=self._launch_player, args=(url, title), daemon=True).start()
            return {"ok": True}
        return {"error": "Link extraction failed (server or timeout)"}

    def _launch_player(self, url, title):
        print(f"[DEBUG] _launch_player(url={url[:60]}..., title={title})")
        try:
            # Enhanced Kill: Look for any running player_window.py processes
            self._force_terminate_player()

            if getattr(sys, 'frozen', False):
                # We are compiled to an EXE
                # In the new multi-EXE architecture, player.exe is a separate binary
                # in the same root folder as OrbixPlay.exe
                player_exe = os.path.join(USER_DIR, "player.exe")
                cmd = [player_exe, url, title]
            else:
                player_script = os.path.join(DATA_DIR, "player_window.py")
                if not os.path.exists(player_script):
                    print(f"[ERROR] Player script not found: {player_script}")
                    return
                cmd = [sys.executable, player_script, url, title]

                
            print(f"[SYSTEM] Executing: {' '.join(cmd)}")
            
            # Launch the player
            creation_flags = 0
            if sys.platform == "win32":
                # CREATE_NO_WINDOW = 0x08000000 
                # Prevents a separate console window when launching the player
                creation_flags = 0x08000000
                
            process = subprocess.Popen(cmd, creationflags=creation_flags)
            API_STATE["player_process"] = process
            print(f"[SUCCESS] Player process started (PID: {process.pid})")
            
        except Exception as e:
            print(f"[ERROR] Player launch exception: {e}")

    def _force_terminate_player(self):
        """Finds and kills any existing player_window.py processes."""
        try:
            if sys.platform == "win32":
                # Use taskkill to find and kill processes running player_window.py
                # We filter by command line if possible, or just kill all python processes that have our script in args
                import subprocess
                # This is a bit safer: kill by window title or just use powershell to be precise
                cmd = 'Get-WmiObject Win32_Process | Where-Object { ($_.Name -like "*python*" -or $_.Name -like "*OrbixPlay*" -or $_.Name -like "*player*") -and ($_.CommandLine -like "*player_window.py*" -or $_.CommandLine -like "*--player*") } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }'
                subprocess.run(["powershell", "-Command", cmd], capture_output=True)

                print("[SYSTEM] Cleaned up existing player processes via PowerShell")
            else:
                # Unix fallback
                if API_STATE["player_process"]:
                    API_STATE["player_process"].kill()
        except:
            pass

    def play_vlc(self, provider, link, item_type):
        print(f"[API] play_vlc -> {link}")
        # Strictly prioritize MKV for VLC if possible
        url = self._get_stream_url(provider, link, item_type, pref_exts=[".mkv", ".mp4"])
        if url:
            try:
                vlc_paths = [
                    os.path.join(DATA_DIR, "VLC", "vlc.exe"),
                    os.path.join(DATA_DIR, "vlc", "vlc.exe"),
                    r"C:\Program Files\VideoLAN\VLC\vlc.exe",
                    r"C:\Program Files (x86)\VideoLAN\VLC\vlc.exe",
                ]
                vlc_bin = next((p for p in vlc_paths if os.path.exists(p)), shutil.which("vlc") or "vlc")
                print(f"[DEBUG] Launching VLC: {vlc_bin}")
                subprocess.Popen([vlc_bin, url], shell=False)
                return {"ok": True}
            except Exception as e:
                print(f"[ERROR] VLC launch: {e}")
                return {"error": "VLC not found or failed to start."}
        return {"error": "Link extraction failed."}

    def open_browser(self, provider, link, item_type, title=""):
        print(f"[API] open_browser -> {title}")
        url = self._get_stream_url(provider, link, item_type)
        if url:
            title_str = title or "Video Player"
            artplayer_path = os.path.join(DATA_DIR, "artplayer.js")

            artplayer_js = ""
            if os.path.exists(artplayer_path):
                with open(artplayer_path, "r", encoding="utf-8") as f:
                    artplayer_js = f.read()
            html = f"""<!DOCTYPE html><html><head><title>{title_str}</title>
<meta charset="UTF-8"/><script>{artplayer_js}</script>
<style>body{{background:#000;margin:0;color:#fff}}.ap{{width:100vw;height:100vh}}video{{width:100%;height:100%}}</style>
</head><body><div class="ap"></div><script>
if(window.ArtPlayer){{new ArtPlayer({{container:'.ap',url:{json.dumps(url)},title:{json.dumps(title_str)},autoplay:true,setting:true,playbackRate:true,aspectRatio:true}});}}
else{{document.body.innerHTML='<video src={json.dumps(url)} controls autoplay style="width:100%;height:100%;"></video>';}}
</script></body></html>"""
            temp_html = os.path.join(USER_DIR, "browser_player.html")

            with open(temp_html, "w", encoding="utf-8") as f:
                f.write(html)
            webbrowser.open(f"file:///{os.path.abspath(temp_html)}")
            return {"ok": True}
        return {"error": "Link extraction failed."}

    def copy_link(self, provider, link, item_type):
        print(f"[API] copy_link -> {link}")
        url = self._get_stream_url(provider, link, item_type)
        if url:
            try:
                subprocess.run(["powershell", "-command", f"Set-Clipboard -Value {json.dumps(url)}"], 
                             check=True, capture_output=True)
                return {"ok": True, "url": url}
            except Exception as e:
                print(f"[ERROR] copy_link: {e}")
                return {"error": str(e)}
        return {"error": "Link extraction failed."}

    def check_ffmpeg(self):
        return (os.path.exists(os.path.join(USER_DIR, "ffmpeg.exe")) or
                os.path.exists(os.path.join(USER_DIR, "bin", "ffmpeg.exe")))


    def install_ffmpeg(self):
        def _run():
            try:
                zip_path = os.path.join(USER_DIR, "ffmpeg_temp.zip")

                url = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
                _evaluate_js("onFfmpegProgress('connecting', 0)")
                response = requests.get(url, stream=True, timeout=15)
                total_size = int(response.headers.get("content-length", 0))
                with open(zip_path, "wb") as f:
                    downloaded = 0
                    for chunk in response.iter_content(chunk_size=1024 * 1024):
                        if chunk:
                            f.write(chunk)
                            downloaded += len(chunk)
                            if total_size > 0:
                                pct = int((downloaded / total_size) * 100)
                                _evaluate_js(f"onFfmpegProgress('downloading', {pct})")
                _evaluate_js("onFfmpegProgress('extracting', 99)")
                with zipfile.ZipFile(zip_path, "r") as zf:
                    for member in zf.namelist():
                        if member.endswith("ffmpeg.exe") or member.endswith("ffprobe.exe"):
                            filename = os.path.basename(member)
                            with zf.open(member) as src, open(os.path.join(USER_DIR, filename), "wb") as dst:
                                shutil.copyfileobj(src, dst)
                if os.path.exists(zip_path): os.remove(zip_path)
                _evaluate_js("onFfmpegProgress('done', 100)")
            except Exception as e:
                print(f"[ERROR] FFmpeg install: {e}")
                _evaluate_js("onFfmpegProgress('error', 0)")
        threading.Thread(target=_run, daemon=True).start()
        return {"ok": True, "async": True}

    def fetch_imdb(self, title, item_type):
        try:
            first_letter = title.lower()[0] if title else "a"
            q_safe = urllib.parse.quote(title.lower())
            sug_url = f"https://v3.sg.media-imdb.com/suggestion/x/{first_letter}/{q_safe}.json"
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
            sug_resp = requests.get(sug_url, headers=headers, timeout=5)
            imdb_id = None
            if sug_resp.status_code == 200:
                data = sug_resp.json()
                if "d" in data and data["d"]: imdb_id = data["d"][0]["id"]
            if not imdb_id: return {"rating": "N/A"}
            tipo = "series" if str(item_type).lower() == "series" else "movie"
            meta_url = f"https://v3-cinemeta.strem.io/meta/{tipo}/{imdb_id}.json"
            meta_resp = requests.get(meta_url, headers=headers, timeout=5)
            rating = "N/A"
            if meta_resp.status_code == 200:
                rating = str(meta_resp.json().get("meta", {}).get("imdbRating", "N/A"))
            return {"rating": rating}
        except: return {"rating": "N/A"}

    def open_link(self, url):
        webbrowser.open(url)
        return {"ok": True}


def _evaluate_js(code):
    if API_STATE["window"]:
        try:
            API_STATE["window"].evaluate_js(code)
        except Exception: pass


def main():
    print("[SYSTEM] Starting Orbix Play...")
    load_settings()
    
    if not os.path.exists(UI_DIR):
        os.makedirs(UI_DIR, exist_ok=True)
        
    api = JsApi()
    ui_path = os.path.join(UI_DIR, "index.html")
    
    window = webview.create_window(
        title="Orbix Play",
        url=ui_path,
        js_api=api,
        width=1200,
        height=760,
        min_size=(900, 600),
        background_color="#0f0f11",
    )
    API_STATE["window"] = window
    
    print("[SYSTEM] WebView starting...")
    # Explicitly using edgechromium backend for Windows
    webview.start(debug=False, gui='edgechromium')


if __name__ == "__main__":
    main()


