import urllib.request
import re
import json

url = "https://www.imdb.com/title/tt30387012/"
req = urllib.request.Request(
    url, 
    headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
    }
)
try:
    with urllib.request.urlopen(req, timeout=5) as response:
        html = response.read().decode('utf-8')
        print("Status:", response.status)
        ld_match = re.search(r'<script type="application/ld\+json">(.*?)</script>', html, re.DOTALL)
        if ld_match:
            print("Found json!")
        else:
            print("No json found.")
except Exception as e:
    print("Error:", e)
