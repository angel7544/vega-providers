const API_BASE = window.location.origin;
let currentProvider = "";
let currentMeta = null;
let player = null;

// Initialize Lucide icons
lucide.createIcons();

// Elements
const providerSelect = document.getElementById('providerSelect');
const contentGrid = document.getElementById('contentGrid');
const searchInput = document.getElementById('searchInput');
const statusText = document.querySelector('#statusIndicator span');
const modalOverlay = document.getElementById('modalOverlay');

// Load Providers
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
        providerSelect.onchange = (e) => {
            currentProvider = e.target.value;
            showHome();
        };
        
        showHome();
    } catch (err) {
        console.error("Failed to load providers", err);
        setStatus("Error loading providers", "#ef4444");
    }
}

function setStatus(text, color = "#10b981") {
    statusText.textContent = text;
    statusText.style.color = color;
}

async function fetchData(filter, search = false) {
    setStatus("Fetching data...", "#f59e0b");
    contentGrid.innerHTML = "";
    
    // Add skeletons
    for(let i=0; i<8; i++) {
        const skel = document.createElement('div');
        skel.className = 'media-card skeleton';
        skel.style.height = "350px";
        contentGrid.appendChild(skel);
    }

    try {
        const func = search ? "getSearchPosts" : "getPosts";
        const params = search ? { searchQuery: filter, page: 1 } : { filter: filter, page: 1 };
        
        const resp = await fetch(`${API_BASE}/fetch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                provider: currentProvider,
                functionName: func,
                params: params
            })
        });
        
        const data = await resp.json();
        renderGrid(data);
        setStatus("Online");
    } catch (err) {
        console.error("Fetch failed", err);
        setStatus("Fetch failed", "#ef4444");
    }
}

function renderGrid(items) {
    contentGrid.innerHTML = "";
    if (!items || items.length === 0) {
        contentGrid.innerHTML = "<p style='grid-column: 1/-1; text-align: center; color: var(--text-secondary);'>No results found.</p>";
        return;
    }

    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'media-card';
        card.onclick = () => showDetails(item.link);
        
        card.innerHTML = `
            <img src="${item.image || ''}" alt="${item.title}" class="media-poster" loading="lazy" onerror="this.src='https://via.placeholder.com/300x450?text=No+Poster'">
            <div class="media-info">
                <div class="media-title">${item.title}</div>
                <div class="media-type">${item.type || 'Media'}</div>
            </div>
        `;
        contentGrid.appendChild(card);
    });
}

async function showDetails(link) {
    setStatus("Fetching metadata...", "#f59e0b");
    modalOverlay.style.display = "flex";
    document.body.style.overflow = "hidden";
    
    // Reset modal
    document.getElementById('detailPoster').src = "";
    document.getElementById('detailTitle').textContent = "Loading...";
    document.getElementById('detailSynopsis').textContent = "";
    document.getElementById('linksContainer').innerHTML = "<p>Loading links...</p>";
    document.getElementById('playerArea').style.display = "none";
    if (player) { player.dispose(); player = null; }

    try {
        const resp = await fetch(`${API_BASE}/fetch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                provider: currentProvider,
                functionName: "getMeta",
                params: { link: link }
            })
        });
        
        currentMeta = await resp.json();
        document.getElementById('detailPoster').src = currentMeta.image;
        document.getElementById('detailTitle').textContent = currentMeta.title;
        document.getElementById('detailSynopsis').textContent = currentMeta.synopsis || "No synopsis available.";
        
        renderLinks(currentMeta);
        setStatus("Online");
    } catch (err) {
        console.error("Metadata fetch failed", err);
        setStatus("Error fetching details", "#ef4444");
    }
}

function renderLinks(meta) {
    const container = document.getElementById('linksContainer');
    container.innerHTML = "";
    
    if (!meta.linkList || meta.linkList.length === 0) {
        container.innerHTML = "<p style='color: #f59e0b;'>No links found.</p>";
        return;
    }

    const isSeries = meta.type === "series";

    meta.linkList.forEach(group => {
        const groupEl = document.createElement('div');
        groupEl.className = 'link-group';
        
        let title = group.title || "Download Links";
        if (group.quality) title += ` [${group.quality}]`;
        
        groupEl.innerHTML = `<h3>${title}</h3>`;
        
        const btnRow = document.createElement('div');
        btnRow.className = 'button-row';
        
        if (isSeries && group.episodesLink) {
            const btn = document.createElement('button');
            btn.className = 'btn btn-secondary';
            btn.innerHTML = `<i data-lucide="list"></i> View Episodes`;
            btn.onclick = () => fetchEpisodes(group.episodesLink);
            btnRow.appendChild(btn);
        } else {
            group.directLinks?.forEach(dLink => {
                const playBtn = document.createElement('button');
                playBtn.className = 'btn btn-primary';
                playBtn.innerHTML = `<i data-lucide="play"></i> Watch`;
                playBtn.onclick = () => playStream(dLink.link, dLink.title || meta.title);
                btnRow.appendChild(playBtn);
                
                const vlcBtn = document.createElement('button');
                vlcBtn.className = 'btn btn-secondary';
                vlcBtn.style.background = "#d35400";
                vlcBtn.innerHTML = `<i data-lucide="external-link"></i> VLC`;
                vlcBtn.onclick = () => playInVLC(dLink.link);
                btnRow.appendChild(vlcBtn);

                const copyBtn = document.createElement('button');
                copyBtn.className = 'btn btn-secondary';
                copyBtn.innerHTML = `<i data-lucide="copy"></i>`;
                copyBtn.onclick = () => copyLink(dLink.link);
                btnRow.appendChild(copyBtn);
            });
        }
        
        groupEl.appendChild(btnRow);
        container.appendChild(groupEl);
    });
    lucide.createIcons();
}

