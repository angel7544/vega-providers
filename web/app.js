const API_BASE = window.location.origin;
const MANIFEST_URL = `${API_BASE}/manifest.json`;

let currentProvider = "";
let currentMeta = null;
let player = null;
let providersMap = {};

// Lucide initialization
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

        // ALL PROVIDERS OPTION
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
// 📂 CATALOG LOADER
// ============================
async function loadCatalog() {
    try {
        catalogContainer.innerHTML = `<div class="spinner" style="width:20px;height:20px;border-width:2px;"></div>`;

        const resp = await fetch(`${API_BASE}/catalog?provider=${currentProvider}`);
        if (!resp.ok) throw new Error("Catalog failed");

        const data = await resp.json();
        renderCatalog(data.catalog || [], data.genres || []);

    } catch (err) {
        console.warn("Catalog not supported:", currentProvider);
        catalogContainer.innerHTML = "";
        fetchData("");
    }
}

function renderCatalog(catalog, genres) {
    catalogContainer.innerHTML = "";

    const allSections = [...catalog, ...genres];

    allSections.forEach(section => {
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
            <p>Scanning the multiverse...</p>
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
            const promises = providers.map(p =>
                fetch(`${API_BASE}/fetch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ provider: p, functionName: func, params })
                })
                .then(r => r.json())
                .then(data => (Array.isArray(data) ? data : []).map(item => ({ ...item, __provider: p })))
                .catch(() => [])
            );

            const allData = await Promise.all(promises);
            results = allData.flat();

            // Unique items
            const map = new Map();
            results.forEach(i => {
                const key = (i.title + (i.type || "")).toLowerCase();
                if (key && !map.has(key)) map.set(key, i);
            });
            results = Array.from(map.values());

        } else {
            const resp = await fetch(`${API_BASE}/fetch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider: currentProvider, functionName: func, params })
            });
            results = await resp.json();
        }

        renderGrid(Array.isArray(results) ? results : []);
        setStatus(results.length > 0 ? "Online" : "No results");

    } catch (err) {
        console.error(err);
        setStatus("Fetch Error", "#ef4444");
        contentGrid.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:#ef4444;">Failed to load content. Please try another provider.</p>`;
    }
}

// ============================
// 🖥️ GRID RENDERING
// ============================
function renderGrid(items) {
    contentGrid.innerHTML = "";

    if (!items.length) {
        contentGrid.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:var(--text-dim);">No results found in this sector. 🛸</p>`;
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
            <div class="media-poster-container">
                <img src="${item.image}" class="media-poster" loading="lazy" onerror="this.src='https://via.placeholder.com/300x450?text=No+Image'">
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
// 📽️ DETAILS (IMDb Style)
// ============================
async function showDetails(link) {
    modalOverlay.style.display = "flex";
    document.body.style.overflow = "hidden";
    
    // Reset Modal
    document.getElementById('detailTitle').textContent = "Loading...";
    document.getElementById('detailSynopsis').textContent = "";
    document.getElementById('detailPoster').src = "";
    document.getElementById('modalBackdrop').style.backgroundImage = "none";
    document.getElementById('linksContainer').innerHTML = `<div class="spinner" style="margin:20px auto;"></div>`;
    document.getElementById('playerArea').style.display = "none";

    try {
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

        // Populate Content
        document.getElementById('detailTitle').textContent = currentMeta.title;
        document.getElementById('detailSynopsis').textContent = currentMeta.description || currentMeta.synopsis || "No description available.";
        document.getElementById('detailPoster').src = currentMeta.image || "";
        
        // Backdrop (IMDb vibe)
        if (currentMeta.image) {
            document.getElementById('modalBackdrop').style.backgroundImage = `url(${currentMeta.image})`;
        }

        // Meta Tags
        document.getElementById('detailYear').textContent = currentMeta.year || "";
        document.getElementById('detailType').textContent = currentMeta.type || "Movie";
        document.getElementById('detailProvider').textContent = currentProvider;
        
        // Rating
        const ratingBox = document.getElementById('detailRating');
        if (currentMeta.rating) {
            ratingBox.textContent = `★ ${currentMeta.rating}`;
            ratingBox.style.display = "block";
        } else {
            ratingBox.style.display = "none";
        }

        renderLinks(currentMeta);

    } catch (err) {
        console.error(err);
        document.getElementById('detailTitle').textContent = "Error loading details";
    }
}

// ============================
// 🔗 LINKS & EPISODES
// ============================
function renderLinks(meta) {
    const container = document.getElementById('linksContainer');
    const title = document.getElementById('episodesTitle');
    container.innerHTML = "";

    if (meta.type === "tv" || meta.type === "series" || meta.linkList?.[0]?.episodesLink) {
        title.textContent = "Select Episode";
    } else {
        title.textContent = "Available Streams";
    }

    meta.linkList?.forEach(group => {
        const btn = document.createElement('button');
        btn.className = "stream-btn";
        btn.textContent = group.title || "Play Now";

        if (group.episodesLink) {
            btn.onclick = () => fetchEpisodes(group.episodesLink);
        } else if (group.directLinks && group.directLinks.length > 0) {
            btn.onclick = () => playStream(group.directLinks[0].link);
        } else if (group.link) {
             btn.onclick = () => playStream(group.link);
        }

        container.appendChild(btn);
    });
}

async function fetchEpisodes(url) {
    const container = document.getElementById('linksContainer');
    container.innerHTML = `<div class="spinner" style="margin:20px auto;"></div>`;

    try {
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
        container.innerHTML = "";

        episodes.forEach(ep => {
            const btn = document.createElement('button');
            btn.className = "ep-btn";
            btn.textContent = ep.title || `Episode ${ep.episode || ""}`;
            btn.onclick = () => playStream(ep.link);
            container.appendChild(btn);
        });
    } catch (err) {
        console.error(err);
        container.innerHTML = `<p style="color:#ef4444">Failed to load episodes.</p>`;
    }
}

// ============================
// 📺 PLAYER LOGIC
// ============================
async function playStream(link) {
    const container = document.getElementById('linksContainer');
    const originalContent = container.innerHTML;
    container.innerHTML = `<div class="spinner" style="margin:20px auto;"></div>`;

    try {
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
        container.innerHTML = originalContent;

        if (Array.isArray(streams) && streams.length > 0) {
            initPlayer(streams[0]);
        } else if (streams && streams.link) {
            initPlayer(streams);
        } else {
            alert("No streamable links found.");
        }
    } catch (err) {
        console.error(err);
        container.innerHTML = originalContent;
        alert("Error fetching stream.");
    }
}

function initPlayer(stream) {
    const playerArea = document.getElementById('playerArea');
    playerArea.style.display = "block";
    playerArea.scrollIntoView({ behavior: 'smooth' });

    const type = stream.type || getVideoType(stream.link);

    if (player) {
        player.src({ src: stream.link, type });
        player.play();
    } else {
        player = videojs('vjs-player', {
            autoplay: true,
            controls: true,
            fluid: true,
            sources: [{ src: stream.link, type }]
        });
        window.player = player;
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