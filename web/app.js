const API_BASE = window.location.origin;
const REMOTE_BASE = "https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main";

let currentProvider = "";
let currentMeta = null;
let player = null;
let providersMap = {}; // store provider info

lucide.createIcons();

// Elements
const providerSelect = document.getElementById('providerSelect');
const contentGrid = document.getElementById('contentGrid');
const searchInput = document.getElementById('searchInput');
const statusText = document.querySelector('#statusIndicator span');
const modalOverlay = document.getElementById('modalOverlay');
const catalogContainer = document.getElementById('catalogContainer');


// ============================
// 🔥 LOAD PROVIDERS (LOCAL + REMOTE)
// ============================
async function loadProviders() {
    try {
        setStatus("Loading providers...", "#f59e0b");

        // Local
        const localResp = await fetch(`${API_BASE}/manifest.json`);
        const local = await localResp.json();

        // Remote (example JSON list)
        let remote = [];
        try {
            const remoteResp = await fetch(`${REMOTE_BASE}/modflix.json`);
            const data = await remoteResp.json();

            // normalize into manifest format
            remote = data.map(p => ({
                ...p,
                source: "remote"
            }));
        } catch (e) {
            console.warn("Remote providers failed");
        }

        const merged = [...local, ...remote];

        providerSelect.innerHTML = "";
        providersMap = {};

        merged.filter(p => !p.disabled).forEach(p => {
            providersMap[p.value] = p;

            const opt = document.createElement('option');
            opt.value = p.value;
            opt.textContent = p.display_name + (p.source === "remote" ? " 🌐" : "");
            providerSelect.appendChild(opt);
        });

        currentProvider = providerSelect.value;

        providerSelect.onchange = async (e) => {
            currentProvider = e.target.value;
            await loadCatalog();
        };

        await loadCatalog();
        setStatus("Online");

    } catch (err) {
        console.error(err);
        setStatus("Provider load failed", "#ef4444");
    }
}


// ============================
// 🔥 LOAD CATALOG (catalog.ts)
// ============================
async function loadCatalog() {
    try {
        catalogContainer.innerHTML = "Loading...";

        const resp = await fetch(`${API_BASE}/catalog?provider=${currentProvider}`);
        const data = await resp.json();

        renderCatalog(data.catalog || [], data.genres || []);

    } catch (err) {
        console.error("Catalog error", err);
        catalogContainer.innerHTML = "Failed to load catalog";
    }
}


// ============================
// 🔥 RENDER CATALOG UI
// ============================
function renderCatalog(catalog, genres) {
    catalogContainer.innerHTML = "";

    catalog.forEach(section => {
        const btn = document.createElement("button");
        btn.className = "btn btn-primary";
        btn.textContent = section.title;
        btn.onclick = () => fetchData(section.filter);
        catalogContainer.appendChild(btn);
    });

    if (genres.length) {
        const wrap = document.createElement("div");
        wrap.style.marginTop = "10px";

        genres.forEach(g => {
            const btn = document.createElement("button");
            btn.className = "btn btn-secondary";
            btn.textContent = g.title;
            btn.onclick = () => fetchData(g.filter);
            wrap.appendChild(btn);
        });

        catalogContainer.appendChild(wrap);
    }
}


// ============================
// 🔥 FETCH POSTS
// ============================
async function fetchData(filter, search = false) {
    setStatus("Fetching data...", "#f59e0b");
    contentGrid.innerHTML = "";

    for (let i = 0; i < 8; i++) {
        const skel = document.createElement('div');
        skel.className = 'media-card skeleton';
        skel.style.height = "350px";
        contentGrid.appendChild(skel);
    }

    try {
        const func = search ? "getSearchPosts" : "getPosts";
        const params = search
            ? { searchQuery: filter, page: 1 }
            : { filter, page: 1 };

        const resp = await fetch(`${API_BASE}/fetch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                provider: currentProvider,
                functionName: func,
                params
            })
        });

        const data = await resp.json();
        renderGrid(data);
        setStatus("Online");

    } catch (err) {
        console.error(err);
        setStatus("Fetch failed", "#ef4444");
    }
}


// ============================
// 🔥 GRID
// ============================
function renderGrid(items) {
    contentGrid.innerHTML = "";

    if (!items?.length) {
        contentGrid.innerHTML = "<p>No results</p>";
        return;
    }

    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'media-card';
        card.onclick = () => showDetails(item.link);

        card.innerHTML = `
            <img src="${item.image}" class="media-poster">
            <div class="media-info">
                <div class="media-title">${item.title}</div>
                <div class="media-type">${item.type || 'Media'}</div>
            </div>
        `;

        contentGrid.appendChild(card);
    });
}


// ============================
// 🔥 META
// ============================
async function showDetails(link) {
    modalOverlay.style.display = "flex";

    const resp = await fetch(`${API_BASE}/fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            provider: currentProvider,
            functionName: "getMeta",
            params: { link }
        })
    });

    currentMeta = await resp.json();

    document.getElementById('detailTitle').textContent = currentMeta.title;
    renderLinks(currentMeta);
}


// ============================
// 🔥 LINKS
// ============================
function renderLinks(meta) {
    const container = document.getElementById('linksContainer');
    container.innerHTML = "";

    meta.linkList?.forEach(group => {
        const btn = document.createElement('button');
        btn.textContent = group.title || "Play";

        if (group.episodesLink) {
            btn.onclick = () => fetchEpisodes(group.episodesLink);
        } else {
            btn.onclick = () => playStream(group.directLinks[0].link);
        }

        container.appendChild(btn);
    });
}


// ============================
// 🔥 STREAM
// ============================
async function playStream(link) {
    const resp = await fetch(`${API_BASE}/fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            provider: currentProvider,
            functionName: "getStream",
            params: { link, type: currentMeta.type }
        })
    });

    const streams = await resp.json();

    if (streams?.length) {
        initPlayer(streams[0]);
    }
}


// ============================
// 🔥 PLAYER
// ============================
function getVideoType(url) {
    if (url.includes(".m3u8")) return "application/x-mpegURL";
    if (url.endsWith(".mpd")) return "application/dash+xml";
    if (url.endsWith(".mkv")) return "video/x-matroska";
    return "video/mp4";
}

function initPlayer(stream) {
    document.getElementById('playerArea').style.display = "block";

    const type = stream.type || getVideoType(stream.link);

    if (player) player.dispose();

    player = videojs('vjs-player', {
        autoplay: true,
        controls: true,
        fluid: true,
        sources: [{
            src: stream.link,
            type
        }]
    });
}


// ============================
// 🔥 EPISODES
// ============================
async function fetchEpisodes(url) {
    const resp = await fetch(`${API_BASE}/fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            provider: currentProvider,
            functionName: "getEpisodes",
            params: { url }
        })
    });

    const episodes = await resp.json();

    const container = document.getElementById('linksContainer');
    container.innerHTML = "";

    episodes.forEach(ep => {
        const btn = document.createElement('button');
        btn.textContent = ep.title;
        btn.onclick = () => playStream(ep.link);
        container.appendChild(btn);
    });
}


// ============================
// 🔥 UTIL
// ============================
function setStatus(text, color = "#10b981") {
    statusText.textContent = text;
    statusText.style.color = color;
}

function search() {
    const q = searchInput.value;
    if (q) fetchData(q, true);
}


// ============================
// 🚀 START
// ============================
loadProviders();