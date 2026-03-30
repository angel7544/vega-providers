// ============================
// ⚙️ CONFIGURATION & STATE
// ============================
let API_BASE = localStorage.getItem('vega_api_url') || "";
const getApiUrl = () => {
    let url = API_BASE ? API_BASE : window.location.origin;
    if (url.endsWith('/')) url = url.slice(0, -1);
    return url;
};

let currentProvider = localStorage.getItem('orbix_last_provider') || "__all__";
let currentMeta = null;
let player = null;
let providersMap = {};
let tmdbKey = localStorage.getItem('tmdb_api_key') || "";

// Init icons
lucide.createIcons();

// Elements
const providerSelect = document.getElementById('providerSelect');
const contentGrid = document.getElementById('contentGrid');
const searchInput = document.getElementById('searchInput');
const statusText = document.getElementById('statusText');
const catalogContainer = document.getElementById('catalogContainer');

// Pages
const pageBrowse = document.getElementById('pageBrowse');
const pageDetails = document.getElementById('pageDetails');
const pagePlayer = document.getElementById('pagePlayer');

// Settings Elements
const settingsModal = document.getElementById('settingsModal');
const apiUrlInput = document.getElementById('apiUrlInput');


// ============================
// 🔄 PAGE ROUTING & SETTINGS
// ============================
function switchPage(pageId) {
    document.querySelectorAll('.page-view').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    
    // Quick fix to ensure body scroll is natural
    if (pageId === 'pagePlayer') {
        document.body.style.overflow = 'hidden';
    } else {
        document.body.style.overflow = 'auto';
    }
}

function goBackToBrowse() {
    switchPage('pageBrowse');
}

function openSettingsModal() {
    apiUrlInput.value = localStorage.getItem('vega_api_url') || "";
    settingsModal.style.display = "flex";
    setTimeout(() => settingsModal.classList.add('active'), 10);
}

function closeSettingsModal() {
    settingsModal.classList.remove('active');
    setTimeout(() => settingsModal.style.display = "none", 300);
}

function saveSettings() {
    let val = apiUrlInput.value.trim();
    if (val.endsWith('/')) val = val.slice(0, -1);
    localStorage.setItem('vega_api_url', val);
    
    let tmdbVal = document.getElementById('tmdbKeyInput')?.value.trim() || "";
    localStorage.setItem('tmdb_api_key', tmdbVal);

    closeSettingsModal();
    window.location.reload();
}

function loadHome() { fetchData(""); updateActiveNav(0); switchPage('pageBrowse'); }
function loadMovies() { fetchData("movie"); updateActiveNav(1); switchPage('pageBrowse'); }
function loadSeries() { fetchData("tv"); updateActiveNav(2); switchPage('pageBrowse'); }

function updateActiveNav(index) {
    const links = document.querySelectorAll('.nav-link');
    links.forEach((l, i) => i === index ? l.classList.add('active') : l.classList.remove('active'));
}

// ============================
// 🚀 LOAD PROVIDERS
// ============================
async function loadProviders() {
    try {
        setStatus("Connecting...", "#8b5cf6");

        const resp = await fetch(`${getApiUrl()}/manifest.json`);
        if (!resp.ok) throw new Error("Manifest not accessible");
        
        const providers = await resp.json();

        providerSelect.innerHTML = "";
        providersMap = {};

        const allOpt = document.createElement('option');
        allOpt.value = "__all__";
        allOpt.textContent = "All Providers 🌐";
        providerSelect.appendChild(allOpt);

        providers.forEach(p => {
            providersMap[p.value] = p;

            const opt = document.createElement('option');
            opt.value = p.value;
            opt.textContent = p.display_name;
            if (p.value === currentProvider) opt.selected = true;
            providerSelect.appendChild(opt);
        });

        providerSelect.onchange = async (e) => {
            currentProvider = e.target.value;
            localStorage.setItem('orbix_last_provider', currentProvider);

            if (currentProvider === "__all__") {
                catalogContainer.innerHTML = "";
                fetchData("");
            } else {
                await loadCatalog();
            }
        };

        if (currentProvider !== "__all__") {
            await loadCatalog();
        }
        
        fetchData("");
        setStatus("Online");

    } catch (err) {
        console.error(err);
        setStatus("Offline. Check API Settings.", "#ef4444");
    }
}

