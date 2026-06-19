const API_BASE = "http://localhost:3001";
const MANIFEST_URL = `${API_BASE}/manifest.json`;

let currentProvider = "VegaMovies";
let currentMeta = null;
let player = null;
let providersMap = {};

// Init icons
lucide.createIcons();

// Elements
const providerSelect = document.getElementById('providerSelect');
const contentGrid = document.getElementById('contentGrid');
const searchInput = document.getElementById('searchInput');
const statusText = document.querySelector('#statusText');
const catalogContainer = document.getElementById('catalogContainer');
const modalOverlay = document.getElementById('modalOverlay');

// ============================
// 🚀 LOAD PROVIDERS
// ============================
async function loadProviders() {
    try {
        setStatus("Loading...", "#8b5cf6");

        const resp = await fetch(MANIFEST_URL);
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
            providerSelect.appendChild(opt);
        });

        currentProvider = "__all__";

        providerSelect.onchange = async (e) => {
            currentProvider = e.target.value;

            if (currentProvider === "__all__") {
                catalogContainer.innerHTML = "";
                fetchData("");
            } else {
                await loadCatalog();
            }
        };

        fetchData("");
        setStatus("Online");

    } catch (err) {
        console.error(err);
        setStatus("Offline", "#ef4444");
    }
}

// ============================
// 📂 LOAD CATALOG
// ============================
async function loadCatalog() {
    try {
        catalogContainer.innerHTML = `<div class="spinner"></div>`;

        const resp = await fetch(`${API_BASE}/catalog?provider=${currentProvider}`);
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
        btn.onclick = () => fetchData(section.filter);
        catalogContainer.appendChild(btn);
    });
}

// ============================
// 🔍 FETCH DATA
// ============================
async function fetchData(filter, search = false) {
    setStatus("Fetching...", "#8b5cf6");

    contentGrid.innerHTML = `
        <div class="loader">
            <div class="spinner"></div>
            <p>Scanning multiverse...</p>
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
                    fetch(`${API_BASE}/fetch`, {
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
                i.title = cleanTitle(i.title);
                const key = (i.title + (i.type || "")).toLowerCase();
                if (!map.has(key)) map.set(key, i);
            });

            results = [...map.values()];

        } else {
            const resp = await fetch(`${API_BASE}/fetch`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ provider: currentProvider, functionName: func, params })
            });

            results = await resp.json();
            results.forEach(i => i.title = cleanTitle(i.title));
        }

        renderGrid(results);
        setStatus(results.length ? "Online" : "No results");

    } catch (err) {
        console.error(err);
        setStatus("Error", "#ef4444");
    }
}

// ============================
// 🖥️ GRID
// ============================
function renderGrid(items) {
    contentGrid.innerHTML = "";

    if (!items.length) {
        contentGrid.innerHTML = `<p>No results 🚫</p>`;
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
                <img src="${item.image}" loading="lazy"
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
    currentProvider = provider;

    modalOverlay.style.display = "flex";
    document.body.style.overflow = "hidden";

    try {
        const resp = await fetch(`${API_BASE}/fetch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                provider,
                functionName: "getMeta",
                params: { link }
            })
        });

        currentMeta = await resp.json();
        currentMeta.title = cleanTitle(currentMeta.title);

        document.getElementById("detailTitle").textContent = currentMeta.title;
        document.getElementById("detailSynopsis").textContent =
            currentMeta.description || currentMeta.synopsis || "No description.";
        document.getElementById("detailPoster").src = currentMeta.image || "";

        renderLinks(currentMeta);

    } catch (err) {
        console.error(err);
    }
}

