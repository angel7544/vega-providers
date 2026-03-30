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

        document.getElementById("detailTitle").textContent = currentMeta.title || "Unknown Title";
        document.getElementById("detailSynopsis").textContent =
            currentMeta.description || currentMeta.synopsis || "No synopsis available.";
        
        const posterImg = currentMeta.image || "";
        document.getElementById("detailPoster").src = posterImg;
        
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
        const btn = document.createElement("button");
        btn.className = "stream-btn";
        btn.textContent = group.title || "Play";

        btn.onclick = () => {
            if (group.episodesLink) {
                loadEpisodes(group.episodesLink, currentProvider);
            } else {
                const link = group.directLinks?.[0]?.link || group.link;
                if (link) {
                    playStream(link, currentProvider);
                } else {
                    alert("No direct link or episodes link found.");
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
        
        container.innerHTML = `<h4 style="grid-column: 1/-1; margin-bottom: 10px;">Select Episode</h4>`;
        
        if (!episodes || !episodes.length) {
            container.innerHTML += "<p style='color: var(--text-dim)'>No episodes found.</p>";
            return;
        }

        episodes.forEach(ep => {
            const btn = document.createElement("button");
            btn.className = "ep-btn";
            btn.textContent = ep.title || "Episode";
            btn.onclick = () => playStream(ep.link, provider);
            container.appendChild(btn);

            // Add to download section too as a scan button
            const dlBtn = document.createElement("button");
            dlBtn.className = "download-btn";
            dlBtn.innerHTML = `<i data-lucide="search-code"></i> Extract: ${ep.title}`;
            dlBtn.onclick = () => resolveDownload(ep.link, provider, ep.title);
            dlContainer.appendChild(dlBtn);
        });
        
        lucide.createIcons();

    } catch (err) {
        console.error(err);
        container.innerHTML = "<p style='color: #ef4444'>Failed to load episodes.</p>";
    }
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
        if (group.episodesLink) return; // Downloads for episodes are handled in loadEpisodes

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
        if (!resp.ok) return [];
        return await resp.json();
    } catch (err) {
        console.error("Resolve error:", err);
        return [];
    }
}

async function playStream(link, provider) {
    setStatus("Extracting stream...", "#8b5cf6");

    const streams = await getResolvedStreams(link, provider);
    console.log("🎥 RESOLVED STREAMS:", streams);

    const streamUrl = extractStreamUrl(streams);

    if (!streamUrl) {
        alert("⚠️ No playable stream found. This source might be IP-locked or expired.");
        setStatus("Online");
        return;
    }

    setStatus("Online", "#22c55e");
    initPlayer({ link: streamUrl });
}

async function resolveDownload(link, provider, title) {
    const dlContainer = document.getElementById("downloadContainer");
    dlContainer.innerHTML = `<div class="loader" style="min-height: 50px;"><div class="spinner" style="width:20px;height:20px;border-width:2px;"></div><p style="font-size:12px;">Extracting links for ${title}...</p></div>`;

    const streams = await getResolvedStreams(link, provider);
    
    dlContainer.innerHTML = "";
    if (!streams || !streams.length) {
        dlContainer.innerHTML = "<p style='color: #ef4444; font-size:13px;'>Failed to extract direct download links.</p>";
        return;
    }

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
function initPlayer(stream) {
    switchPage('pagePlayer');
    document.getElementById("playerTitleDisplay").innerText = currentMeta?.title || "Video Player";

    const isM3u8 = stream.link.includes(".m3u8");
    const isGDrive = stream.link.includes("googleusercontent.com");

    if (player) {
        player.destroy(false);
        player = null;
        document.getElementById('artplayer-app').innerHTML = ''; // Ensure clean slate
    }

    console.log("🎬 INITIALIZING ARTPLAYER:", stream.link);

    // Initialize Artplayer with HLS.js custom type
    player = new Artplayer({
        container: '#artplayer-app',
        url: stream.link,
        title: currentMeta?.title || "Video Player",
        type: isM3u8 ? 'm3u8' : (isGDrive ? 'mp4' : 'auto'),
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
        theme: '#8b5cf6', // Matches Accent Color
        customType: {
            m3u8: function (video, url, art) {
                if (Hls.isSupported()) {
                    if (art.hls) art.hls.destroy();
                    const hls = new Hls({
                        maxBufferLength: 120, // MASSIVE caching buffer (120 seconds ahead)
                        maxMaxBufferLength: 600, // Absolute max memory cache
                        maxBufferSize: 120 * 1000 * 1000, // 120MB chunk memory limit
                        xhrSetup: function (xhr, url) {
                            // Can inject headers here if proxying
                        }
                    });
                    
                    hls.on(Hls.Events.ERROR, function (event, data) {
                        if (data.fatal) {
                            switch (data.type) {
                                case Hls.ErrorTypes.MEDIA_ERROR:
                                    console.log('Fatal media error encountered, attempting to recover...');
                                    hls.recoverMediaError();
                                    break;
                                case Hls.ErrorTypes.NETWORK_ERROR:
                                    console.log('Fatal network error encountered, attempting to restart load...');
                                    hls.startLoad();
                                    break;
                                default:
                                    console.error('Unrecoverable HLS error:', data);
                                    hls.destroy();
                                    break;
                            }
                        }
                    });

                    hls.loadSource(url);
                    hls.attachMedia(video);
                    art.hls = hls; // Keep ref to destroy later safely
                    art.on('destroy', () => hls.destroy());
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = url;
                } else {
                    art.notice.show = 'Unsupported HLS format on this browser';
                }
            }
        }
    });

    player.on('video:error', () => {
        if (isGDrive) {
            alert("⚠️ Google Drive Video failed to load.\n\nThis is a known Serverless limitation. The server grabbed the link from one IP, but your browser is playing it from another, causing Google to block it (403 Forbidden). Try another provider.");
        } else {
            alert("⚠️ Video failed to play.\nThis stream might be a blocked MKV format, or network blocked (CORS).");
        }
    });
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