// ============================
// 📂 LOAD CATALOG
// ============================
async function loadCatalog() {
    try {
        catalogContainer.innerHTML = `<div class="spinner" style="width:24px;height:24px;border-width:2px;margin:0"></div>`;

        const resp = await fetch(`${getApiUrl()}/catalog?provider=${currentProvider}`);
        if (!resp.ok) throw new Error();

        const data = await resp.json();
        renderCatalog(data.catalog || [], data.genres || []);

    } catch {
        catalogContainer.innerHTML = "";
        fetchData("");
    }
}

function renderCatalog(catalog, genres) {
    catalogContainer.innerHTML = "";

    [...catalog, ...genres].forEach(section => {
        const btn = document.createElement("button");
        btn.className = "catalog-btn";
        btn.textContent = section.title;
        btn.onclick = () => {
            document.querySelectorAll('.catalog-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            fetchData(section.filter);
        };
        catalogContainer.appendChild(btn);
    });
}

// ============================
// 🔍 FETCH DATA
// ============================
async function fetchData(filter, search = false) {
    setStatus("Fetching...", "#8b5cf6");
    switchPage('pageBrowse'); // Ensure we are on browse page

    contentGrid.innerHTML = `
        <div class="loader">
            <div class="spinner"></div>
            <p>Scanning library...</p>
        </div>
    `;

    try {
        const func = search ? "getSearchPosts" : "getPosts";
        const params = search
            ? { searchQuery: filter, page: 1 }
            : { filter, page: 1 };

        let results = [];

        if (currentProvider === "__all__") {
            const providers = Object.keys(providersMap);

            const all = await Promise.all(
                providers.map(p =>
                    fetch(`${getApiUrl()}/fetch`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ provider: p, functionName: func, params })
                    })
                        .then(r => r.json())
                        .then(d => (Array.isArray(d) ? d : []).map(i => ({ ...i, __provider: p })))
                        .catch(() => [])
                )
            );

            results = all.flat();

            const map = new Map();
            results.forEach(i => {
                const key = (i.title + (i.type || "")).toLowerCase();
                if (!map.has(key)) map.set(key, i);
            });

            results = [...map.values()];

        } else {
            const resp = await fetch(`${getApiUrl()}/fetch`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ provider: currentProvider, functionName: func, params })
            });

            results = await resp.json();
        }

        renderGrid(results);
        setStatus(results.length ? "Online" : "No results");

    } catch (err) {
        console.error(err);
        setStatus("Fetch Error", "#ef4444");
    }
}

// ============================
// 🖥️ GRID
// ============================
function renderGrid(items) {
    contentGrid.innerHTML = "";

    if (!items?.length) {
        contentGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--text-dim);">
                <i data-lucide="ghost" style="width: 48px; height: 48px; margin-bottom: 16px;"></i>
                <p>No results found</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    items.forEach(item => {
        const card = document.createElement("div");
        card.className = "media-card";

        card.onclick = () => {
            const provider = item.__provider || currentProvider;
            showDetails(item.link, provider);
        };

        card.innerHTML = `
            <div class="media-poster-container">
                <img class="media-poster" src="${item.image}" loading="lazy"
                onerror="this.src='https://via.placeholder.com/300x450?text=No+Image'">
                <div class="media-overlay">
                    <div class="media-title">${item.title}</div>
                    <div class="media-meta">
                        <span>${item.type || 'Media'}</span>
                        ${item.__provider ? `<span style="color:var(--accent)">${item.__provider}</span>` : ""}
                    </div>
                </div>
            </div>
        `;

        contentGrid.appendChild(card);
    });
}

