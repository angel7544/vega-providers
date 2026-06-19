// ============================
// ⚙️ CONFIGURATION & STATE
// ============================
let API_BASE = localStorage.getItem('vega_api_url') || "";
const getApiUrl = () => {
    let url = API_BASE ? API_BASE : window.location.origin;
    if (url.endsWith('/')) url = url.slice(0, -1);
    return url;
};

let currentProvider = localStorage.getItem('orbix_last_provider') || "";
let currentMeta = null;
let player = null;
let providersMap = {};
let tmdbKey = localStorage.getItem('tmdb_api_key') || "";

// Caching State
let browseScrollPos = 0;
let isBrowseCached = false;
let currentFilter = "";
let currentSearch = "";
let currentCatalogItems = []; // Stores the current provider's catalog options

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
    if (document.getElementById('pageBrowse').classList.contains('active')) {
        browseScrollPos = window.scrollY;
    }

    document.querySelectorAll('.page-view').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    
    // Quick fix to ensure body scroll is natural
    if (pageId === 'pagePlayer') {
        document.body.style.overflow = 'hidden';
    } else {
        document.body.style.overflow = 'auto';
    }

    if (pageId === 'pageBrowse' && isBrowseCached) {
        window.scrollTo(0, browseScrollPos);
    } else if (pageId !== 'pageBrowse') {
        window.scrollTo(0, 0);
    }
}

function backToBrowse() {
    isBrowseCached = true;
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

function getFilterForCategory(keyword, fallbackFilter) {
    if (!currentCatalogItems || currentCatalogItems.length === 0) return fallbackFilter;
    if (keyword === "") return currentCatalogItems[0]?.filter || fallbackFilter;
    const match = currentCatalogItems.find(c => c.title.toLowerCase().includes(keyword.toLowerCase()));
    return match ? match.filter : (currentCatalogItems[0]?.filter || fallbackFilter);
}

function loadHome() { 
    const filter = getFilterForCategory("", "");
    if (currentFilter === filter && !currentSearch) { backToBrowse(); updateActiveNav(0); return; }
    currentSearch = ""; isBrowseCached = false; fetchData(filter); updateActiveNav(0); switchPage('pageBrowse'); 
}
function loadMovies() { 
    const filter = getFilterForCategory("movie", "movie");
    if (currentFilter === filter && !currentSearch) { backToBrowse(); updateActiveNav(1); return; }
    currentSearch = ""; isBrowseCached = false; fetchData(filter); updateActiveNav(1); switchPage('pageBrowse'); 
}
function loadSeries() { 
    const filter = getFilterForCategory("series", "tv");
    if (currentFilter === filter && !currentSearch) { backToBrowse(); updateActiveNav(2); return; }
    currentSearch = ""; isBrowseCached = false; fetchData(filter); updateActiveNav(2); switchPage('pageBrowse'); 
}
function loadWishlist() { 
    if (currentFilter === "wishlist") { backToBrowse(); updateActiveNav(3); return; }
    currentFilter = "wishlist"; currentSearch = ""; isBrowseCached = false;
    updateActiveNav(3); 
    switchPage('pageBrowse'); 
    catalogContainer.innerHTML = "";
    const wishlist = JSON.parse(localStorage.getItem('orbix_wishlist') || "[]");
    renderGrid(wishlist);
    setStatus(wishlist.length ? "Online" : "Wishlist is empty");
}

function updateActiveNav(index) {
    const links = document.querySelectorAll('.nav-link, .mobile-nav-link');
    links.forEach((l, i) => {
        // Because mobile links mirror desktop, index modulo handles both
        if (i % 4 === index) l.classList.add('active');
        else l.classList.remove('active');
    });
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

        providers.forEach(p => {
            providersMap[p.value] = p;

            const opt = document.createElement('option');
            opt.value = p.value;
            opt.textContent = p.display_name;
            providerSelect.appendChild(opt);
        });

        if (!currentProvider || currentProvider === "__all__" || !providersMap[currentProvider]) {
            currentProvider = providers[0]?.value || "";
            localStorage.setItem('orbix_last_provider', currentProvider);
        }
        providerSelect.value = currentProvider;

        providerSelect.onchange = async (e) => {
            currentProvider = e.target.value;
            localStorage.setItem('orbix_last_provider', currentProvider);
            window.location.reload();
        };

        if (currentProvider) {
            await loadCatalog();
            const defaultFilter = currentCatalogItems[0] ? currentCatalogItems[0].filter : "";
            fetchData(defaultFilter);
        }

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
        currentCatalogItems = [...(data.catalog || []), ...(data.genres || [])];
        renderCatalog(data.catalog || [], data.genres || []);

    } catch {
        // Fallback categories if API fails
        currentCatalogItems = [
            { title: "Home", filter: "" },
            { title: "Movies", filter: "movie" },
            { title: "Series", filter: "tv" }
        ];
        renderCatalog([
            { title: "Home", filter: "" },
            { title: "Movies", filter: "movie" },
            { title: "Series", filter: "tv" }
        ], []);
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
            isBrowseCached = false;
            fetchData(section.filter);
        };
        catalogContainer.appendChild(btn);
    });
}

