import sys
import webview
import logging
import os
import json
import subprocess
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
import urllib.parse

# Setup logging
logging.basicConfig(filename='player_debug.log', level=logging.DEBUG, 
                    format='%(asctime)s - %(levelname)s - %(message)s')

class AudioStreamHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        query = urllib.parse.urlparse(self.path).query
        params = urllib.parse.parse_qs(query)
        url = params.get('url', [None])[0]
        index = params.get('index', [None])[0]
        
        if not url or not index:
            self.send_error(400, "Missing url or index")
            return
            
        self.send_response(200)
        self.send_header('Content-Type', 'audio/mpeg')
        self.send_header('Transfer-Encoding', 'chunked')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        base = os.path.dirname(sys.executable) if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__))
        ffmpeg_bin = "ffmpeg"
        local_ffmpeg = os.path.join(base, "ffmpeg.exe")
        if os.path.exists(local_ffmpeg): ffmpeg_bin = local_ffmpeg
            
        cmd = [ffmpeg_bin, "-i", url, "-map", f"0:{index}", "-c:a", "libmp3lame", "-f", "mp3", "pipe:1"]
        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        try:
            while True:
                chunk = process.stdout.read(4096)
                if not chunk: break
                self.wfile.write(chunk)
        except Exception as e:
            logging.error(f"Streaming error: {e}")
        finally:
            process.terminate()

def start_audio_server():
    server = HTTPServer(('127.0.0.1', 0), AudioStreamHandler)
    port = server.server_port
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    return port