// ============================
// 📽️ DETAILS
// ============================
async function showDetails(link, provider) {
    window.scrollTo(0, 0); // scroll to top when opening details
    
    currentProvider = provider;
    switchPage('pageDetails');
    
    // Clear old details while loading
    document.getElementById("detailTitle").textContent = "Loading...";
    document.getElementById("detailSynopsis").textContent = "";
    document.getElementById("detailPoster").src = "";
    document.getElementById("linksContainer").innerHTML = `<div class="loader"><div class="spinner"></div></div>`;

    try {
        const resp = await fetch(`${getApiUrl()}/fetch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                provider,
                functionName: "getMeta",
                params: { link }
            })
        });

        currentMeta = await resp.json();

        // 🎬 Ultra-Minimalist UI
        const parsed = parseMediaInfo(currentMeta.title);
        document.getElementById("detailTitle").textContent = parsed.title;
        document.getElementById("detailSynopsis").textContent =
            currentMeta.description || currentMeta.synopsis || "No synopsis available.";
        
        const posterImg = currentMeta.image || "";
        document.getElementById("detailPoster").src = posterImg;

        // Hide Rating/Year placeholders (already hidden in CSS/HTML but ensuring state here)
        document.getElementById("detailRating").textContent = "";
        document.getElementById("detailYear").textContent = "";

        // Render Gallery
        renderGallery(currentMeta);

        // Update backdrop safely
        if (posterImg) {
            document.getElementById("detailBackdrop").style.backgroundImage = `url(${posterImg})`;
        } else {
            document.getElementById("detailBackdrop").style.backgroundImage = 'none';
        }

        renderLinks(currentMeta);
        renderDownloads(currentMeta);

    } catch (err) {
        console.error("Details fetch error:", err);
        document.getElementById("detailTitle").textContent = "Failed to load Details";
        document.getElementById("linksContainer").innerHTML = "<p>Stream retrieval failed.</p>";
    }
}

// ============================
// 🌟 PREMIUM METADATA TOOLS
// ============================
function parseMediaInfo(rawTitle) {
    if (!rawTitle) return { title: "Unknown", meta: [] };
    let title = rawTitle.replace(/^Download\s+/i, "");
    const meta = [];

    const seasonMatch = title.match(/(Season\s*\d+(?:\s*[–-]\s*\d+)?|\bS\d+(?:[–-]\d+)?\b)/i);
    if (seasonMatch) {
        meta.push({ type: 'season', text: seasonMatch[0].trim() });
        title = title.replace(seasonMatch[0], "");
    }

    const qualities = title.match(/\b(480p|720p|1080p|2160p|4K|SDR|HDR|BluRay|WEB-DL|HDRip)\b/gi);
    if (qualities) {
        [...new Set(qualities)].forEach(q => meta.push({ type: 'quality', text: q.toUpperCase() }));
        qualities.forEach(q => title = title.replace(new RegExp(`\\b${q}\\b`, 'gi'), ""));
    }

    const audioTags = title.match(/({[\w\-\s]+}|\[[\w\-\s]+\]|\b(?:Dual|Multi|Hindi|English|Tamil|Telugu|Dual Audio|Multi Audio)\b)/gi);
    if (audioTags) {
        audioTags.forEach(tag => {
            if (!/Episode|Added|Series|Movie/i.test(tag)) {
                meta.push({ type: 'audio', text: tag.replace(/[{}[\]]/g, "").trim() });
                title = title.replace(tag, "");
            }
        });
    }

    const epMatch = title.match(/\[\s*Episode\s*(\d+)\s*Added\s*\]/i);
    if (epMatch) {
        meta.push({ type: 'episode', text: `Ep ${epMatch[1]}` });
        title = title.replace(epMatch[0], "");
    }

    title = title
        .replace(/\b(Series|Movie|JioHotstar|Netflix|Amazon|Hotstar|Zee5|SonyLiv|Disney\+|Apple\s*TV)\b/gi, "")
        .replace(/[\{\}\(\)\[\]]/g, " ") // replace stray brackets with space
        .replace(/[–\-+|&/·•]+/g, " ") // replace symbols with space
        .replace(/\s+/g, " ") // normalize spacing
        .trim();

    return { title: title || rawTitle, meta };
}

async function fetchTmdbMetadata(query) {
    try {
        const resp = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${tmdbKey}&query=${encodeURIComponent(query)}`);
        const data = await resp.json();
        const item = data.results?.[0];
        if (!item) {
            fetchTvMazeMetadata(query); // try TVMaze if TMDB fails
            return;
        }
        // ... rest of the existing TMDB logic ...
        applyMetadataToUi({
            title: item.title || item.name,
            overview: item.overview,
            poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : null,
            backdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` : null,
            rating: item.vote_average,
            year: (item.release_date || item.first_air_date || "").split('-')[0],
            type: item.media_type === 'tv' ? 'Series' : 'Movie'
        });
    } catch (e) { fetchTvMazeMetadata(query); }
}

async function fetchTvMazeMetadata(query) {
    try {
        const resp = await fetch(`https://api.tvmaze.com/singlesearch/shows?q=${encodeURIComponent(query)}`);
        if (!resp.ok) return;
        const item = await resp.json();
        
        console.log("📺 TVMAZE MATCH:", item);
        
        applyMetadataToUi({
            title: item.name,
            overview: item.summary?.replace(/<[^>]*>/g, ""), // strip HTML
            poster: item.image?.medium || item.image?.original,
            backdrop: item.image?.original,
            rating: item.rating?.average,
            year: (item.premiered || "").split('-')[0],
            type: 'Series'
        });
    } catch (e) { console.error("TVMaze error", e); }
}

function applyMetadataToUi(data) {
    if (data.title) document.getElementById("detailTitle").textContent = data.title;
    if (data.overview) document.getElementById("detailSynopsis").textContent = data.overview;
    
    if (data.poster) {
        document.getElementById("detailPoster").src = data.poster;
    }
    
    if (data.backdrop) {
        document.getElementById("detailBackdrop").style.backgroundImage = 
            `linear-gradient(to bottom, rgba(5,5,5,0.4), rgba(5,5,5,1)), url(${data.backdrop})`;
    }
    
    if (data.rating) {
        document.getElementById("detailRating").innerHTML = `<i data-lucide="star" style="width:12px;height:12px;display:inline-block;fill:#f59e0b;color:#f59e0b"></i> ${data.rating.toFixed(1)}`;
    }
    
    if (data.year) document.getElementById("detailYear").textContent = data.year;
    if (data.type) document.getElementById("detailProvider").textContent = data.type;

    lucide.createIcons();
}

function renderGallery(meta) {
    const container = document.getElementById("galleryContainer");
    const section = document.getElementById("gallerySection");
    container.innerHTML = "";

    const images = meta.images || meta.screenShots || meta.screenshots || [];
    
    if (!images || images.length === 0) {
        section.style.display = "none";
        return;
    }

    section.style.display = "block";
    images.forEach(img => {
        const item = document.createElement("div");
        item.className = "gallery-item";
        item.onclick = () => window.open(img, '_blank');
        
        const image = document.createElement("img");
        image.className = "gallery-img";
        image.src = img;
        image.loading = "lazy";
        
        item.appendChild(image);
        container.appendChild(item);
    });
}

// ============================
// 🔗 LINKS & EPISODES
// ============================
function renderLinks(meta) {
    const container = document.getElementById("linksContainer");
    container.innerHTML = "";

    if (!meta.linkList || !meta.linkList.length) {
         if (meta.episodes || meta.seasons) {
             container.innerHTML = "<p>Data structure has episodes but it's not handled by the default provider output format natively yet.</p>";
         } else {
             container.innerHTML = "<p style='color: var(--text-dim)'>No playable streams found.</p>";
         }
         return;
    }

    meta.linkList.forEach(group => {
        const title = group.title || "Play";
        const isSeries = group.episodesLink || /(Season|Episodes|S\d+|^S\d|Series|Ep\s*\d+|Episode)/i.test(title);

        const btn = document.createElement("button");
        btn.className = "stream-btn";
        btn.textContent = title;

        btn.onclick = () => {
            if (isSeries) {
                // If we already have direct links (like UHDMovies/Vegamovies), use them instantly!
                if (group.directLinks && group.directLinks.length > 0) {
                    renderEpisodeList(group.directLinks, currentProvider);
                } else {
                    loadEpisodes(group.episodesLink || group.link, currentProvider);
                }
            } else {
                const link = group.directLinks?.[0]?.link || group.link;
                if (link) {
                    playStream(link, currentProvider);
                } else {
                    alert("No direct link found.");
                }
            }
        };

        container.appendChild(btn);
    });
}

async function loadEpisodes(episodesUrl, provider) {
    const container = document.getElementById("linksContainer");
    const dlContainer = document.getElementById("downloadContainer");
    
    container.innerHTML = `<div class="loader" style="min-height: 100px;"><div class="spinner"></div></div>`;
    dlContainer.innerHTML = "";

    try {
        const resp = await fetch(`${getApiUrl()}/fetch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                provider,
                functionName: "getEpisodes",
                params: { url: episodesUrl }
            })
        });

        const episodes = await resp.json();
        renderEpisodeList(episodes, provider, episodesUrl);

    } catch (err) {
        console.error("Episode load error:", err);
        container.innerHTML = `
            <p style='color: #ef4444'>Failed to load episode list.</p>
            <button class="catalog-btn" style="margin-top:10px" onclick="playStream('${episodesUrl}', '${provider}')">
                Try playing as direct stream
            </button>
        `;
    }
}

function renderEpisodeList(episodes, provider, fallbackUrl = "") {
    const container = document.getElementById("linksContainer");
    const dlContainer = document.getElementById("downloadContainer");
    
    container.innerHTML = `<h4 style="grid-column: 1/-1; margin-bottom: 10px;">Select Episode</h4>`;
    dlContainer.innerHTML = "";
    
    if (!episodes || !episodes.length) {
        container.innerHTML += "<p style='color: var(--text-dim)'>No episodes found.</p>";
        if (fallbackUrl) {
            const btn = document.createElement("button");
            btn.className = "catalog-btn";
            btn.style.marginTop = "10px";
            btn.textContent = "Try playing as direct stream";
            btn.onclick = () => playStream(fallbackUrl, provider);
            container.appendChild(btn);
        }
        return;
    }

    episodes.forEach(ep => {
        const row = document.createElement("div");
        row.className = "ep-row";

        const btn = document.createElement("button");
        btn.className = "ep-btn";
        btn.textContent = ep.title || "Episode";
        btn.onclick = () => playStream(ep.link, provider);
        
        const dlBtn = document.createElement("button");
        dlBtn.className = "ep-btn-dl";
        dlBtn.innerHTML = `<i data-lucide="download"></i>`;
        dlBtn.title = "Extract Download Links";
        dlBtn.onclick = () => {
            document.getElementById("downloadSection").scrollIntoView({ behavior: 'smooth' });
            resolveDownload(ep.link, provider, ep.title);
        };

        row.appendChild(btn);
        row.appendChild(dlBtn);
        container.appendChild(row);
    });
    
    lucide.createIcons();
}

function renderDownloads(meta) {
    const container = document.getElementById("downloadContainer");
    const section = document.getElementById("downloadSection");
    container.innerHTML = "";

    if (!meta.linkList || !meta.linkList.length) {
        section.style.display = "none";
        return;
    }

    section.style.display = "block";

    meta.linkList.forEach(group => {
        const title = group.title || "";
        const isSeries = group.episodesLink || /(Season|Episodes|S\d+|^S\d|Series|Ep\s*\d+|Episode)/i.test(title);
        
        if (isSeries) return; // Downloads for episodes are handled inside loadEpisodes results

        const firstLink = group.directLinks?.[0]?.link || group.link;
        if (!firstLink) return;

        const btn = document.createElement("button");
        btn.className = "download-btn";
        btn.innerHTML = `<i data-lucide="search-code"></i> ${group.title || "Scan Download Links"}`;
        btn.onclick = () => resolveDownload(firstLink, currentProvider, group.title || "Media");
        container.appendChild(btn);
    });
    
    lucide.createIcons();
}

// ============================
// 🎥 EXTRACT STREAM
// ============================
function extractStreamUrl(data) {
    if (!data) return null;

    if (Array.isArray(data)) return extractStreamUrl(data[0]);

    if (data.link) return data.link;
    if (data.file) return data.file;
    if (data.url) return data.url;

    if (data.sources?.length) return data.sources[0].file;
    if (data.data) return extractStreamUrl(data.data);

    return null;
}

// ============================
// 📺 RESOLVE & PLAY
// ============================
async function getResolvedStreams(link, provider) {
    try {
        const resp = await fetch(`${getApiUrl()}/fetch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                provider,
                functionName: "getStream",
                params: { link, type: currentMeta?.type }
            })
        });

        if (!resp.ok) {
            const errorData = await resp.json().catch(() => ({}));
            if (errorData.isCloudflare || resp.status === 403) {
                console.warn("🛑 RENDER BLOCKED BY CLOUDFLARE. SWITCHING TO HYBRID EXTRACTION...");
                return await tryHybridExtraction(link, provider);
            }
            return [];
        }
        return await resp.json();
    } catch (err) {
        console.error("Resolve error:", err);
        return [];
    }
}

