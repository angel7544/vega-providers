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
let currentPlayerType = 1; // 1 = Artplayer, 2 = Native HTML5/HLS.js player
let providersMap = {};
let allProviders = []; // Stores all providers from manifest.json
let tmdbKey = localStorage.getItem('tmdb_api_key') || "";

// ============================
// 🎨 THEME & UI MANAGER
// ============================
function initTheme() {
    const savedTheme = localStorage.getItem('orbix_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeUI(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('orbix_theme', newTheme);
    updateThemeUI(newTheme);
}

function updateThemeUI(theme) {
    const btnIcon = document.getElementById('themeBtnIcon');
    const btnText = document.getElementById('themeBtnText');
    if (btnIcon) {
        if (theme === 'light') {
            btnIcon.setAttribute('data-lucide', 'moon');
        } else {
            btnIcon.setAttribute('data-lucide', 'sun');
        }
    }
    if (btnText) {
        if (theme === 'light') {
            btnText.textContent = "Dark Mode";
        } else {
            btnText.textContent = "Light Mode";
        }
    }
    if (btnIcon || btnText) {
        if (window.lucide) window.lucide.createIcons();
    }
}

// ============================
// 📱 PWA SERVICE WORKER
// ============================
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker registered successfully:', reg.scope))
            .catch(err => console.log('Service Worker registration failed:', err));
    });
}

// ============================
// ❤️ WISHLIST BADGE
// ============================
function updateWishlistBadge() {
    const wishlist = JSON.parse(localStorage.getItem('orbix_wishlist') || "[]");
    const badge = document.getElementById("wishlistBadge");
    if (badge) {
        badge.textContent = wishlist.length;
        badge.style.display = wishlist.length > 0 ? "inline-flex" : "none";
    }
}

// Caching State
let browseScrollPos = 0;
let isBrowseCached = false;
let currentFilter = "";
let currentSearch = "";
let currentCatalogItems = []; // Stores the current provider's catalog options

// Infinite Scroll State
let currentPage = 1;
let isFetchingNextPage = false;
let hasMore = true;

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
// ============================
// 🎭 CUSTOM SELECT DROPDOWN HANDLER
// ============================
function initCustomDropdownEvents() {
    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        document.querySelectorAll('.custom-dropdown').forEach(container => {
            const trigger = container.querySelector('.custom-dropdown-trigger');
            const menu = container.querySelector('.custom-dropdown-menu');
            if (trigger && menu && !container.contains(e.target)) {
                trigger.setAttribute('aria-expanded', 'false');
                menu.classList.remove('show');
            }
        });
    });

    // Toggle menu dropdown on click
    document.querySelectorAll('.custom-dropdown').forEach(container => {
        const trigger = container.querySelector('.custom-dropdown-trigger');
        const menu = container.querySelector('.custom-dropdown-menu');
        if (!trigger || !menu) return;

        trigger.onclick = (e) => {
            e.stopPropagation();
            const isExpanded = trigger.getAttribute('aria-expanded') === 'true';
            
            // Close other custom dropdowns
            document.querySelectorAll('.custom-dropdown').forEach(other => {
                if (other !== container) {
                    other.querySelector('.custom-dropdown-trigger')?.setAttribute('aria-expanded', 'false');
                    other.querySelector('.custom-dropdown-menu')?.classList.remove('show');
                }
            });

            trigger.setAttribute('aria-expanded', !isExpanded ? 'true' : 'false');
            menu.classList.toggle('show', !isExpanded);
        };
    });
}

function syncCustomDropdown(containerId, nativeSelectId) {
    const container = document.getElementById(containerId);
    const select = document.getElementById(nativeSelectId);
    if (!container || !select) return;

    const trigger = container.querySelector('.custom-dropdown-trigger');
    const menu = container.querySelector('.custom-dropdown-menu');
    const labelEl = trigger.querySelector('.custom-dropdown-value');
    if (!trigger || !menu || !labelEl) return;

    // Set active style class if selected value is not empty
    if (select.value && select.value !== "") {
        trigger.classList.add('active');
    } else {
        trigger.classList.remove('active');
    }

    menu.innerHTML = "";
    const children = Array.from(select.children);
    const hasOptGroups = children.some(child => child.tagName === 'OPTGROUP');

    // Sync trigger label text
    let selectedText = select.options[select.selectedIndex]?.textContent || "Select...";
    if (select.selectedIndex === -1 || (select.selectedIndex === 0 && select.options[0].disabled)) {
        selectedText = select.options[0]?.textContent || "Select...";
    }
    labelEl.textContent = selectedText;

    const buildItem = (opt) => {
        if (opt.disabled) return null;
        const item = document.createElement('div');
        item.className = 'custom-dropdown-item';
        if (select.value === opt.value) {
            item.classList.add('selected');
        }
        item.dataset.value = opt.value;

        const textSpan = document.createElement('span');
        textSpan.textContent = opt.textContent;
        item.appendChild(textSpan);

        if (select.value === opt.value) {
            const checkIcon = document.createElement('i');
            checkIcon.setAttribute('data-lucide', 'check');
            checkIcon.style.width = '14px';
            checkIcon.style.height = '14px';
            item.appendChild(checkIcon);
        }

        item.onclick = (e) => {
            e.stopPropagation();
            select.value = opt.value;
            select.dispatchEvent(new Event('change'));
            
            trigger.setAttribute('aria-expanded', 'false');
            menu.classList.remove('show');
            syncCustomDropdown(containerId, nativeSelectId);
        };

        return item;
    };

    if (hasOptGroups) {
        children.forEach(child => {
            if (child.tagName === 'OPTGROUP') {
                const header = document.createElement('span');
                header.className = 'custom-dropdown-header';
                header.textContent = child.label;
                menu.appendChild(header);

                Array.from(child.children).forEach(opt => {
                    const item = buildItem(opt);
                    if (item) menu.appendChild(item);
                });
            } else if (child.tagName === 'OPTION') {
                const item = buildItem(child);
                if (item) menu.appendChild(item);
            }
        });
    } else {
        children.forEach(opt => {
            const item = buildItem(opt);
            if (item) menu.appendChild(item);
        });
    }

    if (window.lucide) {
        window.lucide.createIcons();
    }
}

// Call global dropdown event registers
setTimeout(initCustomDropdownEvents, 100);


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
    // Render active providers checklist
    renderSettingsProviders();
    
    settingsModal.style.display = "flex";
    setTimeout(() => settingsModal.classList.add('active'), 10);
}

function closeSettingsModal() {
    settingsModal.classList.remove('active');
    setTimeout(() => settingsModal.style.display = "none", 300);
}

function saveSettings() {
    // Save disabled providers list
    const checkboxes = document.querySelectorAll("#settingsProvidersList input[type='checkbox']");
    const disabledList = [];
    checkboxes.forEach(chk => {
        if (!chk.checked) {
            disabledList.push(chk.dataset.providerId);
        }
    });
    localStorage.setItem('orbix_disabled_providers', JSON.stringify(disabledList));

    closeSettingsModal();
    window.location.reload();
}

