import re
import requests
import json
import urllib.parse

def fetch_imdb_meta_test(title):
    try:
        q = urllib.parse.quote_plus(title.lower())
        
        # Method 1: standard search via OMDB if possible, but we don't have api key.
        # Let's try to query the suggestion API first to get the TT id reliably
        first_letter = title.lower()[0] if title else 'a'
        sug_url = f"https://v3.sg.media-imdb.com/suggestion/x/{first_letter}/{title.lower().replace(' ', '%20')}.json"
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5"
        }

        print(f"Fetching suggestion: {sug_url}")
        sug_resp = requests.get(sug_url, headers=headers, timeout=5)
        print(f"Suggestion Status: {sug_resp.status_code}")
        
        imdb_id = None
        if sug_resp.status_code == 200:
            data = sug_resp.json()
            if "d" in data and len(data["d"]) > 0:
                imdb_id = data["d"][0]["id"]
                print(f"Found IMDb ID: {imdb_id} via Suggestion API")
        
        if not imdb_id:
            # Fallback to standard search page (often gets 403/captcha now)
            search_url = f"https://www.imdb.com/find/?q={q}&ref_=fn_nv_srb_sm"
            print(f"Fetching search page: {search_url}")
            resp = requests.get(search_url, headers=headers, timeout=5)
            print(f"Search Status: {resp.status_code}")
            matches = re.findall(r'href="/title/(tt\d+)/', resp.text)
            if matches:
                imdb_id = matches[0]
                print(f"Found IMDb ID: {imdb_id} via Search html")
        
        if not imdb_id:
            print("Could not find IMDb ID")
            return

        # Now fetch the title page for ratings
        title_url = f"https://www.imdb.com/title/{imdb_id}/"
        print(f"Fetching title page: {title_url}")
        page_resp = requests.get(title_url, headers=headers, timeout=5)
        print(f"Title Status: {page_resp.status_code}")
        
        ld_match = re.search(r'<script type="application/ld\+json">(.*?)</script>', page_resp.text, re.DOTALL)
        if ld_match:
            try:
                ld_data = json.loads(ld_match.group(1))
                if isinstance(ld_data, list):
                    for item in ld_data:
                        if "aggregateRating" in item:
                            ld_data = item
                            break
                    else:
                        ld_data = ld_data[0]
                
                agg = ld_data.get("aggregateRating", {})
                rating = str(agg.get("ratingValue", "N/A"))
                vcount = agg.get("ratingCount", "N/A")
                if vcount != "N/A" and vcount:
                    votes = f"{int(vcount):,}"
                else:
                    votes = "N/A"
                print(f"Rating: {rating}, Votes: {votes}")
                return rating, votes
            except Exception as e:
                print(f"JSON Parse Error: {e}")
        else:
            print("No ld+json script tag found in HTML")
            
    except Exception as e:
        print(f"Global Error: {e}")

fetch_imdb_meta_test("Border 2")