async function tryHybridExtraction(link, provider) {
    try {
        setStatus("Bypassing Cloudflare...", "#3b82f6");
        
        // Use AllOrigins to fetch the HTML via user's browser IP
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(link)}`;
        const browserResp = await fetch(proxyUrl);
        const browserData = await browserResp.json();
        const html = browserData.contents;

        if (!html) throw new Error("Failed to fetch HTML via browser proxy");

        // Send HTML to backend for parsing
        const parseResp = await fetch(`${getApiUrl()}/parse`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                provider,
                functionName: "getStream",
                params: { link, type: currentMeta?.type },
                html: html
            })
        });

        if (!parseResp.ok) return [];
        return await parseResp.json();
    } catch (err) {
        console.error("Hybrid Extraction failed:", err);
        return [];
    }
}

async function playStream(link, provider) {
    setStatus("Extracting stream...", "#8b5cf6");

    const streams = await getResolvedStreams(link, provider);
    console.log("🎥 RESOLVED STREAMS:", streams);

    if (!streams || !streams.length) {
        alert("⚠️ No playable stream found. This source might be IP-locked or expired.");
        setStatus("Online");
        return;
    }

    setStatus("Online", "#22c55e");
    initPlayer(streams); // Pass entire array for fallback
}

async function resolveDownload(link, provider, title) {
    const dlContainer = document.getElementById("downloadContainer");
    dlContainer.innerHTML = `<div class="loader" style="min-height: 50px;"><div class="spinner" style="width:20px;height:20px;border-width:2px;"></div><p style="font-size:12px;">Extracting links for ${title}...</p></div>`;

    const streams = await getResolvedStreams(link, provider);
    
    dlContainer.innerHTML = "";
    if (!streams || !streams.length) {
        dlContainer.innerHTML = "<p style='color: #ef4444; font-size:13px;'>Failed to extract direct download links.</p>";
        
        const retryBtn = document.createElement("button");
        retryBtn.className = "catalog-btn";
        retryBtn.style.gridColumn = "1/-1";
        retryBtn.style.marginTop = "10px";
        retryBtn.innerHTML = `<i data-lucide="refresh-cw"></i> Try Again / Back`;
        retryBtn.onclick = () => renderDownloads(currentMeta);
        dlContainer.appendChild(retryBtn);
        lucide.createIcons();
        return;
    }

    // Add a back button
    const backBtn = document.createElement("button");
    backBtn.className = "catalog-btn";
    backBtn.style.gridColumn = "1/-1";
    backBtn.style.marginBottom = "10px";
    backBtn.innerHTML = `<i data-lucide="arrow-left"></i> Back to Scan Buttons`;
    backBtn.onclick = () => renderDownloads(currentMeta);
    dlContainer.appendChild(backBtn);

    streams.forEach(s => {
        const btn = document.createElement("button");
        btn.className = "download-btn";
        const qualityText = s.quality ? ` [${s.quality}p]` : "";
        btn.innerHTML = `<i data-lucide="external-link"></i> ${s.server}${qualityText}`;
        btn.onclick = () => window.open(s.link, '_blank');
        dlContainer.appendChild(btn);
    });
    
    lucide.createIcons();
}

// ============================
// 🎬 PLAYER
// ============================
function initPlayer(streams) {
    let currentStreamIndex = 0;
    let isTranscoding = false;
    let currentAudioTrack = null;
    switchPage('pagePlayer');

    function startPlayback() {
        if (currentStreamIndex >= streams.length) {
            alert(`⚠️ All playback attempts failed.\n\nThis source might be blocked by Cloudflare (Backend) or your Browser (Frontend).\n\nPossible fixes:\n1. Try another source if available.\n2. Enable "Premium Audio (Transcode)" to force server-side fetch.\n3. Make sure you are using the latest providers.`);
            closePlayer();
            document.getElementById("downloadSection").scrollIntoView({ behavior: 'smooth' });
            return;
        }

        const stream = streams[currentStreamIndex];
        let streamUrl = extractStreamUrl(stream);

        if (!streamUrl) {
            console.warn("Empty stream URL, skipping...");
            currentStreamIndex++;
            startPlayback();
            return;
        }

        // If local transcoding is enabled AND link isn't already proxied, route through server
        if (isTranscoding && !streamUrl.includes("/stream?")) {
            const baseUrl = getApiUrl();
            const proxyUrl = `${baseUrl}/stream?url=${encodeURIComponent(streamUrl)}&transcode=true&referer=${encodeURIComponent(streamUrl)}`;
            streamUrl = proxyUrl;
        }

        document.getElementById("playerTitleDisplay").innerText = 
            `[Source ${currentStreamIndex + 1}/${streams.length}] ` + (currentMeta?.title || "Video Player");

        const isM3u8 = streamUrl.toLowerCase().includes(".m3u8") && !isTranscoding;
        const isMp4 = streamUrl.toLowerCase().includes(".mp4") || streamUrl.includes("googleusercontent.com") || isTranscoding;

        if (player) {
            player.destroy(false);
            player = null;
            document.getElementById('artplayer-app').innerHTML = ''; 
        }

        console.log(`🎬 INITIALIZING ARTPLAYER (Source ${currentStreamIndex + 1}):`, streamUrl);

        player = new Artplayer({
            container: '#artplayer-app',
            url: streamUrl,
            title: currentMeta?.title || "Video Player",
            type: isM3u8 ? 'm3u8' : (isMp4 ? 'mp4' : 'auto'),
            autoplay: true,
            autoSize: false,
            autoMini: true,
            playbackRate: true,
            aspectRatio: true,
            setting: true,
            hotkey: true,
            pip: true,
            mutex: true,
            fullscreen: true,
            fullscreenWeb: true,
            subtitleOffset: true,
            miniProgressBar: true,
            playsInline: true,
            muted: true, 
            volume: 0.7,
            autoOrientation: true,
            theme: '#8b5cf6', 
            settings: [
                {
                    html: 'Premium Audio (Transcode)',
                    icon: '<i data-lucide="zap" style="width:16px;height:16px;color:#8b5cf6"></i>',
                    switch: isTranscoding,
                    onSwitch: function (item) {
                        isTranscoding = !item.switch;
                        console.log("🛠 Transcoding toggled:", isTranscoding);
                        startPlayback(); // Restart with proxy
                        return isTranscoding;
                    },
                }
            ],
            customType: {
                m3u8: function (video, url, art) {
                    if (Hls.isSupported()) {
                        if (art.hls) art.hls.destroy();
                        const hls = new Hls({
                            maxBufferLength: 120,
                            maxMaxBufferLength: 600,
                            maxBufferSize: 120 * 1000 * 1000,
                        });
                        
                        hls.on(Hls.Events.MANIFEST_PARSED, function () {
                            const tracks = hls.audioTracks;
                            if (tracks && tracks.length > 1) {
                                art.setting.add({
                                    name: 'audio-tracks',
                                    html: 'Audio Tracks',
                                    icon: '<i data-lucide="languages" style="width:16px;height:16px"></i>',
                                    selector: tracks.map((track, index) => ({
                                        html: track.name || track.lang || `Track ${index + 1}`,
                                        trackIndex: index,
                                        default: index === hls.audioTrack,
                                    })),
                                    onSelect: function (item) {
                                        hls.audioTrack = item.trackIndex;
                                        return item.html;
                                    },
                                });
                                lucide.createIcons();
                            }
                        });

                        hls.on(Hls.Events.ERROR, function (event, data) {
                            if (data.fatal) {
                                switch (data.type) {
                                    case Hls.ErrorTypes.MEDIA_ERROR:
                                        hls.recoverMediaError();
                                        break;
                                    case Hls.ErrorTypes.NETWORK_ERROR:
                                        hls.startLoad();
                                        break;
                                    default:
                                        hls.destroy();
                                        break;
                                }
                            }
                        });

                        hls.loadSource(url);
                        hls.attachMedia(video);
                        art.hls = hls;
                        art.on('destroy', () => hls.destroy());
                    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                        video.src = url;
                    }
                }
            }
        });

        // Detect Audio Tracks for non-HLS streams via Backend
        if (!isM3u8 && !isTranscoding) {
            const audioInfoUrl = `${getApiUrl()}/audio-info?url=${encodeURIComponent(streamUrl)}&referer=${encodeURIComponent(streamUrl)}`;
            fetch(audioInfoUrl)
                .then(r => r.json())
                .then(data => {
                    if (data.audioTracks && data.audioTracks.length > 1) {
                        player.setting.add({
                            name: 'audio-tracks-manual',
                            html: 'Select Audio Track',
                            icon: '<i data-lucide="mic" style="width:16px;height:16px"></i>',
                            selector: data.audioTracks.map(track => ({
                                html: `${track.title} (${track.codec})`,
                                audioIndex: track.index,
                            })),
                            onSelect: function (item) {
                                isTranscoding = true; // Must transcode to switch specific tracks on non-HLS
                                currentAudioTrack = item.audioIndex;
                                startPlayback();
                                return item.html;
                            },
                        });
                        lucide.createIcons();
                    }
                }).catch(() => {});
        }

        // Automated Source Fallback
        player.on('video:error', () => {
             if (currentStreamIndex < streams.length - 1) {
                 console.warn(`❌ Stream ${currentStreamIndex + 1} failed. Trying alternative...`);
                 currentStreamIndex++;
                 setStatus(`Trying Source ${currentStreamIndex + 1}...`, "#f59e0b");
                 startPlayback();
             } else {
                 console.error("❌ All streams failed.");
                 alert("⚠️ All playback attempts failed.\n\nThis source might be fully geoblocked or have broken links on Render.\n\nPlease try another provider or check if you can play it on Localhost.");
                 closePlayer();
             }
        });

        // Initialize icons after setting up the player
        setTimeout(() => lucide.createIcons(), 100);
    }

    startPlayback();
}

function closePlayer() {
    if (player) {
        player.pause();
        player.destroy(false);
        player = null;
        document.getElementById('artplayer-app').innerHTML = ''; 
    }
    // Return to details screen
    switchPage('pageDetails');
}

// ============================
// 🛠️ UTILS
// ============================
function setStatus(text, color = "#22c55e") {
    if (statusText) {
        statusText.textContent = text;
        statusText.style.color = color;
    }
}

function search() {
    const q = searchInput.value.trim();
    if (q) fetchData(q, true);
}

// 🚀 START
loadProviders();