async function fetchEpisodes(url) {
    statusText.textContent = "Fetching episodes...";
    const container = document.getElementById('linksContainer');
    container.innerHTML = "<p>Loading episodes...</p>";
    
    try {
        const resp = await fetch(`${API_BASE}/fetch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                provider: currentProvider,
                functionName: "getEpisodes",
                params: { url: url }
            })
        });
        
        const episodes = await resp.json();
        container.innerHTML = "<h3>Episodes</h3>";
        const grid = document.createElement('div');
        grid.style.display = "grid";
        grid.style.gridTemplateColumns = "1fr 1fr";
        grid.style.gap = "10px";
        
        episodes.forEach(ep => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-secondary';
            btn.style.width = "100%";
            btn.style.justifyContent = "space-between";
            btn.innerHTML = `<span>${ep.title}</span> <div style="display:flex; gap:5px;">
                <i data-lucide="play" onclick="event.stopPropagation(); playStream('${ep.link}', '${ep.title}')" style="width:16px;"></i>
                <i data-lucide="external-link" onclick="event.stopPropagation(); playInVLC('${ep.link}')" style="width:16px; color:#d35400;"></i>
            </div>`;
            btn.onclick = () => playStream(ep.link, ep.title);
            grid.appendChild(btn);
        });
        
        container.appendChild(grid);
        lucide.createIcons();
        setStatus("Online");
    } catch (err) {
        setStatus("Error loading episodes", "#ef4444");
    }
}

async function playStream(link, title) {
    setStatus("Extracting stream...", "#f59e0b");
    try {
        const resp = await fetch(`${API_BASE}/fetch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                provider: currentProvider,
                functionName: "getStream",
                params: { link: link, type: currentMeta.type }
            })
        });
        
        const streams = await resp.json();
        if (streams && streams.length > 0) {
            const finalUrl = streams[0].link;
            initPlayer(finalUrl, title);
            setStatus("Online");
        } else {
            alert("No streamable links found.");
            setStatus("No links", "#f59e0b");
        }
    } catch (err) {
        setStatus("Extraction failed", "#ef4444");
    }
}

function initPlayer(url, title) {
    document.getElementById('playerArea').style.display = "block";
    const container = document.getElementById('playerArea');
    container.innerHTML = `<video id="vjs-player" class="video-js vjs-big-play-centered vjs-theme-city" controls preload="auto" width="100%" height="100%"></video>`;
    
    if (player) player.dispose();
    
    player = videojs('vjs-player', {
        autoplay: true,
        controls: true,
        responsive: true,
        fluid: true,
        sources: [{
            src: url,
            type: url.toLowerCase().endsWith('.mkv') ? 'video/x-matroska' : 'video/mp4'
        }]
    });
}

async function playInVLC(link) {
    setStatus("Extracting for VLC...", "#f59e0b");
    try {
        const resp = await fetch(`${API_BASE}/fetch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                provider: currentProvider,
                functionName: "getStream",
                params: { link: link, type: currentMeta.type }
            })
        });
        
        const streams = await resp.json();
        if (streams && streams.length > 0) {
            const finalUrl = streams[0].link;
            await fetch(`${API_BASE}/vlc`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: finalUrl })
            });
            setStatus("Playing in VLC", "#d35400");
            setTimeout(() => setStatus("Online"), 3000);
        }
    } catch (err) {
        setStatus("VLC failed", "#ef4444");
    }
}

function copyLink(link) {
    navigator.clipboard.writeText(link);
    setStatus("Link copied!", "#a855f7");
    setTimeout(() => setStatus("Online"), 2000);
}

function closeModal() {
    modalOverlay.style.display = "none";
    document.body.style.overflow = "auto";
    if (player) {
        player.pause();
        player.dispose();
        player = null;
    }
}

function showHome() {
    fetchData("");
}

function fetchTrending() {
    fetchData("trending");
}

function search() {
    const q = searchInput.value;
    if (q) fetchData(q, true);
}

// Start
loadProviders();