function renderSettingsProviders() {
    const container = document.getElementById("settingsProvidersList");
    if (!container) return;
    
    container.innerHTML = "";
    const disabledProviders = JSON.parse(localStorage.getItem('orbix_disabled_providers') || '[]');
    
    allProviders.forEach(p => {
        const item = document.createElement("div");
        item.style.display = "flex";
        item.style.alignItems = "center";
        item.style.gap = "8px";
        item.style.fontSize = "13px";
        
        const isChecked = !disabledProviders.includes(p.value);
        
        item.innerHTML = `
            <input type="checkbox" id="prov-chk-${p.value}" data-provider-id="${p.value}" ${isChecked ? 'checked' : ''} style="cursor:pointer; accent-color: var(--accent);">
            <label for="prov-chk-${p.value}" style="cursor:pointer; color: var(--text-dim); font-weight: 500;">${p.display_name}</label>
        `;
        container.appendChild(item);
    });
}

function getFilterForCategory(keyword, fallbackFilter) {
    if (!currentCatalogItems || currentCatalogItems.length === 0) return fallbackFilter;
    if (keyword === "") return currentCatalogItems[0]?.filter || fallbackFilter;
    const match = currentCatalogItems.find(c => c.title.toLowerCase().includes(keyword.toLowerCase()));
    return match ? match.filter : (currentCatalogItems[0]?.filter || fallbackFilter);
}

function loadHome() { 
    const desktopSelect = document.getElementById("categoriesDropdown");
    const mobileSelect = document.getElementById("mobileCategoriesDropdown");
    if (desktopSelect) {
        desktopSelect.value = "";
        desktopSelect.classList.remove("active");
    }
    if (mobileSelect) {
        mobileSelect.value = "";
    }
    syncCustomDropdown("categoriesDropdownContainer", "categoriesDropdown");

    const filter = getFilterForCategory("", "");
    if (currentFilter === filter && !currentSearch) { backToBrowse(); updateActiveNav(0); return; }
    currentSearch = ""; isBrowseCached = false; fetchData(filter); updateActiveNav(0); switchPage('pageBrowse'); 
}
function loadWishlist() { 
    const desktopSelect = document.getElementById("categoriesDropdown");
    const mobileSelect = document.getElementById("mobileCategoriesDropdown");
    if (desktopSelect) {
        desktopSelect.value = "";
        desktopSelect.classList.remove("active");
    }
    if (mobileSelect) {
        mobileSelect.value = "";
    }
    syncCustomDropdown("categoriesDropdownContainer", "categoriesDropdown");

    if (currentFilter === "wishlist") { backToBrowse(); updateActiveNav(1); return; }
    currentFilter = "wishlist"; currentSearch = ""; isBrowseCached = false;
    updateActiveNav(1); 
    switchPage('pageBrowse'); 
    catalogContainer.style.display = "flex";
    catalogContainer.innerHTML = `
        <button class="catalog-btn active" onclick="refreshWishlistData()" style="display: flex; align-items: center; gap: 8px;">
            <i data-lucide="refresh-cw" style="width: 14px; height: 14px;"></i> Refresh Wishlist Data
        </button>
    `;
    lucide.createIcons();
    const wishlist = JSON.parse(localStorage.getItem('orbix_wishlist') || "[]");
    renderGrid(wishlist);
    setStatus(wishlist.length ? "Online" : "Wishlist is empty");
}

function updateActiveNav(index) {
    const desktopLinks = document.querySelectorAll('.nav-links .nav-link');
    const mobileLinks = document.querySelectorAll('.mobile-bottom-nav .mobile-nav-link');
    
    desktopLinks.forEach((l, i) => {
        if (i === index) l.classList.add('active');
        else l.classList.remove('active');
    });
    
    mobileLinks.forEach((l, i) => {
        // i=0 is Home, i=1 is Browse, i=2 is Wishlist, i=3 is Settings
        let shouldBeActive = false;
        if (index === 0 && i === 0) shouldBeActive = true;
        if (index === 1 && i === 2) shouldBeActive = true;
        
        if (shouldBeActive) l.classList.add('active');
        else l.classList.remove('active');
    });
}

function onCategorySelect(value) {
    if (!value) return;
    
    // Clear active classes from desktop links
    const desktopLinks = document.querySelectorAll('.nav-links .nav-link');
    desktopLinks.forEach(l => l.classList.remove('active'));

    // Set Browse (index 1) as active on mobile and clear others
    const mobileLinks = document.querySelectorAll('.mobile-bottom-nav .mobile-nav-link');
    mobileLinks.forEach((l, i) => {
        if (i === 1) l.classList.add('active');
        else l.classList.remove('active');
    });
    
    // Synchronize desktop and mobile select values
    const desktopSelect = document.getElementById("categoriesDropdown");
    const mobileSelect = document.getElementById("mobileCategoriesDropdown");
    if (desktopSelect) desktopSelect.value = value;
    if (mobileSelect) mobileSelect.value = value;
    
    // Add active styling to dropdown
    desktopSelect?.classList.add("active");
    
    syncCustomDropdown("categoriesDropdownContainer", "categoriesDropdown");
    
    isBrowseCached = false;
    fetchData(value);
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
        allProviders = providers; // Keep full list for Settings panel

        providerSelect.innerHTML = "";
        providersMap = {};

        // Track and map all providers
        providers.forEach(p => {
            providersMap[p.value] = p;
        });

        // Filter out disabled providers from user selection dropdown
        const disabledProviders = JSON.parse(localStorage.getItem('orbix_disabled_providers') || '[]');
        const enabledProviders = providers.filter(p => !disabledProviders.includes(p.value));

        enabledProviders.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.value;
            opt.textContent = p.display_name;
            providerSelect.appendChild(opt);
        });

        const isCurrentProviderDisabled = disabledProviders.includes(currentProvider);
        if (!currentProvider || currentProvider === "__all__" || !providersMap[currentProvider] || isCurrentProviderDisabled) {
            currentProvider = enabledProviders[0]?.value || "";
            localStorage.setItem('orbix_last_provider', currentProvider);
        }
        providerSelect.value = currentProvider;
        syncCustomDropdown("providerDropdownContainer", "providerSelect");

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

async function loadCatalog() {
    const desktopSelect = document.getElementById("categoriesDropdown");
    const mobileSelect = document.getElementById("mobileCategoriesDropdown");
    
    const showLoading = () => {
        const html = `<option value="" disabled selected>Loading...</option>`;
        if (desktopSelect) desktopSelect.innerHTML = html;
        if (mobileSelect) mobileSelect.innerHTML = html;
    };

    try {
        showLoading();

        // Hide legacy catalog buttons container
        if (catalogContainer) catalogContainer.style.display = "none";

        const resp = await fetch(`${getApiUrl()}/catalog?provider=${currentProvider}`);
        if (!resp.ok) throw new Error();

        const data = await resp.json();
        currentCatalogItems = [...(data.catalog || []), ...(data.genres || [])];
        
        renderCatalog(data.catalog || [], data.genres || []);

    } catch {
        // Fallback categories if API fails (just show Home category)
        currentCatalogItems = [
            { title: "Home", filter: "" }
        ];
        renderCatalog([
            { title: "Home", filter: "" }
        ], []);
        fetchData("");
    }
}

