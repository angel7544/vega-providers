import sys
import webview
import logging
import os

# Setup logging to a file for debugging
logging.basicConfig(filename='player_debug.log', level=logging.DEBUG, 
                    format='%(asctime)s - %(levelname)s - %(message)s')

def play_video(url, title):
    logging.info(f"Starting player for URL: {url} with title: {title}")
    
    # Path to local artplayer.js
    if getattr(sys, 'frozen', False):
        curr_dir = os.path.dirname(sys.executable)
    else:
        curr_dir = os.path.dirname(os.path.abspath(__file__))
    artplayer_path = os.path.join(curr_dir, "artplayer.js")
    
    # Load ArtPlayer locally for offline and reliable access
    with open(artplayer_path, "r", encoding="utf-8") as f:
        artplayer_js = f.read()

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <title>{title}</title>
        <meta charset="UTF-8" />
        <script>{artplayer_js}</script>
        <style>
            body {{ background-color: black; margin: 0; padding: 0; overflow: hidden; }}
            .artplayer-app {{ width: 100vw; height: 100vh; }}
        </style>
    </head>
    <body>
        <div class="artplayer-app"></div>
        <script>
            try {{
                var art = new ArtPlayer({{
                    container: '.artplayer-app',
                    url: '{url}',
                    title: '{title}',
                    autoplay: true,
                    autoSize: true,
                    playbackRate: true,
                    aspectRatio: true,
                    setting: true,
                    hotkey: true,
                    pip: true,
                    fullscreen: true,
                    fullscreenWeb: true,
                    lock: true,
                    fastForward: true,
                    autoPlayback: true,
                    autoOrientation: true,
                    audio: [
                        {{
                            default: true,
                            html: 'Default Audio',
                            url: '{url}',
                        }}
                    ],
                    moreVideoAttr: {{
                        crossOrigin: 'anonymous',
                        playsInline: true,
                    }},
                }});

                art.on('ready', () => {{
                    console.log('ArtPlayer Ready');
                    // Check if browser exposes multiple audio tracks
                    const video = art.video;
                    if (video.audioTracks && video.audioTracks.length > 1) {{
                        console.log('Detected ' + video.audioTracks.length + ' tracks');
                    }}
                }});

            }} catch (e) {{
                console.error('ArtPlayer Crash:', e);
                // Last ditch fallback to native video tag
                document.body.innerHTML = '<video src="{url}" controls autoplay style="width:100%; height:100%;"></video>';
            }}
        </script>
    </body>
    </html>
    """
    
    try:
        data_dir = os.path.join(os.getcwd(), 'webview_cache')
        if not os.path.exists(data_dir): os.makedirs(data_dir)
        
        window = webview.create_window(title, html=html, width=1280, height=720)
        webview.start(debug=True, storage_path=data_dir)
    except Exception as e:
        logging.error(f"Failed to start webview: {e}", exc_info=True)

if __name__ == "__main__":
    if len(sys.argv) > 1:
        play_video(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "Video Player")
