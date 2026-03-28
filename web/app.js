const API_BASE = window.location.origin;
const MANIFEST_URL = `${API_BASE}/manifest.json`;

let currentProvider = "";
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
// 📺 PLAY STREAM
// ============================
async function playStream(link, provider) {
    console.log("▶️ PLAY:", link, provider);

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

        const streams = await resp.json();
        console.log("🎥 RAW STREAM:", streams);

        const streamUrl = extractStreamUrl(streams);

        if (!streamUrl) {
            alert("No playable stream ❌");
            return;
        }

        initPlayer({ link: streamUrl });

    } catch (err) {
        console.error(err);
        alert("Stream error ❌");
    }
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

function search() {
    const q = searchInput.value;
    if (q) fetchData(q, true);
}

// 🚀 START
loadProviders();