function renderCatalog(catalog, genres) {
    const desktopSelect = document.getElementById("categoriesDropdown");
    const mobileSelect = document.getElementById("mobileCategoriesDropdown");
    
    const buildOptionsHtml = () => {
        let html = `<option value="" disabled selected>Categories</option>`;
        
        if (catalog && catalog.length > 0) {
            html += `<optgroup label="Categories">`;
            catalog.forEach(item => {
                html += `<option value="${item.filter}">${item.title}</option>`;
            });
            html += `</optgroup>`;
        }
        
        if (genres && genres.length > 0) {
            html += `<optgroup label="Genres">`;
            genres.forEach(item => {
                html += `<option value="${item.filter}">${item.title}</option>`;
            });
            html += `</optgroup>`;
        }
        return html;
    };

    const optionsHtml = buildOptionsHtml();
    
    if (desktopSelect) {
        desktopSelect.innerHTML = optionsHtml;
        desktopSelect.value = currentFilter || "";
        if (desktopSelect.value && desktopSelect.value !== "") {
            desktopSelect.classList.add("active");
        } else {
            desktopSelect.value = "";
            desktopSelect.classList.remove("active");
        }
    }
    
    if (mobileSelect) {
        mobileSelect.innerHTML = optionsHtml;
        mobileSelect.value = currentFilter || "";
    }
    syncCustomDropdown("categoriesDropdownContainer", "categoriesDropdown");
}

