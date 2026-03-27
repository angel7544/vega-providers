const API_BASE = window.location.origin;

let currentProvider = "";
let currentMeta = null;
let player = null;

// Init icons
lucide.createIcons();

// Elements
const providerSelect = document.getElementById('providerSelect');
const contentGrid = document.getElementById('contentGrid');
const searchInput = document.getElementById('searchInput');
const statusText = document.querySelector('#statusIndicator span');
const modalOverlay = document.getElementById('modalOverlay');
const catalogContainer = document.getElementById('catalogContainer');

// ---------------- STATUS ----------------
function setStatus(text, color = "#10b981") {
    statusText.textContent = text;
    statusText.style.color = color;
}

// ---------------- PROVIDERS ----------------
async function loadProviders() {
    try {
        const resp = await fetch(`${API_BASE}/manifest.json`);
        const manifest = await resp.json();

        providerSelect.innerHTML = "";

        manifest.filter(p => !p.disabled).forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.value;
            opt.textContent = p.display_name;
            providerSelect.appendChild(opt);
        });

        currentProvider = providerSelect.value;

        providerSelect.onchange = async (e) => {
            currentProvider = e.target.value;
            await loadCatalog();
        };

        await loadCatalog();

    } catch (err) {
        console.error(err);
        setStatus("Provider load failed", "#ef4444");
    }
}

function toggleSidebar() {
    const sidebar = document.getElementById("sidebar");
    const main = document.getElementById("main");

    sidebar.classList.toggle("collapsed");
    main.classList.toggle("expanded");
}
// ---------------- CATALOG ----------------
async function loadCatalog() {
    try {
        setStatus("Loading catalog...", "#f59e0b");

        const resp = await fetch(`${API_BASE}/catalog?provider=${currentProvider}`);
        const data = await resp.json();

        renderCatalog(data.catalog, data.genres || []);
        setStatus("Online");

    } catch (err) {
        console.error(err);
        setStatus("Catalog failed", "#ef4444");
    }
}

function renderCatalog(catalog, genres) {
    catalogContainer.innerHTML = "";

    // Main sections
    catalog.forEach(section => {
        const btn = document.createElement('button');
        btn.className = "btn btn-primary";
        btn.textContent = section.title;

        btn.onclick = () => fetchData(section.filter);
        catalogContainer.appendChild(btn);
    });

    // Genres
    if (genres.length) {
        const wrap = document.createElement('div');
        wrap.style.marginTop = "10px";

        genres.forEach(g => {
            const btn = document.createElement('button');
            btn.className = "btn btn-secondary";
            btn.textContent = g.title;

            btn.onclick = () => fetchData(g.filter);
            wrap.appendChild(btn);
        });

        catalogContainer.appendChild(wrap);
    }
}

// ---------------- FETCH POSTS ----------------
async function fetchData(filter, search = false) {
    setStatus("Fetching...", "#f59e0b");
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

// ---------------- GRID ----------------
function renderGrid(items) {
    contentGrid.innerHTML = "";

    if (!items?.length) {
        contentGrid.innerHTML = `<p style="grid-column:1/-1;text-align:center;">No results</p>`;
        return;
    }

    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'media-card';
        card.onclick = () => showDetails(item.link);

        card.innerHTML = `
            <img src="${item.image || ''}" class="media-poster"
            onerror="this.src='https://via.placeholder.com/300x450?text=No+Poster'">
            <div class="media-info">
                <div class="media-title">${item.title}</div>
                <div class="media-type">${item.type || 'Media'}</div>
            </div>
        `;

        contentGrid.appendChild(card);
    });
}

// ---------------- META ----------------
async function showDetails(link) {
    modalOverlay.style.display = "flex";
    document.body.style.overflow = "hidden";

    setStatus("Loading meta...", "#f59e0b");

    document.getElementById('linksContainer').innerHTML = "Loading...";
    document.getElementById('playerArea').style.display = "none";

    if (player) {
        player.dispose();
        player = null;
    }

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

        document.getElementById('detailPoster').src = currentMeta.image;
        document.getElementById('detailTitle').textContent = currentMeta.title;
        document.getElementById('detailSynopsis').textContent = currentMeta.synopsis || "";

        renderLinks(currentMeta);
        setStatus("Online");

    } catch (err) {
        console.error(err);
        setStatus("Meta failed", "#ef4444");
    }
}