// ============================
// 🔗 LINKS
// ============================
function renderLinks(meta) {
    const container = document.getElementById("linksContainer");
    container.innerHTML = "";

    meta.linkList?.forEach(group => {
        const btn = document.createElement("button");
        btn.className = "stream-btn";
        btn.textContent = group.title || "Play";

        btn.onclick = () => {
            const link =
                group.directLinks?.[0]?.link ||
                group.link;

            playStream(link, currentProvider);
        };

        container.appendChild(btn);
    });
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
// 📺 PLAY STREAM (SERVER MODAL)
// ============================
async function playStream(link, provider) {
    console.log("▶️ GET SERVERS:", link, provider);

    try {
        const resp = await fetch(`${API_BASE}/fetch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                provider,
                functionName: "getStream",
                params: { link, type: currentMeta?.type }
            })
        });

        let streams = await resp.json();
        console.log("🎥 RAW STREAM:", streams);

        // Normalize to array
        if (!Array.isArray(streams)) {
            streams = streams ? [streams] : [];
        }
        
        // Extract inner data if structured weirdly
        if (streams.length === 1 && streams[0].data && Array.isArray(streams[0].data)) {
            streams = streams[0].data;
        }

        if (!streams || streams.length === 0) {
            alert("No streams available ❌");
            return;
        }

        renderServerModal(streams);

    } catch (err) {
        console.error(err);
        alert("Error fetching streams ❌");
    }
}

function renderServerModal(streams) {
    const container = document.getElementById("serverOptionsContainer");
    container.innerHTML = "";

    streams.forEach(stream => {
        const streamUrl = stream.link || stream.file || stream.url || (stream.sources && stream.sources[0]?.file);
        if (!streamUrl) return;

        const serverName = stream.server || stream.name || stream.title || "Stream";
        const quality = stream.quality || "Auto";

        const card = document.createElement("div");
        card.className = "server-option-card";
        
        card.innerHTML = `
            <div class="server-option-header">
                <span>${serverName}</span>
                <span class="quality-badge">${quality}</span>
            </div>
            <div class="server-actions">
                <button class="action-btn btn-play" onclick="playSelectedStream('${streamUrl}')">
                    <i data-lucide="play" style="width: 16px; height: 16px;"></i> Play
                </button>
                <button class="action-btn btn-download" onclick="downloadSelectedStream('${streamUrl}')">
                    <i data-lucide="download" style="width: 16px; height: 16px;"></i> Download
                </button>
            </div>
        `;
        container.appendChild(card);
    });
    
    lucide.createIcons();
    document.getElementById("serverModalOverlay").style.display = "flex";
}

function closeServerModal() {
    document.getElementById("serverModalOverlay").style.display = "none";
}

function playSelectedStream(url) {
    closeServerModal();
    initPlayer({ link: url });
}

function downloadSelectedStream(url) {
    window.open(url, "_blank");
}

// ============================
// 🎬 PLAYER
// ============================
function initPlayer(stream) {
    const playerArea = document.getElementById("playerArea");
    playerArea.style.display = "block";
    playerArea.scrollIntoView({ behavior: "smooth" });

    const type = getVideoType(stream.link);

    console.log("🎬 FINAL STREAM:", stream.link);

    if (player) {
        player.src({ src: stream.link, type });
        player.play();
    } else {
        player = videojs("vjs-player", {
            controls: true,
            autoplay: true,
            fluid: true,
            sources: [{ src: stream.link, type }]
        });
    }
}

function getVideoType(url) {
    if (url.includes(".m3u8")) return "application/x-mpegURL";
    if (url.includes(".mpd")) return "application/dash+xml";
    return "video/mp4";
}

// ============================
// 🛠️ UTILS
// ============================
function setStatus(text, color = "#22c55e") {
    statusText.textContent = text;
    statusText.style.color = color;
}

function cleanTitle(title) {
    if (!title) return "";
    return title
        .replace(/Download/ig, '')
        .replace(/\[.*?\]/g, '')
        .replace(/\(.*?\)/g, '')
        .replace(/1080p|720p|480p|2160p|4k|HD|CAMRip|HDRip|WEBRip|WEB-DL|Bluray|Dual Audio|Hindi|English|Tamil|Telugu|Malayalam/ig, '')
        .replace(/-\s*$/g, '')
        .trim();
}

function search() {
    const q = searchInput.value;
    if (q) fetchData(q, true);
}

// 🚀 START
loadProviders();