// ============================
// 🔍 FETCH DATA
// ============================
async function fetchData(filter, search = false, append = false) {
    if (!append) {
        currentPage = 1;
        hasMore = true;
        isFetchingNextPage = false;
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
    }

    try {
        const func = search ? "getSearchPosts" : "getPosts";
        const params = search
            ? { searchQuery: filter, page: currentPage }
            : { filter, page: currentPage };

        const resp = await fetch(`${getApiUrl()}/fetch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider: currentProvider, functionName: func, params })
        });

        const results = await resp.json();

        if (append) {
            const loaderEl = document.getElementById("page-loader");
            if (loaderEl) loaderEl.remove();
        }

        if (results && results.length > 0) {
            renderGrid(results, append);
            setStatus("Online");
        } else {
            if (append) {
                hasMore = false;
                showScrollToast("No more content to load.");
            } else {
                renderGrid([]);
                setStatus("No results");
            }
        }

    } catch (err) {
        console.error(err);
        if (append) {
            const loaderEl = document.getElementById("page-loader");
            if (loaderEl) loaderEl.remove();
            showScrollToast("Failed to load more content.");
            currentPage--; // Revert page index on error
        } else {
            setStatus("Fetch Error", "#ef4444");
        }
    } finally {
        if (append) {
            isFetchingNextPage = false;
        }
    }
}

// ============================
// 🖥️ GRID
// ============================
function isValidImage(url) {
    if (!url || typeof url !== 'string') return false;
    
    const lower = url.toLowerCase();
    if (lower.includes('placeholder')) return false;
    if (lower.includes('data:image/gif;base64')) return false;
    if (lower.length < 100 && lower.startsWith('data:image/')) return false;
    
    if (lower.startsWith('data:image/')) return true;
    
    if (lower.startsWith('http')) {
        const hasExt = lower.includes('.jpg') || lower.includes('.jpeg') || lower.includes('.png') || lower.includes('.webp');
        const isKnown = lower.includes('tmdb.org') || lower.includes('tvmaze.com');
        return hasExt || isKnown;
    }
    
    return false;
}

function createMediaCard(item) {
    const card = document.createElement("div");
    card.className = "media-card";

    card.onclick = () => {
        const provider = item.__provider || currentProvider;
        const tmdbId = item.tmdbId || item.tmdb || item.tmdb_id || null;
        const imdbId = item.imdbId || item.imdb || item.imdb_id || null;
        showDetails(item.link, provider, item.image, tmdbId, item.type, imdbId);
    };

    const validImg = isValidImage(item.image) ? item.image : null;
    const proxiedImage = validImg || "missing.jpg";

    const providerDisplayName = item.__provider && providersMap[item.__provider] 
        ? providersMap[item.__provider].display_name 
        : item.__provider;

    card.innerHTML = `
        <div class="media-poster-container">
            <img class="media-poster" src="${proxiedImage}" loading="lazy" referrerpolicy="no-referrer"
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
    syncCustomDropdown("providerDropdownContainer", "providerSelect");
    currentProvider = providerId;
    localStorage.setItem('orbix_last_provider', currentProvider);
    await loadCatalog();
    const defaultFilter = currentCatalogItems[0] ? currentCatalogItems[0].filter : "";
    fetchData(defaultFilter);
};

function renderGrid(data, append = false) {
    if (!append) {
        contentGrid.innerHTML = "";
    }

    if (!data || (data.isGrouped && data.groups.length === 0) || (!data.isGrouped && data.length === 0)) {
        if (!append) {
            contentGrid.innerHTML = `
                <div style="grid-column: 1/-1; text-align:center; padding: 40px; color: var(--text-dim);">
                    <i data-lucide="ghost" style="width: 48px; height: 48px; margin-bottom: 16px;"></i>
                    <p>No results found</p>
                </div>
            `;
            lucide.createIcons();
        }
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
async function showDetails(link, provider, fallbackPoster = null, explicitTmdbId = null, explicitType = null, explicitImdbId = null) {
    window.scrollTo(0, 0); // scroll to top when opening details
    
    currentProvider = provider;
    switchPage('pageDetails');
    
    // Clear old details while loading
    document.getElementById("detailTitle").textContent = "Loading...";
    document.getElementById("detailSynopsis").textContent = "";
    document.getElementById("detailPoster").src = fallbackPoster || "";
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
        
        const posterImg = isValidImage(currentMeta.image) ? currentMeta.image : (isValidImage(fallbackPoster) ? fallbackPoster : null);
        const imgEl = document.getElementById("detailPoster");
        
        imgEl.src = posterImg || "missing.jpg";
        // Fix for detail page posters failing (like Vegamovies)
        imgEl.onerror = () => handleImageError(imgEl, parsed.title);

        // Hide Rating/Year placeholders (already hidden in CSS/HTML but ensuring state here)
        document.getElementById("detailRating").textContent = "";
        document.getElementById("detailYear").textContent = "";

        // Update backdrop safely
        const backdropEl = document.getElementById("detailBackdrop");
        if (posterImg) {
            backdropEl.style.backgroundImage = `url(${posterImg})`;
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

        // 🌟 Enrich missing metadata via TMDB/TVMaze
        const metaTmdbId = currentMeta.tmdbId || currentMeta.tmdb || currentMeta.tmdb_id || explicitTmdbId;
        const metaType = currentMeta.type || explicitType;
        const metaImdbId = currentMeta.imdbId || currentMeta.imdb || currentMeta.imdb_id || explicitImdbId;
        enrichMetadata(parsed.title, metaTmdbId, metaType, metaImdbId);

    } catch (err) {
        console.error("Details fetch error:", err);
        document.getElementById("detailTitle").textContent = "Failed to load Details";
        document.getElementById("linksContainer").innerHTML = `<p>Stream retrieval failed.</p><pre style="color:red; font-size:12px; margin-top:10px; white-space:pre-wrap">${err.stack || err.message}</pre>`;
    }
}

// ============================
// 🌟 PREMIUM METADATA TOOLS
// ============================
async function enrichMetadata(title, explicitTmdbId = null, mediaType = null, explicitImdbId = null) {
    if (!title) return;
    const parsed = parseMediaInfo(title);
    const q = encodeURIComponent(parsed.title);
    let enriched = false;

    // 1. Try TMDB
    if (tmdbKey) {
        try {
            let item = null;
            if (explicitImdbId && !explicitTmdbId) {
                const res = await fetch(`https://api.themoviedb.org/3/find/${explicitImdbId}?api_key=${tmdbKey}&external_source=imdb_id`);
                const data = await res.json();
                item = data.movie_results?.[0] || data.tv_results?.[0];
            } else if (explicitTmdbId) {
                const t = (mediaType || "").toLowerCase();
                if (t.includes("movie")) {
                    const res = await fetch(`https://api.themoviedb.org/3/movie/${explicitTmdbId}?api_key=${tmdbKey}`);
                    item = await res.json();
                } else if (t.includes("series") || t.includes("tv")) {
                    const res = await fetch(`https://api.themoviedb.org/3/tv/${explicitTmdbId}?api_key=${tmdbKey}`);
                    item = await res.json();
                } else {
                    const [resM, resT] = await Promise.all([
                        fetch(`https://api.themoviedb.org/3/movie/${explicitTmdbId}?api_key=${tmdbKey}`),
                        fetch(`https://api.themoviedb.org/3/tv/${explicitTmdbId}?api_key=${tmdbKey}`)
                    ]);
                    const dataM = await resM.json();
                    const dataT = await resT.json();
                    item = dataM.id ? dataM : (dataT.id ? dataT : null);
                }
            }
            
            if (!item || !item.id) {
                const resp = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=${tmdbKey}&query=${q}`);
                const data = await resp.json();
                item = data.results?.[0];
            }
            
            if (item && item.id) {
                const synopsisEl = document.getElementById("detailSynopsis");
                if (item.overview && (!synopsisEl.textContent || synopsisEl.textContent === "No synopsis available." || synopsisEl.textContent.trim() === "")) {
                    synopsisEl.textContent = item.overview;
                }
                
                const imgEl = document.getElementById("detailPoster");
                if (item.poster_path && (!imgEl.src || imgEl.src.includes('placehold.co') || imgEl.dataset.failed === "true" || imgEl.src === window.location.href)) {
                    imgEl.src = `https://image.tmdb.org/t/p/w500${item.poster_path}`;
                    imgEl.dataset.enriched = "true";
                }
                
                if (item.vote_average) {
                    const ratingEl = document.getElementById("detailRating");
                    ratingEl.innerHTML = `<i data-lucide="star" style="width:14px;height:14px;margin-right:4px;"></i> ${item.vote_average.toFixed(1)}`;
                    ratingEl.style.display = "inline-flex";
                    lucide.createIcons();
                }
                
                const year = item.release_date ? item.release_date.split('-')[0] : (item.first_air_date ? item.first_air_date.split('-')[0] : "");
                if (year) {
                    const yearEl = document.getElementById("detailYear");
                    yearEl.textContent = year;
                    yearEl.style.display = "inline-block";
                }

                if (item.backdrop_path) {
                    const backdropEl = document.getElementById("detailBackdrop");
                    if (!backdropEl.style.backgroundImage || backdropEl.style.backgroundImage === 'none') {
                        backdropEl.style.backgroundImage = `url(https://image.tmdb.org/t/p/w1280${item.backdrop_path})`;
                    }
                }
                enriched = true;
            }
        } catch (e) { console.error("TMDB enrich failed", e); }
    }

    // 2. Try TVMaze if TMDB failed or not available
    if (!enriched) {
        try {
            const resp = await fetch(`https://api.tvmaze.com/search/shows?q=${q}`);
            const data = await resp.json();
            const show = data?.[0]?.show;
            if (show) {
                const synopsisEl = document.getElementById("detailSynopsis");
                if (show.summary && (!synopsisEl.textContent || synopsisEl.textContent === "No synopsis available." || synopsisEl.textContent.trim() === "")) {
                    synopsisEl.innerHTML = show.summary; // TVMaze returns HTML
                }
                
                const imgEl = document.getElementById("detailPoster");
                if (show.image?.original && (!imgEl.src || imgEl.src.includes('placehold.co') || imgEl.dataset.failed === "true" || imgEl.src === window.location.href)) {
                    imgEl.src = show.image.original;
                    imgEl.dataset.enriched = "true";
                }
                
                if (show.rating?.average) {
                    const ratingEl = document.getElementById("detailRating");
                    ratingEl.innerHTML = `<i data-lucide="star" style="width:14px;height:14px;margin-right:4px;"></i> ${show.rating.average}`;
                    ratingEl.style.display = "inline-flex";
                    lucide.createIcons();
                }
                
                const year = show.premiered ? show.premiered.split('-')[0] : "";
                if (year) {
                    const yearEl = document.getElementById("detailYear");
                    yearEl.textContent = year;
                    yearEl.style.display = "inline-block";
                }
            }
        } catch (e) { console.error("TVMaze enrich failed", e); }
    }
}

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
        if (seasonSelector) {
            seasonSelector.style.display = "block";
            seasonSelector.innerHTML = "";
            
            // Create custom colorful dropdown container
            const dropdown = document.createElement("div");
            dropdown.className = "colorful-dropdown";
            
            const trigger = document.createElement("button");
            trigger.className = "colorful-dropdown-trigger";
            trigger.type = "button";
            trigger.setAttribute("aria-haspopup", "listbox");
            trigger.setAttribute("aria-expanded", "false");
            
            // Trigger content container
            const valueSpan = document.createElement("div");
            valueSpan.className = "colorful-dropdown-value";
            valueSpan.style.width = "100%";
            valueSpan.innerHTML = createStreamBadgeHtml(seasonGroups[0].title, "layers");
            
            // Centering helper: overwrite default align-items for trigger badge layout
            const centerBadgeLayout = (container) => {
                const innerContainer = container.querySelector('div');
                if (innerContainer) {
                    innerContainer.style.alignItems = 'center';
                    innerContainer.style.textAlign = 'center';
                    innerContainer.style.justifyContent = 'center';
                    const firstRow = innerContainer.querySelector('div');
                    if (firstRow) {
                        firstRow.style.justifyContent = 'center';
                    }
                    const badgesDiv = innerContainer.querySelector('div:nth-child(2)');
                    if (badgesDiv) {
                        badgesDiv.style.justifyContent = 'center';
                        badgesDiv.style.paddingLeft = '0';
                    }
                }
            };
            centerBadgeLayout(valueSpan);
            
            const chevron = document.createElement("i");
            chevron.setAttribute("data-lucide", "chevron-down");
            chevron.className = "dropdown-chevron";
            chevron.style.width = "18px";
            chevron.style.height = "18px";
            
            trigger.appendChild(valueSpan);
            trigger.appendChild(chevron);
            
            const menu = document.createElement("div");
            menu.className = "colorful-dropdown-menu";
            
            // Function to close dropdown
            const closeDropdown = () => {
                trigger.setAttribute("aria-expanded", "false");
                menu.classList.remove("show");
            };
            
            // Toggle dropdown
            trigger.onclick = (e) => {
                e.stopPropagation();
                const isExpanded = trigger.getAttribute("aria-expanded") === "true";
                document.querySelectorAll('.custom-dropdown, .colorful-dropdown').forEach(other => {
                    if (other !== dropdown) {
                        const otherTrigger = other.querySelector('.custom-dropdown-trigger, .colorful-dropdown-trigger');
                        const otherMenu = other.querySelector('.custom-dropdown-menu, .colorful-dropdown-menu');
                        if (otherTrigger) otherTrigger.setAttribute('aria-expanded', 'false');
                        if (otherMenu) otherMenu.classList.remove('show');
                    }
                });
                trigger.setAttribute("aria-expanded", !isExpanded ? "true" : "false");
                menu.classList.toggle("show", !isExpanded);
            };
            
            // Add items to menu
            seasonGroups.forEach((group, index) => {
                const item = document.createElement("div");
                item.className = "colorful-dropdown-item" + (index === 0 ? " selected" : "");
                item.innerHTML = createStreamBadgeHtml(group.title, "layers");
                centerBadgeLayout(item);
                
                item.onclick = (e) => {
                    e.stopPropagation();
                    
                    menu.querySelectorAll(".colorful-dropdown-item").forEach(el => el.classList.remove("selected"));
                    item.classList.add("selected");
                    
                    valueSpan.innerHTML = createStreamBadgeHtml(group.title, "layers");
                    centerBadgeLayout(valueSpan);
                    if (window.lucide) window.lucide.createIcons();
                    
                    closeDropdown();
                    
                    if (group.directLinks && group.directLinks.length > 0) {
                        renderEpisodeList(group.directLinks, currentProvider);
                    } else {
                        loadEpisodes(group.episodesLink || group.link, currentProvider);
                    }
                };
                
                menu.appendChild(item);
            });
            
            dropdown.appendChild(trigger);
            dropdown.appendChild(menu);
            seasonSelector.appendChild(dropdown);
            
            // Register close dropdown on clicking outside
            document.addEventListener('click', (e) => {
                if (!dropdown.contains(e.target)) {
                    closeDropdown();
                }
            });
            
            if (window.lucide) window.lucide.createIcons();
        }
        
        // Render first season automatically
        if (seasonGroups[0].directLinks && seasonGroups[0].directLinks.length > 0) {
            renderEpisodeList(seasonGroups[0].directLinks, currentProvider);
        } else {
            loadEpisodes(seasonGroups[0].episodesLink || seasonGroups[0].link, currentProvider);
        }
    } else {
        if (seasonSelector) seasonSelector.style.display = "none";
        
        if (movieGroups.length > 0) {
            const dropdownContainer = document.createElement("div");
            dropdownContainer.className = "stream-dropdown-container";
            dropdownContainer.style.width = "100%";
            dropdownContainer.style.marginBottom = "16px";
            
            const select = document.createElement("select");
            select.className = "movie-select";
            select.id = "movieStreamSelect";
            
            movieGroups.forEach((group, index) => {
                const opt = document.createElement("option");
                opt.value = index;
                opt.textContent = getStreamLabel(group);
                select.appendChild(opt);
            });
            
            const playBtn1 = document.createElement("button");
            playBtn1.className = "stream-action-btn";
            playBtn1.innerHTML = `<i data-lucide="play-circle"></i> Play`;
            playBtn1.onclick = () => {
                const selectedIndex = parseInt(select.value);
                const group = movieGroups[selectedIndex];
                const link = group.directLinks?.[0]?.link || group.link;
                if (link) {
                    currentPlayerType = 1;
                    playStream(link, currentProvider);
                } else {
                    alert("No direct link found.");
                }
            };
            
            const playBtn2 = document.createElement("button");
            playBtn2.className = "stream-action-btn secondary";
            playBtn2.innerHTML = `<i data-lucide="play"></i> Play Native`;
            playBtn2.title = "Play with Player 2 (Native)";
            playBtn2.onclick = () => {
                const selectedIndex = parseInt(select.value);
                const group = movieGroups[selectedIndex];
                const link = group.directLinks?.[0]?.link || group.link;
                if (link) {
                    currentPlayerType = 2;
                    playStream(link, currentProvider);
                } else {
                    alert("No direct link found.");
                }
            };
            
            dropdownContainer.appendChild(select);
            dropdownContainer.appendChild(playBtn1);
            dropdownContainer.appendChild(playBtn2);
            
            container.appendChild(dropdownContainer);
        } else {
            container.innerHTML = "<p style='color: var(--text-dim)'>No playable streams found.</p>";
        }
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
    
    const dropdownContainer = document.createElement("div");
    dropdownContainer.className = "stream-dropdown-container";
    dropdownContainer.style.width = "100%";
    
    const select = document.createElement("select");
    select.className = "download-select";
    select.id = "movieDownloadSelect";
    
    downloadGroups.forEach((group, index) => {
        const opt = document.createElement("option");
        opt.value = index;
        opt.textContent = getStreamLabel(group);
        select.appendChild(opt);
    });
    
    const dlBtn = document.createElement("button");
    dlBtn.className = "stream-action-btn";
    dlBtn.innerHTML = `<i data-lucide="download"></i> Get Links`;
    dlBtn.onclick = () => {
        const selectedIndex = parseInt(select.value);
        const group = downloadGroups[selectedIndex];
        resolveDownload(group.link, currentProvider, group.title);
    };
    
    dropdownContainer.appendChild(select);
    dropdownContainer.appendChild(dlBtn);
    container.appendChild(dropdownContainer);
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

        const btn1 = document.createElement("button");
        btn1.className = "ep-btn";
        btn1.innerHTML = createStreamBadgeHtml(ep.title || "Episode", "play-circle");
        btn1.onclick = () => {
            currentPlayerType = 1;
            playStream(ep.link, provider, ep.title);
        };
        
        const btn2 = document.createElement("button");
        btn2.className = "ep-btn-dl";
        btn2.style.color = "var(--accent)";
        btn2.innerHTML = `<i data-lucide="play"></i>`;
        btn2.title = "Play with Player 2 (Native)";
        btn2.onclick = () => {
            currentPlayerType = 2;
            playStream(ep.link, provider, ep.title);
        };

        const dlBtn = document.createElement("button");
        dlBtn.className = "ep-btn-dl";
        dlBtn.innerHTML = `<i data-lucide="download"></i>`;
        dlBtn.title = "Extract Download Links";
        dlBtn.onclick = () => {
            resolveDownload(ep.link, provider, ep.title);
        };

        row.appendChild(btn1);
        row.appendChild(btn2);
        row.appendChild(dlBtn);
        container.appendChild(row);
    });
    
    lucide.createIcons();
}

