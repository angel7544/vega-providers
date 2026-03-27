const API_BASE = window.location.origin;
const MANIFEST_URL = "https://raw.githubusercontent.com/Zenda-Cross/vega-providers/refs/heads/main/modflix.json";

let currentProvider = "";
let currentMeta = null;
let player = null;
let providersMap = {};

lucide.createIcons();

// Elements
const providerSelect = document.getElementById('providerSelect');
const contentGrid = document.getElementById('contentGrid');
const searchInput = document.getElementById('searchInput');
const statusText = document.querySelector('#statusText');
const catalogContainer = document.getElementById('catalogContainer');
const modalOverlay = document.getElementById('modalOverlay');


// ============================
// 🔥 LOAD PROVIDERS
// ============================
async function loadProviders() {
    try {
        setStatus("Loading providers...", "#f59e0b");

        const resp = await fetch(MANIFEST_URL);
        const providers = await resp.json();

        providerSelect.innerHTML = "";
        providersMap = {};

        // 🌐 ALL PROVIDERS OPTION
        const allOpt = document.createElement('option');
        allOpt.value = "__all__";
        allOpt.textContent = "All Providers 🌐";
        providerSelect.appendChild(allOpt);

        providers.forEach(p => {
            providersMap[p.value] = p;

            const opt = document.createElement('option');
            opt.value = p.value;
            opt.textContent = p.display_name + " 🌐";
            providerSelect.appendChild(opt);
        });

        currentProvider = "__all__";

        providerSelect.onchange = async (e) => {
            currentProvider = e.target.value;

            if (currentProvider === "__all__") {
                catalogContainer.innerHTML = `
                    <div style="padding:10px;color:#a855f7;">
                        🌐 Aggregating from all providers
                    </div>
                `;
                fetchData("");
            } else {
                await loadCatalog();
            }
        };

        // default load
        fetchData("");
        setStatus("Online");

    } catch (err) {
        console.error(err);
        setStatus("Provider load failed", "#ef4444");
    }
}


// ============================
// 🔥 SAFE CATALOG LOADER
// ============================
async function loadCatalog() {
    try {
        catalogContainer.innerHTML = "Loading...";

        const resp = await fetch(`${API_BASE}/catalog?provider=${currentProvider}`);

        if (!resp.ok) throw new Error("Catalog failed");

        const data = await resp.json();

        if (!data.catalog || !Array.isArray(data.catalog)) {
            throw new Error("Invalid catalog");
        }

        renderCatalog(data.catalog, data.genres || []);

    } catch (err) {
        console.warn("Catalog not supported:", currentProvider);

        catalogContainer.innerHTML = `
            <div style="color:#f59e0b; padding:10px;">
                ⚠️ Catalog not available. Showing results.
            </div>
        `;

        fetchData("");
    }
}


// ============================
// 🔥 RENDER CATALOG
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
// 🔥 FETCH DATA (ALL MODE)
// ============================
async function fetchData(filter, search = false) {
    setStatus("Fetching...", "#f59e0b");
    contentGrid.innerHTML = "";

    try {
        const func = search ? "getSearchPosts" : "getPosts";
        const params = search
            ? { searchQuery: filter, page: 1 }
            : { filter, page: 1 };

        let results = [];

        if (currentProvider === "__all__") {
            const providers = Object.keys(providersMap);

            const promises = providers.map(p =>
                fetch(`${API_BASE}/fetch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        provider: p,
                        functionName: func,
                        params
                    })
                })
                .then(r => r.json())
                .then(data => data.map(item => ({
                    ...item,
                    __provider: p
                })))
                .catch(() => [])
            );

            const allData = await Promise.all(promises);
            results = allData.flat();

            // remove duplicates
            const map = new Map();
            results.forEach(i => {
                const key = i.title?.toLowerCase();
                if (key && !map.has(key)) map.set(key, i);
            });
            results = Array.from(map.values());

        } else {
            const resp = await fetch(`${API_BASE}/fetch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: currentProvider,
                    functionName: func,
                    params
                })
            });

            results = await resp.json();
        }

        renderGrid(results);
        setStatus(`Loaded ${results.length}`);

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

        card.onclick = () => {
            if (item.__provider) {
                currentProvider = item.__provider;
                providerSelect.value = item.__provider;
            }
            showDetails(item.link);
        };

        card.innerHTML = `
            <img src="${item.image}" class="media-poster">
            <div class="media-info">
                <div class="media-title">${item.title}</div>
                <div class="media-type">
                    ${item.type || 'Media'}
                    ${item.__provider ? `<span style="color:#a855f7"> • ${item.__provider}</span>` : ""}
                </div>
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
    document.body.style.overflow = "hidden";

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