// ---------------- LINKS ----------------
function renderLinks(meta) {
    const container = document.getElementById('linksContainer');
    container.innerHTML = "";

    if (!meta.linkList?.length) {
        container.innerHTML = "No links";
        return;
    }

    const isSeries = meta.type === "series";

    meta.linkList.forEach(group => {
        const el = document.createElement('div');
        el.className = 'link-group';

        el.innerHTML = `<h3>${group.title || "Links"} ${group.quality ? `[${group.quality}]` : ""}</h3>`;

        const row = document.createElement('div');
        row.className = 'button-row';

        if (isSeries && group.episodesLink) {
            const btn = document.createElement('button');
            btn.className = 'btn btn-secondary';
            btn.textContent = "Episodes";
            btn.onclick = () => fetchEpisodes(group.episodesLink);
            row.appendChild(btn);

        } else {
            group.directLinks?.forEach(d => {

                const play = document.createElement('button');
                play.className = 'btn btn-primary';
                play.textContent = "Watch";
                play.onclick = () => playStream(d.link, d.title);
                row.appendChild(play);

                const vlc = document.createElement('button');
                vlc.className = 'btn btn-secondary';
                vlc.textContent = "VLC";
                vlc.onclick = () => playInVLC(d.link);
                row.appendChild(vlc);
            });
        }

        el.appendChild(row);
        container.appendChild(el);
    });
}

// ---------------- EPISODES ----------------
async function fetchEpisodes(url) {
    setStatus("Episodes...", "#f59e0b");

    const container = document.getElementById('linksContainer');
    container.innerHTML = "Loading...";

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

        const eps = await resp.json();

        container.innerHTML = "<h3>Episodes</h3>";

        eps.forEach(ep => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-secondary';
            btn.textContent = ep.title;
            btn.onclick = () => playStream(ep.link, ep.title);
            container.appendChild(btn);
        });

        setStatus("Online");

    } catch {
        setStatus("Episode error", "#ef4444");
    }
}

// ---------------- STREAM ----------------
async function playStream(link, title) {
    setStatus("Extracting...", "#f59e0b");

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

        if (streams?.length) {
            const s = streams[0];
            initPlayer(s.link, s.type);
            setStatus("Online");
        }

    } catch {
        setStatus("Stream error", "#ef4444");
    }
}

// ---------------- PLAYER ----------------
function getVideoType(url) {
    if (url.includes(".m3u8")) return "application/x-mpegURL";
    if (url.endsWith(".mpd")) return "application/dash+xml";
    if (url.endsWith(".mkv")) return "video/x-matroska";
    return "video/mp4";
}

function initPlayer(url, type) {
    document.getElementById('playerArea').style.display = "block";

    document.getElementById('playerArea').innerHTML = `
        <video id="vjs-player" class="video-js vjs-big-play-centered" controls></video>
    `;

    if (player) player.dispose();

    player = videojs('vjs-player', {
        autoplay: true,
        controls: true,
        fluid: true,
        sources: [{
            src: url,
            type: type || getVideoType(url)
        }]
    });
}

// ---------------- VLC ----------------
async function playInVLC(link) {
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

        if (streams?.length) {
            await fetch(`${API_BASE}/vlc`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: streams[0].link })
            });
        }

    } catch {
        setStatus("VLC error", "#ef4444");
    }
}

// ---------------- SEARCH ----------------
function search() {
    const q = searchInput.value;
    if (q) fetchData(q, true);
}

// ---------------- MODAL ----------------
function closeModal() {
    modalOverlay.style.display = "none";
    document.body.style.overflow = "auto";

    if (player) {
        player.dispose();
        player = null;
    }
}

// START
loadProviders();