// Duplicate renderDownloads removed to fix TypeError on downloadSection.

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

async function playStream(link, provider, episodeTitle = "") {
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
    initPlayer(streams, 0, episodeTitle); // Pass entire array for fallback
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
        dlBtn.rel = "noreferrer";
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
function initPlayer(streams, initialIndex = 0, episodeTitle = "") {
    let currentStreamIndex = initialIndex;
    let isTranscoding = false;
    let currentAudioTrack = null;
    let loadTimeout = null;

    switchPage('pagePlayer');

    function startPlayback(initialTime = 0) {
        // Clear any previous loading timeouts
        if (loadTimeout) clearTimeout(loadTimeout);

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

        // If transcoding is active, we ensure the URL routes through our stream proxy
        let isAlreadyProxied = streamUrl.includes("/stream?");
        if (isTranscoding) {
            if (isAlreadyProxied) {
                // Ensure transcode=true is appended
                if (!streamUrl.includes("transcode=")) {
                    streamUrl += `&transcode=true`;
                }
                // Ensure audioIndex is appended
                if (currentAudioTrack !== null && currentAudioTrack !== undefined && !streamUrl.includes("audioIndex=")) {
                    streamUrl += `&audioIndex=${currentAudioTrack}`;
                }
            } else {
                const baseUrl = getApiUrl();
                let proxyUrl = `${baseUrl}/stream?url=${encodeURIComponent(streamUrl)}&transcode=true&referer=${encodeURIComponent(streamUrl)}`;
                if (currentAudioTrack !== null && currentAudioTrack !== undefined) {
                    proxyUrl += `&audioIndex=${currentAudioTrack}`;
                }
                streamUrl = proxyUrl;
            }
        }

        // Title display cleanup
        const parsedMeta = parseMediaInfo(currentMeta?.title || "Video Player");
        const cleanTitle = parsedMeta.title;
        const displayTitle = episodeTitle ? `${cleanTitle} - ${episodeTitle}` : cleanTitle;

        document.getElementById("playerTitleDisplay").innerText = 
            `[Source ${currentStreamIndex + 1}/${streams.length}] ` + displayTitle;

        const isM3u8 = streamUrl.toLowerCase().includes(".m3u8") && !isTranscoding;
        const isMp4 = streamUrl.toLowerCase().includes(".mp4") || streamUrl.includes("googleusercontent.com") || isTranscoding;

        // Destroy previous player type instances
        if (player) {
            player.destroy(false);
            player = null;
        }
        document.getElementById('artplayer-app').innerHTML = ''; 

        const nativeVideo = document.getElementById("native-player-app");
        if (nativeVideo) {
            nativeVideo.pause();
            nativeVideo.src = "";
            nativeVideo.removeAttribute("src");
            nativeVideo.load();
            if (nativeVideo.hls) {
                nativeVideo.hls.destroy();
                delete nativeVideo.hls;
            }
        }

        // Update player switcher UI active states
        const btn1 = document.getElementById("player-btn-1");
        const btn2 = document.getElementById("player-btn-2");
        if (btn1 && btn2) {
            if (currentPlayerType === 1) {
                btn1.classList.add("active");
                btn1.style.background = "var(--accent)";
                btn2.classList.remove("active");
                btn2.style.background = "rgba(255, 255, 255, 0.1)";
            } else {
                btn1.classList.remove("active");
                btn1.style.background = "rgba(255, 255, 255, 0.1)";
                btn2.classList.add("active");
                btn2.style.background = "var(--accent)";
            }
        }

        // Set up the timeout for 10 seconds max load
        loadTimeout = setTimeout(() => {
            console.warn(`⏳ Source ${currentStreamIndex + 1} load timed out (10 seconds max).`);
            handlePlaybackError();
        }, 10000);

        if (currentPlayerType === 1) {
            // PLAYER 1: ARTPLAYER
            document.getElementById('artplayer-app').style.display = 'block';
            if (nativeVideo) nativeVideo.style.display = 'none';

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
                title: displayTitle,
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
                lock: true,
                gesture: true,
                theme: '#8b5cf6', 
                moreVideoAttr: {
                    referrerPolicy: 'no-referrer',
                },
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
                                // --- HLS Audio Tracks ---
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
                                }

                                // --- HLS Quality Selector ---
                                const levels = hls.levels;
                                if (levels && levels.length > 0) {
                                    const qualityItems = levels.map((level, index) => {
                                        const label = level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1000)}k`;
                                        return {
                                            html: label,
                                            levelIndex: index,
                                            default: index === hls.currentLevel
                                        };
                                    });
                                    qualityItems.unshift({
                                        html: 'Auto',
                                        levelIndex: -1,
                                        default: hls.currentLevel === -1
                                    });

                                    art.setting.add({
                                        name: 'hls-quality',
                                        html: 'Quality',
                                        icon: '<i data-lucide="sliders" style="width:16px;height:16px"></i>',
                                        selector: qualityItems,
                                        onSelect: function (item) {
                                            hls.currentLevel = item.levelIndex;
                                            return item.html;
                                        }
                                    });
                                }

                                setTimeout(() => {
                                    if (window.lucide) window.lucide.createIcons();
                                }, 100);
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

            // Toggle player header visibility in sync with Artplayer controls
            player.on('control', (state) => {
                const header = document.querySelector('.player-header');
                if (header) {
                    if (state) {
                        header.style.opacity = '1';
                        header.style.pointerEvents = 'auto';
                    } else {
                        header.style.opacity = '0';
                        header.style.pointerEvents = 'none';
                    }
                }
            });

            // Clear 10s load timeout when playback successfully starts or metadata is loaded
            player.on('video:playing', () => {
                console.log("🎬 Playback started, clearing load timeout.");
                clearTimeout(loadTimeout);
            });
            player.on('video:canplay', () => {
                clearTimeout(loadTimeout);
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

            // Automated Source Fallback on error
            player.on('video:error', () => {
                console.error("❌ Artplayer video error.");
                handlePlaybackError();
            });

        } else if (currentPlayerType === 2) {
            // PLAYER 2: NATIVE HTML5 / HLS.JS PLAYER
            document.getElementById('artplayer-app').style.display = 'none';
            if (nativeVideo) {
                nativeVideo.style.display = 'block';
                console.log(`🎬 INITIALIZING NATIVE PLAYER (Source ${currentStreamIndex + 1}):`, streamUrl);

                // Set up event listeners for native video to clear load timeout
                const cleanUpListeners = () => {
                    nativeVideo.removeEventListener('playing', onPlaying);
                    nativeVideo.removeEventListener('canplay', onPlaying);
                    nativeVideo.removeEventListener('error', onError);
                };

                const onPlaying = () => {
                    console.log("🎬 Native playback started, clearing load timeout.");
                    clearTimeout(loadTimeout);
                    cleanUpListeners();
                };

                const onError = (e) => {
                    console.error("❌ Native video element error:", e);
                    cleanUpListeners();
                    handlePlaybackError();
                };

                nativeVideo.addEventListener('playing', onPlaying);
                nativeVideo.addEventListener('canplay', onPlaying);
                nativeVideo.addEventListener('error', onError);

                // Load source
                if (isM3u8) {
                    if (Hls.isSupported()) {
                        const hls = new Hls({
                            maxBufferLength: 120,
                            maxMaxBufferLength: 600,
                            maxBufferSize: 120 * 1000 * 1000,
                        });
                        hls.loadSource(streamUrl);
                        hls.attachMedia(nativeVideo);
                        nativeVideo.hls = hls;

                        hls.on(Hls.Events.MANIFEST_PARSED, function() {
                            if (initialTime > 0) {
                                nativeVideo.currentTime = initialTime;
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
                                        onError(new Error("Fatal HLS.js error"));
                                        break;
                                }
                            }
                        });
                    } else if (nativeVideo.canPlayType('application/vnd.apple.mpegurl')) {
                        nativeVideo.src = streamUrl;
                        if (initialTime > 0) {
                            nativeVideo.addEventListener('loadedmetadata', function onMeta() {
                                nativeVideo.currentTime = initialTime;
                                nativeVideo.removeEventListener('loadedmetadata', onMeta);
                            });
                        }
                    }
                } else {
                    nativeVideo.src = streamUrl;
                    if (initialTime > 0) {
                        nativeVideo.addEventListener('loadedmetadata', function onMeta() {
                            nativeVideo.currentTime = initialTime;
                            nativeVideo.removeEventListener('loadedmetadata', onMeta);
                        });
                    }
                }
            }
        }

        // Initialize icons after setting up the player
        setTimeout(() => lucide.createIcons(), 100);
    }

    function handlePlaybackError() {
        clearTimeout(loadTimeout);
        
        // Pause and reset both players
        if (player) {
            player.destroy(false);
            player = null;
        }
        const nativeVideo = document.getElementById("native-player-app");
        if (nativeVideo) {
            nativeVideo.pause();
            if (nativeVideo.hls) {
                nativeVideo.hls.destroy();
                delete nativeVideo.hls;
            }
        }

        if (currentStreamIndex < streams.length - 1) {
             console.warn(`❌ Stream ${currentStreamIndex + 1} failed or timed out. Trying alternative...`);
             currentStreamIndex++;
             setStatus(`Trying Source ${currentStreamIndex + 1}...`, "#f59e0b");
             startPlayback();
        } else {
             console.error("❌ All streams failed.");
             alert("⚠️ All playback attempts failed.\n\nThis source might be fully geoblocked or have broken links on Render.\n\nPlease try another provider or check if you can play it on Localhost.");
             closePlayer();
        }
    }

    // Expose dynamic switcher globally for this instance
    window.switchPlayerType = function(type) {
        if (type === currentPlayerType) return;
        
        // Save current timestamp
        let currentTime = 0;
        if (currentPlayerType === 1 && player) {
            currentTime = player.currentTime;
        } else if (currentPlayerType === 2) {
            const nativeVideo = document.getElementById("native-player-app");
            if (nativeVideo) currentTime = nativeVideo.currentTime;
        }

        currentPlayerType = type;
        console.log(`🔌 Switching player type to Player ${currentPlayerType} at time ${currentTime}`);
        startPlayback(currentTime);
    };

    startPlayback();
}

function closePlayer() {
    // Clear switchPlayerType global wrapper
    delete window.switchPlayerType;

    if (player) {
        player.pause();
        player.destroy(false);
        player = null;
        document.getElementById('artplayer-app').innerHTML = ''; 
    }

    const nativeVideo = document.getElementById("native-player-app");
    if (nativeVideo) {
        nativeVideo.pause();
        nativeVideo.src = "";
        nativeVideo.removeAttribute("src");
        nativeVideo.load();
        if (nativeVideo.hls) {
            nativeVideo.hls.destroy();
            delete nativeVideo.hls;
        }
    }

    // Make sure player header is reset to fully visible for next launch
    const header = document.querySelector('.player-header');
    if (header) {
        header.style.opacity = '1';
        header.style.pointerEvents = 'auto';
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

// Mobile responsive search expand
window.toggleSearchMobile = function(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }
    search();
};

document.addEventListener('click', (e) => {
    // No-op for mobile search collapse since search bar is full-width and persistent
});

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

async function toggleWishlist() {
    if (!currentMeta || !currentMeta.__link) return;
    
    let wishlist = JSON.parse(localStorage.getItem('orbix_wishlist') || "[]");
    const index = wishlist.findIndex(item => item.link === currentMeta.__link);
    
    if (index > -1) {
        wishlist.splice(index, 1);
        localStorage.setItem('orbix_wishlist', JSON.stringify(wishlist));
        checkWishlistState();
        updateWishlistBadge();
    } else {
        const btn = document.getElementById("wishlistBtn");
        const text = document.getElementById("wishlistText");
        const originalText = text ? text.textContent : "Add to Wishlist";
        if (text) text.textContent = "Caching Poster...";
        if (btn) btn.disabled = true;
        
        let posterUrl = currentMeta.image || "";
        const imgEl = document.getElementById("detailPoster");
        if (imgEl && imgEl.src && !imgEl.src.includes('missing.jpg') && !imgEl.src.includes('placeholder')) {
            posterUrl = imgEl.src;
        }
        
        const base64Image = await fetchImageAsBase64(posterUrl);
        
        wishlist.push({
            title: parseMediaInfo(currentMeta.title).title || currentMeta.title,
            image: base64Image || posterUrl,
            link: currentMeta.__link,
            __provider: currentMeta.__provider,
            type: currentMeta.type || "Media"
        });
        
        localStorage.setItem('orbix_wishlist', JSON.stringify(wishlist));
        if (btn) btn.disabled = false;
        checkWishlistState();
        updateWishlistBadge();
    }
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
    
    // 2.5 Try TVMaze for series as an open fallback without API Key
    if (title) {
        try {
            const parsed = parseMediaInfo(title);
            const resp = await fetch(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(parsed.title)}`);
            const data = await resp.json();
            if (data && data[0] && data[0].show && data[0].show.image && data[0].show.image.original) {
                img.src = data[0].show.image.original;
                return;
            }
        } catch (e) { console.error("TVMaze fallback failed", e); }
    }
    

    // 3. Nice CSS-based placeholder if all fails
    const safeTitle = (title || "Unknown").substring(0, 20).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">
    <rect width="300" height="450" fill="#16161a"/>
    <text x="50%" y="50%" font-family="sans-serif" font-size="24" fill="#8b5cf6" text-anchor="middle" dominant-baseline="middle">
        ${safeTitle}
    </text>
</svg>`;
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.trim());
}

// ============================
// 📢 TOAST NOTIFICATIONS
// ============================
function showNoticeToast() {
    const lastShown = localStorage.getItem('orbix_notice_time');
    const now = Date.now();
    // 30 minutes = 30 * 60 * 1000 = 1800000 ms
    if (lastShown && (now - parseInt(lastShown)) < 1800000) {
        return; 
    }
    
    localStorage.setItem('orbix_notice_time', now.toString());

    const toast = document.createElement('div');
    toast.className = 'notice-toast';
    toast.innerHTML = `
        <div class="toast-content">
            <i data-lucide="info" style="width:20px;height:20px;color:var(--accent);flex-shrink:0;margin-top:2px;"></i>
            <div>
                <strong style="font-size: 0.95rem; display: block; margin-bottom: 4px;">Important Notice</strong>
                <p style="margin: 0; font-size: 0.8rem; color: var(--text-dim); line-height: 1.5;">
                    Browser only streams up to 1080p (2K/4K lack audio support on web). Pixeldrain API links are fully supported on our Android and Desktop apps. <span style="color:var(--accent);">@team_orbixplay</span>
                </p>
            </div>
            <button class="toast-close" style="flex-shrink:0;"><i data-lucide="x" style="width:16px;height:16px;"></i></button>
        </div>
    `;
    
    document.body.appendChild(toast);
    lucide.createIcons();
    
    // Animate in
    setTimeout(() => toast.classList.add('show'), 100);
    
    // Auto remove after 5 seconds
    const hideTimeout = setTimeout(() => hideToast(toast), 5000);
    
    // Close button
    toast.querySelector('.toast-close').onclick = () => {
        clearTimeout(hideTimeout);
        hideToast(toast);
    };
}

function hideToast(toast) {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
}

// ============================
// 📜 INFINITE SCROLL LOGIC
// ============================
async function fetchNextPage() {
    if (isFetchingNextPage || !hasMore) return;
    isFetchingNextPage = true;
    currentPage++;
    
    // Show spinner at the bottom of the grid
    const pageLoader = document.createElement("div");
    pageLoader.id = "page-loader";
    pageLoader.className = "loader";
    pageLoader.style.gridColumn = "1/-1";
    pageLoader.style.padding = "20px";
    pageLoader.innerHTML = `
        <div class="spinner" style="width:24px;height:24px;border-width:2px;margin:0 auto;"></div>
    `;
    contentGrid.appendChild(pageLoader);

    await fetchData(currentSearch || currentFilter, !!currentSearch, true);
}

function showScrollToast(message) {
    const toast = document.createElement('div');
    toast.className = 'notice-toast';
    toast.innerHTML = `
        <div class="toast-content" style="padding: 4px 8px; align-items: center; gap: 8px;">
            <i data-lucide="info" style="width:16px;height:16px;color:var(--accent);flex-shrink:0;"></i>
            <span style="font-size: 0.85rem; color: var(--text-dim);">${message}</span>
        </div>
    `;
    document.body.appendChild(toast);
    lucide.createIcons();
    setTimeout(() => toast.classList.add('show'), 50);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

window.addEventListener('scroll', () => {
    // Only scroll-load if we are on browse page
    if (!pageBrowse.classList.contains('active')) return;
    if (isFetchingNextPage || !hasMore) return;
    if (currentFilter === "wishlist") return;

    if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
        fetchNextPage();
    }
});

function getStreamLabel(group) {
    if (!group || !group.title) return "Unknown Stream";
    const title = group.title;
    const parsed = parseMediaInfo(title);
    
    const quality = parsed.meta.find(m => m.type === 'quality')?.text || "";
    const audio = parsed.meta.filter(m => m.type === 'audio').map(m => m.text).join(', ') || "";
    const size = parsed.meta.find(m => m.type === 'size')?.text || "";
    
    const tags = [];
    if (quality) tags.push(quality);
    if (audio) tags.push(audio);
    if (size) tags.push(size);
    
    const tagString = tags.length > 0 ? ` [${tags.join(" | ")}]` : "";
    return `${parsed.title}${tagString}`;
}

async function fetchImageAsBase64(imageUrl) {
    if (!imageUrl) return "";
    if (imageUrl.startsWith('data:')) return imageUrl;
    
    try {
        let fetchUrl = imageUrl;
        if (imageUrl.startsWith('http')) {
            fetchUrl = `${getApiUrl()}/image-proxy?url=${encodeURIComponent(imageUrl)}`;
        }
        const resp = await fetch(fetchUrl);
        if (!resp.ok) throw new Error("Image fetch failed");
        const blob = await resp.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (err) {
        console.warn("Could not cache image as base64:", err);
        return imageUrl; // Fallback to original URL
    }
}

async function refreshWishlistData() {
    let wishlist = JSON.parse(localStorage.getItem('orbix_wishlist') || "[]");
    if (wishlist.length === 0) {
        alert("Wishlist is empty.");
        return;
    }

    const confirmRefresh = confirm(`Would you like to refresh data for ${wishlist.length} item(s) in your wishlist? This will update poster images and titles.`);
    if (!confirmRefresh) return;

    setStatus("Refreshing wishlist...", "#8b5cf6");
    
    const btn = catalogContainer.querySelector('button');
    if (btn) {
        btn.disabled = true;
        btn.style.opacity = "0.7";
        btn.style.cursor = "not-allowed";
        btn.innerHTML = `<i data-lucide="refresh-cw" class="spin" style="width: 14px; height: 14px; animation: spin 1s linear infinite; display: inline-block;"></i> Refreshing...`;
        if (window.lucide) window.lucide.createIcons();
    }

    let successCount = 0;
    for (let i = 0; i < wishlist.length; i++) {
        const item = wishlist[i];
        setStatus(`Refreshing ${i + 1}/${wishlist.length}: ${item.title}...`, "#8b5cf6");
        
        try {
            const resp = await fetch(`${getApiUrl()}/fetch`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    provider: item.__provider,
                    functionName: "getMeta",
                    params: { link: item.link }
                }),
                signal: AbortSignal.timeout(10000)
            });

            if (resp.ok) {
                const freshMeta = await resp.json();
                if (freshMeta && freshMeta.title) {
                    item.title = parseMediaInfo(freshMeta.title).title || freshMeta.title;
                    item.type = freshMeta.type || item.type;
                    
                    let posterUrl = freshMeta.image || item.image;
                    if (posterUrl) {
                        const base64Img = await fetchImageAsBase64(posterUrl);
                        if (base64Img) item.image = base64Img;
                    }
                    successCount++;
                }
            }
        } catch (err) {
            console.error(`Failed to refresh item ${item.title}:`, err);
        }
    }

    localStorage.setItem('orbix_wishlist', JSON.stringify(wishlist));
    renderGrid(wishlist);
    
    if (btn) {
        btn.disabled = false;
        btn.style.opacity = "1";
        btn.style.cursor = "pointer";
        btn.innerHTML = `<i data-lucide="refresh-cw" style="width: 14px; height: 14px;"></i> Refresh Wishlist Data`;
        if (window.lucide) window.lucide.createIcons();
    }
    
    setStatus(`Wishlist refreshed! (${successCount}/${wishlist.length} updated)`, "#22c55e");
}

// 🚀 START
initTheme();
updateWishlistBadge();
loadProviders();
setTimeout(() => showNoticeToast(), 1500);