// ============================
// 🔍 FETCH DATA
// ============================
async function fetchData(filter, search = false) {
    currentFilter = filter;
    currentSearch = search ? filter : "";
    
    setStatus("Fetching...", "#8b5cf6");
    switchPage('pageBrowse'); // Ensure we are on browse page
    isBrowseCached = false;

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

        const resp = await fetch(`${getApiUrl()}/fetch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: currentProvider, functionName: func, params })
        });

        results = await resp.json();

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
function createMediaCard(item) {
    const card = document.createElement("div");
    card.className = "media-card";

    card.onclick = () => {
        const provider = item.__provider || currentProvider;
        showDetails(item.link, provider);
    };

    const proxiedImage = item.image && !item.image.includes('placeholder') && !item.image.includes('tmdb.org')
        ? `${getApiUrl()}/image-proxy?url=${encodeURIComponent(item.image)}`
        : item.image;

    const providerDisplayName = item.__provider && providersMap[item.__provider] 
        ? providersMap[item.__provider].display_name 
        : item.__provider;

    card.innerHTML = `
        <div class="media-poster-container">
            <img class="media-poster" src="${proxiedImage}" loading="lazy"
            onerror="handleImageError(this, '${(item.title || '').replace(/'/g, "\\'")}')">
            <div class="media-overlay">
                <div class="media-title">${item.title}</div>
                <div class="media-meta">
                    <span>${item.type || 'Media'}</span>
                    ${providerDisplayName ? `<span style="color:var(--accent)">${providerDisplayName}</span>` : ""}
                </div>
            </div>
        </div>
    `;
    return card;
}

window.switchToProvider = async function(providerId) {
    providerSelect.value = providerId;
    currentProvider = providerId;
    localStorage.setItem('orbix_last_provider', currentProvider);
    await loadCatalog();
    const defaultFilter = currentCatalogItems[0] ? currentCatalogItems[0].filter : "";
    fetchData(defaultFilter);
};

function renderGrid(data) {
    contentGrid.innerHTML = "";

    if (!data || (data.isGrouped && data.groups.length === 0) || (!data.isGrouped && data.length === 0)) {
        contentGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--text-dim);">
                <i data-lucide="ghost" style="width: 48px; height: 48px; margin-bottom: 16px;"></i>
                <p>No results found</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    if (data.isGrouped) {
        contentGrid.style.display = "block"; // override grid for vertical flow
        data.groups.forEach(group => {
            const groupDiv = document.createElement("div");
            groupDiv.style.marginBottom = "40px";
            
            const providerName = providersMap[group.provider]?.display_name || group.provider;
            
            const header = document.createElement("div");
            header.style.display = "flex";
            header.style.justifyContent = "space-between";
            header.style.alignItems = "center";
            header.style.marginBottom = "16px";
            
            header.innerHTML = `
                <h3 style="margin: 0; font-size: 20px;">${providerName}</h3>
                <button class="catalog-btn" onclick="switchToProvider('${group.provider}')">View More</button>
            `;
            groupDiv.appendChild(header);
            
            const subGrid = document.createElement("div");
            subGrid.className = "content-grid"; // reuse grid styles inside
            subGrid.style.display = "grid"; // ensure it restores grid
            
            group.items.forEach(item => subGrid.appendChild(createMediaCard(item)));
            
            groupDiv.appendChild(subGrid);
            contentGrid.appendChild(groupDiv);
        });
    } else {
        contentGrid.style.display = "grid"; // restore global grid
        data.forEach(item => contentGrid.appendChild(createMediaCard(item)));
    }
    lucide.createIcons();
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
    document.getElementById("wishlistBtn").style.display = "none";

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
        let metaTitle = currentMeta.title || currentMeta.name || "Media Details";
        const parsed = parseMediaInfo(metaTitle);
        document.getElementById("detailTitle").textContent = parsed.title;
        document.getElementById("detailSynopsis").textContent =
            currentMeta.description || currentMeta.synopsis || "No synopsis available.";
        
        const posterImg = currentMeta.image || "";
        const imgEl = document.getElementById("detailPoster");
        imgEl.src = posterImg;
        // Fix for detail page posters failing (like Vegamovies)
        imgEl.onerror = () => handleImageError(imgEl, parsed.title);

        // Hide Rating/Year placeholders (already hidden in CSS/HTML but ensuring state here)
        document.getElementById("detailRating").textContent = "";
        document.getElementById("detailYear").textContent = "";

        // Update backdrop safely (Proxy it if it's an external url to bypass hotlinking)
        const backdropEl = document.getElementById("detailBackdrop");
        if (posterImg) {
            if (posterImg.startsWith('http') && !posterImg.includes('placeholder') && !posterImg.includes('image-proxy')) {
                backdropEl.style.backgroundImage = `url(${getApiUrl()}/image-proxy?url=${encodeURIComponent(posterImg)})`;
            } else {
                backdropEl.style.backgroundImage = `url(${posterImg})`;
            }
        } else {
            backdropEl.style.backgroundImage = 'none';
        }

        // Attach wishlist metadata context to the global variable for saving later
        currentMeta.__link = link;
        currentMeta.__provider = provider;
        
        checkWishlistState();
        document.getElementById("wishlistBtn").style.display = "flex";

        renderLinks(currentMeta);
        renderDownloads(currentMeta);

    } catch (err) {
        console.error("Details fetch error:", err);
        document.getElementById("detailTitle").textContent = "Failed to load Details";
        document.getElementById("linksContainer").innerHTML = `<p>Stream retrieval failed.</p><pre style="color:red; font-size:12px; margin-top:10px; white-space:pre-wrap">${err.stack || err.message}</pre>`;
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

    const sizeMatch = title.match(/\b(\d+(?:\.\d+)?\s*(MB|GB))\b/gi);
    if (sizeMatch) {
        [...new Set(sizeMatch)].forEach(s => meta.push({ type: 'size', text: s.toUpperCase() }));
        sizeMatch.forEach(s => title = title.replace(s, ""));
    }

    title = title
        .replace(/\b(Series|Movie|JioHotstar|Netflix|Amazon|Hotstar|Zee5|SonyLiv|Disney\+|Apple\s*TV)\b/gi, "")
        .replace(/[\{\}\(\)\[\]]/g, " ") // replace stray brackets with space
        .replace(/[–\-+|&/·•]+/g, " ") // replace symbols with space
        .replace(/\s+/g, " ") // normalize spacing
        .trim();

    return { title: title || rawTitle, meta };
}

function createStreamBadgeHtml(rawTitle, defaultIcon = "play-circle") {
    const parsed = parseMediaInfo(rawTitle);
    const badges = parsed.meta.map(m => {
        let color = "rgba(255,255,255,0.1)";
        if (m.type === 'quality') color = "#ef4444";
        if (m.type === 'audio') color = "#8b5cf6";
        if (m.type === 'season' || m.type === 'episode') color = "#22c55e";
        if (m.type === 'size') color = "#3b82f6";
        return `<span style="font-size: 10px; background: ${color}; color: #fff; padding: 2px 6px; border-radius: 4px; display: inline-block;">${m.text}</span>`;
    }).join("");
    
    return `
        <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 6px; width: 100%; text-align: left;">
            <div style="display: flex; align-items: flex-start; gap: 8px; width: 100%;">
                <i data-lucide="${defaultIcon}" style="width: 18px; height: 18px; flex-shrink: 0; margin-top: 2px;"></i>
                <span style="font-weight: 500; font-size: 14px; line-height: 1.4; word-break: break-word;">${parsed.title}</span>
            </div>
            ${badges ? `<div style="display: flex; flex-wrap: wrap; gap: 6px; width: 100%; padding-left: 26px;">${badges}</div>` : ''}
        </div>
    `;
}

function renderGallery(meta) {
    const container = document.getElementById("galleryContainer");
    const tabBtn = document.getElementById("tabBtn-gallery");
    if (container) container.innerHTML = "";

    const images = meta.images || meta.screenShots || meta.screenshots || [];
    
    if (!images || images.length === 0) {
        if (tabBtn) tabBtn.style.display = "none";
        return;
    }

    if (tabBtn) tabBtn.style.display = "inline-block";
    images.forEach(img => {
        const item = document.createElement("div");
        item.className = "gallery-item";
        item.onclick = () => window.open(img, '_blank');
        
        const image = document.createElement("img");
        image.className = "gallery-img";
        image.src = img;
        image.loading = "lazy";
        
        item.appendChild(image);
        if (container) container.appendChild(item);
    });
}

function refreshDetails() {
    if (!currentMeta || !currentMeta.__link) return;
    showDetails(currentMeta.__link, currentMeta.__provider);
}

// ============================
// 🔗 LINKS & EPISODES
// ============================
function switchDetailTab(tabId) {
    document.querySelectorAll('.detail-tab-content').forEach(c => {
        if(c) c.style.display = 'none';
    });
    document.querySelectorAll('.detail-tab').forEach(c => {
        if(c) c.classList.remove('active');
    });
    
    const targetContent = document.getElementById(`tab-${tabId}`);
    const targetBtn = document.getElementById(`tabBtn-${tabId}`);
    
    if (targetContent) targetContent.style.display = 'block';
    if (targetBtn) targetBtn.classList.add('active');
}

function renderLinks(meta) {
    const container = document.getElementById("linksContainer");
    const seasonSelector = document.getElementById("seasonSelector");
    container.innerHTML = "";
    if (seasonSelector) seasonSelector.innerHTML = "";
    
    switchDetailTab('episodes');

    if (!meta.linkList || !meta.linkList.length) {
         if (meta.episodes || meta.seasons) {
             container.innerHTML = "<p>Data structure has episodes but it's not handled by the default provider output format natively yet.</p>";
         } else {
             container.innerHTML = "<p style='color: var(--text-dim)'>No playable streams found.</p>";
         }
         
         const searchBtn = document.createElement("button");
         searchBtn.className = "stream-btn";
         searchBtn.style.marginTop = "10px";
         searchBtn.innerHTML = `<i data-lucide="search"></i> Search This Provider`;
         searchBtn.onclick = () => {
             fetchData(parseMediaInfo(meta.title).title, true);
         };
         container.appendChild(searchBtn);
         lucide.createIcons();
         return;
    }

    let seasonGroups = meta.linkList.filter(l => {
        if (!l) return false;
        const t = l.title || "Play";
        return !t.toLowerCase().includes("download") && 
        (l.episodesLink || /(Season|Episodes|S\d+|^S\d|Series|Ep\s*\d+|Episode)/i.test(t) || (l.directLinks && l.directLinks.length > 0));
    });
    
    let movieGroups = meta.linkList.filter(l => {
        if (!l) return false;
        const t = l.title || "Play";
        return !t.toLowerCase().includes("download") && 
        !l.episodesLink && 
        !/(Season|Episodes|S\d+|^S\d|Series|Ep\s*\d+|Episode)/i.test(t) && 
        (!l.directLinks || l.directLinks.length === 0);
    });

    if (seasonGroups.length > 0) {
        if (seasonSelector) seasonSelector.style.display = "flex";
        seasonGroups.forEach((group, index) => {
            const btn = document.createElement("button");
            btn.className = "season-tab" + (index === 0 ? " active" : "");
            btn.innerHTML = createStreamBadgeHtml(group.title, "layers");
            btn.onclick = () => {
                document.querySelectorAll('.season-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (group.directLinks && group.directLinks.length > 0) {
                    renderEpisodeList(group.directLinks, currentProvider);
                } else {
                    loadEpisodes(group.episodesLink || group.link, currentProvider);
                }
            };
            if (seasonSelector) seasonSelector.appendChild(btn);
        });
        
        // Render first season automatically
        if (seasonGroups[0].directLinks && seasonGroups[0].directLinks.length > 0) {
            renderEpisodeList(seasonGroups[0].directLinks, currentProvider);
        } else {
            loadEpisodes(seasonGroups[0].episodesLink || seasonGroups[0].link, currentProvider);
        }
    } else {
        if (seasonSelector) seasonSelector.style.display = "none";
        movieGroups.forEach(group => {
            const btn = document.createElement("div");
            btn.className = "stream-btn";
            btn.innerHTML = createStreamBadgeHtml(group.title, "play-circle");
            btn.onclick = () => {
                const link = group.directLinks?.[0]?.link || group.link;
                if (link) {
                    playStream(link, currentProvider);
                } else {
                    alert("No direct link found.");
                }
            };
            container.appendChild(btn);
        });
    }
}

function renderDownloads(meta) {
    const container = document.getElementById("downloadContainer");
    const titleObj = document.getElementById("downloadSectionTitle");
    
    if (container) container.innerHTML = "";
    
    if (!meta || !meta.linkList) {
        if (titleObj) titleObj.style.display = 'none';
        return;
    }
    
    let downloadGroups = meta.linkList.filter(l => {
        if (!l) return false;
        const t = l.title || "";
        return t.toLowerCase().includes("download");
    });
    
    if (downloadGroups.length === 0) {
        if (titleObj) titleObj.style.display = 'none';
        return;
    }
    
    if (titleObj) titleObj.style.display = 'block';
    
    downloadGroups.forEach(group => {
        let btn = document.createElement("a");
        btn.className = "download-btn";
        btn.href = "javascript:void(0)";
        btn.onclick = (e) => {
            e.preventDefault();
            resolveDownload(group.link, currentProvider, group.title);
        };
        btn.innerHTML = createStreamBadgeHtml(group.title, "download");
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
        btn.innerHTML = createStreamBadgeHtml(ep.title || "Episode", "play-circle");
        btn.onclick = () => playStream(ep.link, provider);
        
        const dlBtn = document.createElement("button");
        dlBtn.className = "ep-btn-dl";
        dlBtn.innerHTML = `<i data-lucide="download"></i>`;
        dlBtn.title = "Extract Download Links";
        dlBtn.onclick = () => {
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
        if (confirm("⚠️ No playable stream found for this provider. Would you like to search again?")) {
            fetchData(currentMeta ? parseMediaInfo(currentMeta.title).title : "", true);
        } else {
            setStatus("Online");
        }
        return;
    }

    setStatus("Online", "#22c55e");
    initPlayer(streams); // Pass entire array for fallback
}

function closeDownloadModal() {
    const modal = document.getElementById("downloadModal");
    modal.classList.remove('active');
    setTimeout(() => {
        modal.style.display = "none";
        document.getElementById("dlModalLinksContainer").innerHTML = "";
    }, 300);
}

async function resolveDownload(link, provider, title) {
    const modal = document.getElementById("downloadModal");
    modal.style.display = "flex";
    setTimeout(() => modal.classList.add('active'), 10);
    
    document.getElementById("dlModalEpName").innerText = title || "Extracting Media";
    document.getElementById("dlModalProvider").innerText = "Fetching links from " + provider + "...";
    
    const container = document.getElementById("dlModalLinksContainer");
    container.innerHTML = `<div class="loader" style="min-height: 100px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px;">
                        <div class="spinner" style="width: 24px; height: 24px;"></div>
                        <p style="font-size: 13px; color: var(--text-dim);">Extracting direct links...</p>
                    </div>`;

    const streams = await getResolvedStreams(link, provider);
    
    container.innerHTML = "";
    if (!streams || !streams.length) {
        container.innerHTML = "<p style='color: #ef4444; font-size:13px; text-align:center;'>Failed to extract direct download links.</p>";
        return;
    }

    document.getElementById("dlModalProvider").innerText = `Found ${streams.length} stream(s)`;

    streams.forEach((s, index) => {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.padding = "12px";
        row.style.border = "1px solid var(--glass-border)";
        row.style.borderRadius = "12px";
        row.style.background = "rgba(255,255,255,0.02)";

        const info = document.createElement("div");
        info.style.display = "flex";
        info.style.flexDirection = "column";
        info.style.gap = "4px";
        
        const qText = s.quality ? s.quality + "p " : "Unknown Quality ";
        const serverText = s.server ? `Server: ${s.server}` : "";
        info.innerHTML = `
            <div style="font-size: 14px; font-weight: 600; color: #fff;">${qText}</div>
            <div style="font-size: 12px; color: var(--text-muted);">${serverText}</div>
        `;

        const actions = document.createElement("div");
        actions.style.display = "flex";
        actions.style.gap = "8px";

        // Download Button
        const dlBtn = document.createElement("a");
        dlBtn.href = s.link;
        dlBtn.target = "_blank";
        dlBtn.style.background = "var(--accent)";
        dlBtn.style.color = "#fff";
        dlBtn.style.padding = "8px 16px";
        dlBtn.style.borderRadius = "8px";
        dlBtn.style.fontSize = "13px";
        dlBtn.style.fontWeight = "600";
        dlBtn.style.textDecoration = "none";
        dlBtn.style.display = "flex";
        dlBtn.style.alignItems = "center";
        dlBtn.style.gap = "6px";
        dlBtn.innerHTML = `<i data-lucide="download" style="width: 16px; height: 16px;"></i> Download`;

        // Copy Link Button
        const copyBtn = document.createElement("button");
        copyBtn.style.background = "rgba(139, 92, 246, 0.1)";
        copyBtn.style.color = "var(--accent)";
        copyBtn.style.border = "none";
        copyBtn.style.width = "36px";
        copyBtn.style.height = "36px";
        copyBtn.style.borderRadius = "8px";
        copyBtn.style.display = "flex";
        copyBtn.style.alignItems = "center";
        copyBtn.style.justifyContent = "center";
        copyBtn.style.cursor = "pointer";
        copyBtn.title = "Copy Link";
        copyBtn.innerHTML = `<i data-lucide="copy" style="width: 16px; height: 16px;"></i>`;
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(s.link);
            const originalHtml = copyBtn.innerHTML;
            copyBtn.innerHTML = `<i data-lucide="check" style="width: 16px; height: 16px; color: #22c55e;"></i>`;
            setTimeout(() => { copyBtn.innerHTML = originalHtml; lucide.createIcons(); }, 2000);
        };

        actions.appendChild(copyBtn);
        actions.appendChild(dlBtn);

        row.appendChild(info);
        row.appendChild(actions);
        container.appendChild(row);
    });
    
    lucide.createIcons();
}

// ============================
// 🎬 PLAYER
// ============================
function initPlayer(streams, initialIndex = 0) {
    let currentStreamIndex = initialIndex;
    let isTranscoding = false;
    let currentAudioTrack = null;
    switchPage('pagePlayer');

    function startPlayback(initialTime = 0) {
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

        // Handle seeking for transcoded streams
        if (isTranscoding && initialTime > 0) {
            if (streamUrl.includes('?')) {
                streamUrl += `&start=${initialTime}`;
            } else {
                streamUrl += `?start=${initialTime}`;
            }
        }

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
                    html: 'Video Source',
                    icon: '<i data-lucide="server" style="width:16px;height:16px"></i>',
                    selector: streams.map((s, i) => ({
                        html: `${i + 1}. ${s.server}`,
                        index: i,
                        default: i === currentStreamIndex,
                    })),
                    onSelect: function (item) {
                        if (item.index === currentStreamIndex) return item.html;
                        const currentTime = player.currentTime;
                        console.log(`📡 Switching to Source ${item.index + 1}: ${item.html}`);
                        currentStreamIndex = item.index;
                        startPlayback(currentTime);
                        return item.html;
                    },
                },
                {
                    html: 'Premium Audio (Transcode)',
                    icon: '<i data-lucide="zap" style="width:16px;height:16px;color:#8b5cf6"></i>',
                    switch: isTranscoding,
                    onSwitch: function (item) {
                        isTranscoding = !item.switch;
                        console.log("🛠 Transcoding toggled:", isTranscoding);
                        startPlayback(player.currentTime || 0); // Restart with proxy
                        return isTranscoding;
                    },
                },
                {
                    html: 'Open in VLC (External)',
                    icon: '<i data-lucide="monitor-play" style="width:16px;height:16px;color:#ef4444"></i>',
                    onSelect: function (item) {
                        fetch(`${getApiUrl()}/vlc`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ url: player.url })
                        });
                        alert("Attempting to open stream in VLC Media Player...");
                        return item.html;
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
                                // Default to Hindi if found
                                const hindiIndex = tracks.findIndex(t => 
                                    t.name?.toLowerCase().includes('hindi') || 
                                    t.lang?.toLowerCase().includes('hi') || 
                                    t.lang?.toLowerCase().includes('hin')
                                );
                                if (hindiIndex !== -1 && hls.audioTrack !== hindiIndex) {
                                    console.log("🧡 Auto-switching HLS to Hindi audio...");
                                    hls.audioTrack = hindiIndex;
                                }

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
                        // Default to Hindi if found
                        const hindiTrack = data.audioTracks.find(t => 
                            t.title?.toLowerCase().includes('hindi') || 
                            t.language?.toLowerCase().includes('hi') || 
                            t.language?.toLowerCase().includes('hin')
                        );

                        if (hindiTrack && currentAudioTrack === null) {
                            console.log("🧡 Auto-switching standard stream to Hindi audio via Transcode...");
                            isTranscoding = true;
                            currentAudioTrack = hindiTrack.index;
                            startPlayback(player.currentTime || 0); // Restart with Hindi
                            return;
                        }

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

        // Handle Seeks in Transcoding Mode
        player.on('video:seeking', (event) => {
            if (isTranscoding) {
                const targetTime = player.currentTime;
                console.log(`⏩ Seeking to ${targetTime} in Transcoding mode...`);
                startPlayback(targetTime);
            }
        });

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

function executeSearch() {
    const q = searchInput.value.trim();
    if (q) fetchData(q, true);
}

// ============================
// ❤️ WISHLIST
// ============================
function checkWishlistState() {
    if (!currentMeta || !currentMeta.__link) return;
    const wishlist = JSON.parse(localStorage.getItem('orbix_wishlist') || "[]");
    const isSaved = wishlist.some(item => item.link === currentMeta.__link);
    const btn = document.getElementById("wishlistBtn");
    const text = document.getElementById("wishlistText");
    
    if (isSaved) {
        btn.style.background = "#ef4444";
        btn.style.borderColor = "#ef4444";
        text.textContent = "Remove from Wishlist";
    } else {
        btn.style.background = "rgba(139, 92, 246, 0.1)";
        btn.style.borderColor = "var(--glass-border)";
        text.textContent = "Add to Wishlist";
    }
}

function toggleWishlist() {
    if (!currentMeta || !currentMeta.__link) return;
    
    let wishlist = JSON.parse(localStorage.getItem('orbix_wishlist') || "[]");
    const index = wishlist.findIndex(item => item.link === currentMeta.__link);
    
    if (index > -1) {
        wishlist.splice(index, 1);
    } else {
        wishlist.push({
            title: parseMediaInfo(currentMeta.title).title || currentMeta.title,
            image: currentMeta.image || "",
            link: currentMeta.__link,
            __provider: currentMeta.__provider,
            type: currentMeta.type || "Media"
        });
    }
    
    localStorage.setItem('orbix_wishlist', JSON.stringify(wishlist));
    checkWishlistState();
}

// ============================
// 🖼️ IMAGE FALLBACK
// ============================
async function handleImageError(img, title) {
    if (img.dataset.failed === "true") return;

    // 1. Try routing the original broken image through our proxy to bypass hotlinking protections (e.g. Vegamovies)
    if (!img.dataset.proxied && img.src && !img.src.includes('placeholder') && !img.src.includes('image-proxy')) {
        img.dataset.proxied = "true";
        const originalSrc = img.src;
        // If the src is a local broken link, don't proxy it
        if (originalSrc.startsWith('http')) {
            img.src = `${getApiUrl()}/image-proxy?url=${encodeURIComponent(originalSrc)}`;
            return;
        }
    }

    img.dataset.failed = "true";
    
    // 2. Try TMDB first
    if (tmdbKey && title) {
        try {
            const parsed = parseMediaInfo(title);
            const resp = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${tmdbKey}&query=${encodeURIComponent(parsed.title)}`);
            const data = await resp.json();
            const item = data.results?.[0];
            if (item && item.poster_path) {
                img.src = `https://image.tmdb.org/t/p/w500${item.poster_path}`;
                return;
            }
        } catch (e) { console.error("TMDB fallback failed", e); }
    }
    

    // 3. Nice CSS-based placeholder if all fails
    img.src = 'https://via.placeholder.com/300x450/16161a/8b5cf6?text=' + encodeURIComponent(title.substring(0, 20));
}

// 🚀 START
loadProviders();