def play_video(url, title, audio_tracks_json="[]"):
    logging.info(f"Starting player for URL: {url}")
    audio_tracks = json.loads(audio_tracks_json)
    port = start_audio_server() if audio_tracks else None
    
    # Path to local artplayer.js
    if getattr(sys, 'frozen', False):
        curr_dir = os.path.dirname(sys.executable)
    else:
        curr_dir = os.path.dirname(os.path.abspath(__file__))
    artplayer_path = os.path.join(curr_dir, "artplayer.js")
    
    # Load ArtPlayer locally for offline and reliable access
    with open(artplayer_path, "r", encoding="utf-8") as f:
        artplayer_js = f.read()

    # Prepare external audio tracks for ArtPlayer
    external_audio_js = "[]"
    if port and audio_tracks:
        ext_tracks = []
        for t in audio_tracks:
            ext_url = f"http://127.0.0.1:{port}/audio?url={urllib.parse.quote(url)}&index={t['index']}"
            ext_tracks.append({"html": t['label'], "url": ext_url})
        external_audio_js = json.dumps(ext_tracks)

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>{title}</title>
        <meta charset="UTF-8" />
        <script>{artplayer_js}</script>
        <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
        <style>
            body {{
                background-color: black;
                margin: 0;
                padding: 0;
                overflow: hidden;
            }}

            .artplayer-app {{
                width: 100vw;
                height: 100vh;
            }}

            /* 🎨 Modern UI */
            .art-video-player {{
                border-radius: 12px;
                overflow: hidden;
            }}

            .art-control {{
                backdrop-filter: blur(10px);
            }}

            .title-overlay {{
                position: absolute;
                bottom: 80px;
                left: 20px;
                color: white;
                font-size: 18px;
                font-weight: bold;
                z-index: 10;
            }}
        </style>
    </head>

    <body>
    <div class="artplayer-app"></div>

    <script>
    try {{
        var externalTracks = {external_audio_js};

        var art = new ArtPlayer({{
            container: '.artplayer-app',
            url: '{url}',
            title: '{title}',

            autoplay: true,
            autoSize: true,

            // 🎨 UI
            theme: '#00d1ff',
            backdrop: true,
            miniProgressBar: true,

            // ⚙️ Features
            playbackRate: true,
            aspectRatio: true,
            fullscreen: true,
            fullscreenWeb: true,
            pip: true,
            hotkey: true,
            setting: true,

            // ⚡ Smart UX
            autoPlayback: true,
            autoOrientation: true,
            fastForward: true,

            // 🎮 Custom Controls
            controls: [
                {{
                    name: 'rewind',
                    position: 'left',
                    html: '⏪ 10s',
                    click: () => art.currentTime -= 10
                }},
                {{
                    name: 'forward',
                    position: 'left',
                    html: '10s ⏩',
                    click: () => art.currentTime += 10
                }},
                {{
                    name: 'next',
                    position: 'right',
                    html: 'Next ▶',
                    click: () => alert('Next Episode')
                }}
            ],

            // 🎬 Overlay UI
            layers: [
                {{
                    html: '<div class="title-overlay">{title}</div>'
                }},
                {{
                    html: '<div style="background: rgba(255,77,77,0.8);color:white;padding:8px 15px;border-radius:5px;cursor:pointer;position:absolute;top:20px;right:20px;z-index:999;">CLOSE ✕</div>',
                    click: function () {{
                        if (window.pywebview?.api) {{
                            window.pywebview.api.close();
                        }} else {{
                            window.close();
                        }}
                    }}
                }}
            ],

            // 🎥 HLS Support
            customType: {{
                m3u8: function (video, url) {{
                    if (Hls.isSupported()) {{
                        const hls = new Hls();
                        hls.loadSource(url);
                        hls.attachMedia(video);

                        // 🎧 Multi Audio
                        hls.on(Hls.Events.MANIFEST_PARSED, function () {{
                            if (hls.audioTracks?.length > 1) {{
                                art.setting.add({{
                                    width: 200,
                                    name: 'audio',
                                    column: 'Audio Tracks',
                                    selector: hls.audioTracks.map((t, i) => ({{
                                        default: i === hls.audioTrack,
                                        html: t.name || t.lang || 'Track ' + (i + 1),
                                        id: i
                                    }})),
                                    onSelect: (item) => {{
                                        hls.audioTrack = item.id;
                                        return item.html;
                                    }}
                                }});
                            }}
                        }});

                    }} else if (video.canPlayType('application/vnd.apple.mpegurl')) {{
                        video.src = url;
                    }}
                }}
            }},

            moreVideoAttr: {{
                crossOrigin: 'anonymous',
                playsInline: true,
            }}
        }});

        // ✅ READY EVENT
        art.on('ready', () => {{
            console.log('Player Ready');

            // 🎧 External Audio Tracks (MKV extracted)
            if (externalTracks?.length > 0) {{
                art.setting.add({{
                    width: 200,
                    name: 'external-audio',
                    column: 'MKV Audio',
                    selector: externalTracks.map((t, i) => ({{
                        default: i === 0,
                        html: t.html,
                        url: t.url
                    }})),
                    onSelect: (item) => {{
                        art.switchAudio(item.url, item.html);
                        return item.html;
                    }}
                }});
            }}

            // 🎹 Keyboard Shortcuts
            document.addEventListener('keydown', (e) => {{
                if (e.key === 'ArrowRight') art.currentTime += 10;
                if (e.key === 'ArrowLeft') art.currentTime -= 10;
                if (e.key === ' ') {{
                    e.preventDefault();
                    art.toggle();
                }}
            }});
        }});

    }} catch (e) {{
        console.error('Player Crash:', e);

        // 🛟 Fallback
        document.body.innerHTML =
            '<video src="{url}" controls autoplay style="width:100%;height:100%;"></video>';
    }}
    </script>

    </body>
    </html>
    """
    
    class API:
        def close(self):
            window.destroy()
            
    api = API()
    
    try:
        data_dir = os.path.join(os.getcwd(), 'webview_cache')
        if not os.path.exists(data_dir): os.makedirs(data_dir)
        
        window = webview.create_window(title, html=html, width=640, height=480, fullscreen=False, js_api=api)
        webview.start(debug=False, storage_path=data_dir)
    except Exception as e:
        logging.error(f"Failed to start webview: {e}", exc_info=True)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        u = sys.argv[1]
        t = sys.argv[2] if len(sys.argv) > 2 else "Video Player"
        tracks = sys.argv[3] if len(sys.argv) > 3 else "[]"
        play_video(u, t, tracks)
