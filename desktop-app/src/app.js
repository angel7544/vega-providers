import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import db from './db.js';

// ============================
// ⚙️ CONFIGURATION & STATE
// ============================
// These are populated from the JSON DB during init()
let API_BASE = "http://localhost:3001";
const getApiUrl = () => {
    let url = API_BASE;
    if (url.endsWith('/')) url = url.slice(0, -1);
    return url;
};

let currentProvider = "VegaMovies";
let currentMeta = null;
let player = null;
let currentPlayerType = 1; // 1 = Artplayer, 2 = Native HTML5/HLS.js player
let providersMap = {};
let allProviders = []; // Stores all providers from manifest.json
let tmdbKey = "";

// ============================
// 🎨 THEME & UI MANAGER
// ============================
function initTheme() {
    const savedTheme = db.get('orbix_theme', 'light');
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeUI(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    db.set('orbix_theme', newTheme);
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
    const wishlist = db.get('orbix_wishlist', []);
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
    
    // Populate API URL
    const savedApi = db.get('vega_api_url', 'http://localhost:3001');
    const input = document.getElementById('apiUrlInput');
    if (input) input.value = savedApi;

    settingsModal.style.display = "flex";
    setTimeout(() => settingsModal.classList.add('active'), 10);
}

function closeSettingsModal() {
    settingsModal.classList.remove('active');
    setTimeout(() => settingsModal.style.display = "none", 300);
}

async function saveSettings() {
    // Save disabled providers list
    const checkboxes = document.querySelectorAll("#settingsProvidersList input[type='checkbox']");
    const disabledList = [];
    checkboxes.forEach(chk => {
        if (!chk.checked) {
            disabledList.push(chk.dataset.providerId);
        }
    });
    await db.set('orbix_disabled_providers', disabledList);

    // Save API Base URL
    const apiInput = document.getElementById('apiUrlInput');
    if (apiInput) {
        let val = apiInput.value.trim() || 'http://localhost:3001';
        await db.set('vega_api_url', val);
    }

    closeSettingsModal();
    window.location.reload();
}

function setQuickApi(url) {
    const input = document.getElementById('apiUrlInput');
    if (input) input.value = url;
}
window.setQuickApi = setQuickApi;

function renderSettingsProviders() {
    const container = document.getElementById("settingsProvidersList");
    if (!container) return;
    
    container.innerHTML = "";
    const disabledProviders = db.get('orbix_disabled_providers', []);
    
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
    const wishlist = db.get('orbix_wishlist', []);
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
        const disabledProviders = db.get('orbix_disabled_providers', []);
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
            await db.set('orbix_last_provider', currentProvider);
        }
        providerSelect.value = currentProvider;
        syncCustomDropdown("providerDropdownContainer", "providerSelect");

        providerSelect.onchange = async (e) => {
            currentProvider = e.target.value;
            await db.set('orbix_last_provider', currentProvider);
            window.location.reload();
        };

        if (currentProvider) {
            await loadCatalog();
            const defaultFilter = currentCatalogItems[0] ? currentCatalogItems[0].filter : "";
            fetchData(defaultFilter);
        }

        setStatus("Online");

    } catch (err) {
        console.error("API Connection Error:", err);
        setStatus("Offline. Check API Settings.", "#ef4444");
        
        // Show Server Down Modal
        const modal = document.getElementById("serverDownModal");
        const label = document.getElementById("serverDownUrlLabel");
        if (modal && label) {
            label.textContent = getApiUrl();
            modal.style.display = "flex";
            setTimeout(() => modal.classList.add("active"), 10);
            if (window.lucide) window.lucide.createIcons();
        }
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
    await db.set('orbix_last_provider', currentProvider);
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
    
    checkSynopsisLength();
}

function checkSynopsisLength() {
    const synopsis = document.getElementById("detailSynopsis");
    const btn = document.getElementById("readMoreBtn");
    if (!synopsis || !btn) return;
    
    // Reset state to collapsed
    synopsis.classList.add("collapsed");
    btn.textContent = ".. readmore";
    
    // Check if the scroll height is larger than client height
    setTimeout(() => {
        if (synopsis.scrollHeight > synopsis.clientHeight + 5) {
            btn.style.display = "inline-block";
        } else {
            btn.style.display = "none";
        }
    }, 150);
}

window.toggleReadMore = function() {
    const synopsis = document.getElementById("detailSynopsis");
    const btn = document.getElementById("readMoreBtn");
    if (synopsis && btn) {
        if (synopsis.classList.contains("collapsed")) {
            synopsis.classList.remove("collapsed");
            btn.textContent = "show less";
        } else {
            synopsis.classList.add("collapsed");
            btn.textContent = ".. readmore";
        }
    }
};

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
        return `<span style="font-size: 10px; background: ${color}; color: #fff; padding: 2px 5px; border-radius: 4px; display: inline-block; white-space: nowrap;">${m.text}</span>`;
    }).join("");
    
    return `
        <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 6px; width: 100%; min-width: 0; text-align: left; overflow: hidden;">
            <div style="display: flex; align-items: flex-start; gap: 8px; width: 100%; min-width: 0;">
                <i data-lucide="${defaultIcon}" style="width: 18px; height: 18px; flex-shrink: 0; margin-top: 2px;"></i>
                <span style="font-weight: 500; font-size: 14px; line-height: 1.4; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-word; min-width: 0;">${parsed.title}</span>
            </div>
            ${badges ? `<div style="display: flex; flex-wrap: wrap; gap: 4px; width: 100%; padding-left: 26px;">${badges}</div>` : ''}
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
            
            // 1. Create custom colorful dropdown container (for mobile)
            const dropdown = document.createElement("div");
            dropdown.className = "colorful-dropdown mobile-only-dropdown";
            
            const trigger = document.createElement("button");
            trigger.className = "colorful-dropdown-trigger";
            trigger.type = "button";
            trigger.setAttribute("aria-haspopup", "listbox");
            trigger.setAttribute("aria-expanded", "false");
            
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
            
            const closeDropdown = () => {
                trigger.setAttribute("aria-expanded", "false");
                menu.classList.remove("show");
            };
            
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
            
            // 2. Create cards container (for desktop)
            const cardsContainer = document.createElement("div");
            cardsContainer.className = "season-cards-container desktop-only-cards";
            
            const selectSeason = (index) => {
                const group = seasonGroups[index];
                
                // Update dropdown state
                menu.querySelectorAll(".colorful-dropdown-item").forEach((el, i) => {
                    el.classList.toggle("selected", i === index);
                });
                valueSpan.innerHTML = createStreamBadgeHtml(group.title, "layers");
                centerBadgeLayout(valueSpan);
                
                // Update cards state
                cardsContainer.querySelectorAll(".season-tab").forEach((el, i) => {
                    el.classList.toggle("active", i === index);
                });
                
                if (window.lucide) window.lucide.createIcons();
                
                if (group.directLinks && group.directLinks.length > 0) {
                    renderEpisodeList(group.directLinks, currentProvider);
                } else {
                    loadEpisodes(group.episodesLink || group.link, currentProvider);
                }
            };
            
            // Populate dropdown & card lists
            seasonGroups.forEach((group, index) => {
                // Dropdown item
                const item = document.createElement("div");
                item.className = "colorful-dropdown-item" + (index === 0 ? " selected" : "");
                item.innerHTML = createStreamBadgeHtml(group.title, "layers");
                centerBadgeLayout(item);
                item.onclick = (e) => {
                    e.stopPropagation();
                    closeDropdown();
                    selectSeason(index);
                };
                menu.appendChild(item);
                
                // Card item
                const card = document.createElement("button");
                card.className = "season-tab" + (index === 0 ? " active" : "");
                card.innerHTML = createStreamBadgeHtml(group.title, "layers");
                card.onclick = () => {
                    selectSeason(index);
                };
                cardsContainer.appendChild(card);
            });
            
            dropdown.appendChild(trigger);
            dropdown.appendChild(menu);
            
            seasonSelector.appendChild(dropdown);
            seasonSelector.appendChild(cardsContainer);
            
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
    
    const isMobile = window.innerWidth <= 1024;
    
    if (isMobile) {
        downloadGroups.forEach(group => {
            const row = document.createElement("div");
            row.className = "ep-row";

            const btn1 = document.createElement("button");
            btn1.className = "ep-btn";
            btn1.innerHTML = createStreamBadgeHtml(group.title || "Download Link", "download");
            btn1.onclick = () => {
                resolveDownload(group.link, currentProvider, group.title);
            };

            const dlBtn = document.createElement("button");
            dlBtn.className = "ep-btn-dl";
            dlBtn.innerHTML = `<i data-lucide="download"></i>`;
            dlBtn.title = "Get Download Links";
            dlBtn.onclick = () => {
                resolveDownload(group.link, currentProvider, group.title);
            };

            row.appendChild(btn1);
            row.appendChild(dlBtn);
            container.appendChild(row);
        });
        if (window.lucide) window.lucide.createIcons();
    } else {
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
        if (window.lucide) window.lucide.createIcons();
    }
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
        
        

        const dlBtn = document.createElement("button");
        dlBtn.className = "ep-btn-dl";
        dlBtn.innerHTML = `<i data-lucide="download"></i>`;
        dlBtn.title = "Extract Download Links";
        dlBtn.onclick = () => {
            resolveDownload(ep.link, provider, ep.title);
        };

        row.appendChild(btn1);
        row.appendChild(dlBtn);
        container.appendChild(row);
    });
    
    lucide.createIcons();
}

// Duplicate renderDownloads removed to fix TypeError on downloadSection.

// ============================
// 🎥 EXTRACT STREAM
// ============================
function extractStreamData(data) {
    if (!data) return null;

    if (Array.isArray(data)) return extractStreamData(data[0]);

    let url = null;
    if (data.link) url = data.link;
    else if (data.file) url = data.file;
    else if (data.url) url = data.url;
    else if (data.sources?.length) url = data.sources[0].file;
    else if (data.data) return extractStreamData(data.data);

    if (url) {
        let headers = data.headers || null;
        if (!headers && data.sources?.length && data.sources[0].headers) {
            headers = data.sources[0].headers;
        }
        return { url, headers };
    }
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
    
    const parsedMeta = parseMediaInfo(currentMeta?.title || "Video");
    const displayTitle = episodeTitle ? `${parsedMeta.title} - ${episodeTitle}` : parsedMeta.title;
    
    showSourceSelectionModal(streams, displayTitle, provider, false);
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
    setStatus("Extracting links...", "#8b5cf6");
    const streams = await getResolvedStreams(link, provider);
    
    if (!streams || !streams.length) {
        setStatus("Failed to extract links.", "#ef4444");
        return;
    }
    
    setStatus("Online", "#22c55e");
    showSourceSelectionModal(streams, title || "Extracting Media", provider, true);
}

function showSourceSelectionModal(streams, title, provider, isDownload) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay active";
    overlay.style.display = "flex";
    
    const dialog = document.createElement("div");
    dialog.className = "settings-dialog";
    dialog.style.maxWidth = "500px";
    dialog.style.width = "90%";
    dialog.style.background = "var(--surface-deep)";
    dialog.style.border = "1px solid var(--glass-border)";
    dialog.style.borderRadius = "16px";
    dialog.style.display = "flex";
    dialog.style.flexDirection = "column";
    dialog.style.boxShadow = "0 20px 40px rgba(0,0,0,0.8)";
    dialog.style.position = "relative";
    
    const closeBtn = document.createElement("button");
    closeBtn.className = "close-modal";
    closeBtn.innerHTML = `<i data-lucide="x"></i>`;
    closeBtn.style.position = "absolute";
    closeBtn.style.top = "16px";
    closeBtn.style.right = "16px";
    closeBtn.style.background = "transparent";
    closeBtn.style.border = "none";
    closeBtn.style.color = "var(--text-muted)";
    closeBtn.style.cursor = "pointer";
    closeBtn.onclick = () => {
        overlay.remove();
    };
    
    const header = document.createElement("div");
    header.style.padding = "24px";
    header.style.borderBottom = "1px solid var(--glass-border)";
    header.innerHTML = `
        <h2 style="margin: 0; font-size: 20px; display: flex; align-items: center; gap: 10px; color: var(--text-main);">
            ${isDownload ? "Download Source" : "Play Source"} <i data-lucide="${isDownload ? "download-cloud" : "play-circle"}" style="color: var(--accent);"></i>
        </h2>
        <div style="font-size: 13px; color: var(--text-dim); margin-top: 6px;">Select a quality to ${isDownload ? "download" : "play in MPV"}</div>
    `;
    
    const content = document.createElement("div");
    content.style.padding = "24px";
    
    const meta = document.createElement("div");
    meta.style.display = "flex";
    meta.style.alignItems = "center";
    meta.style.gap = "12px";
    meta.style.background = "var(--surface-light)";
    meta.style.padding = "16px";
    meta.style.borderRadius = "12px";
    meta.style.marginBottom = "24px";
    meta.style.border = "1px solid var(--glass-border)";
    meta.innerHTML = `
        <i data-lucide="film" style="width: 24px; height: 24px; color: var(--text-dim);"></i>
        <div>
            <div style="font-weight: 600; font-size: 15px; margin-bottom: 4px; color: var(--text-main);">${title}</div>
            <div style="font-size: 12px; color: var(--text-muted);">Provider: ${provider}</div>
        </div>
    `;
    content.appendChild(meta);
    
    const list = document.createElement("div");
    list.style.display = "flex";
    list.style.flexDirection = "column";
    list.style.gap = "10px";
    
    streams.forEach((s, i) => {
        const row = document.createElement("div");
        row.style.display = "flex";
        row.style.justifyContent = "space-between";
        row.style.alignItems = "center";
        row.style.padding = "12px";
        row.style.border = "1px solid var(--glass-border)";
        row.style.borderRadius = "12px";
        row.style.background = "var(--surface-light)";
        row.style.cursor = "pointer";
        row.onmouseover = () => row.style.background = "var(--glass-border)";
        row.onmouseout = () => row.style.background = "var(--surface-light)";
        
        const qText = s.quality ? s.quality + "p" : "Unknown Quality";
        const serverText = s.server ? `Server: ${s.server}` : "";

        row.innerHTML = `
            <div style="display: flex; flex-direction: column; gap: 4px;">
                <div style="font-size: 14px; font-weight: 600; color: var(--text-main);">${qText}</div>
                <div style="font-size: 12px; color: var(--text-muted);">${serverText}</div>
            </div>
            <button style="background: var(--accent); color: #fff; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                <i data-lucide="${isDownload ? "download" : "play"}" style="width: 14px; height: 14px;"></i> ${isDownload ? "Download" : "Play"}
            </button>
        `;
        
        row.onclick = () => {
            overlay.remove();
            let streamData = extractStreamData(s);
            if (!streamData || !streamData.url) return;
            
            if (isDownload) {
                // Initialize Native Download
                const savedDir = db.get('orbix_download_dir', '') || null;
                invoke("start_download_dialog", { url: streamData.url, title: title, downloadDir: savedDir, headers: streamData.headers })
                    .catch(e => {
                        console.error("Download failed:", e);
                        alert("Download Error: " + e);
                    });
            } else {
                // Launch VLC
                setStatus("Launching VLC player...", "#8b5cf6");
                invoke("launch_vlc", { url: streamData.url, title: title, headers: streamData.headers })
                    .then(() => setStatus("Online", "#22c55e"))
                    .catch(e => {
                        console.error("VLC launch failed:", e);
                        setStatus("Online");
                        if (String(e).includes("VLC_NOT_FOUND")) {
                            showVlcNotFoundModal();
                        } else {
                            alert("Error launching VLC: " + e);
                        }
                    });
            }
        };
        
        list.appendChild(row);
    });
    
    content.appendChild(list);
    dialog.appendChild(closeBtn);
    dialog.appendChild(header);
    dialog.appendChild(content);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    lucide.createIcons();
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
    const wishlist = db.get('orbix_wishlist', []);
    const isSaved = wishlist.some(item => item.link === currentMeta.__link);
    const btn = document.getElementById("wishlistBtn");
    const text = document.getElementById("wishlistText");
    
    if (isSaved) {
        btn.classList.add("saved");
        btn.style.background = "";
        btn.style.borderColor = "";
        text.textContent = "Remove from Wishlist";
    } else {
        btn.classList.remove("saved");
        btn.style.background = "";
        btn.style.borderColor = "";
        text.textContent = "Add to Wishlist";
    }
}

async function toggleWishlist() {
    if (!currentMeta || !currentMeta.__link) return;
    
    let wishlist = db.get('orbix_wishlist', []);
    const index = wishlist.findIndex(item => item.link === currentMeta.__link);
    
    if (index > -1) {
        wishlist.splice(index, 1);
        await db.set('orbix_wishlist', wishlist);
        checkWishlistState();
        updateWishlistBadge();
    } else {
        const btn = document.getElementById("wishlistBtn");
        const text = document.getElementById("wishlistText");
        if (text) text.textContent = "Caching Poster...";
        if (btn) btn.disabled = true;
        
        // 1. Robust Title Resolution
        const detailTitleEl = document.getElementById("detailTitle");
        const titleText = (detailTitleEl && detailTitleEl.textContent !== "Loading..." && detailTitleEl.textContent !== "Failed to load Details")
            ? detailTitleEl.textContent 
            : "";
        const rawTitle = currentMeta.title || currentMeta.name || titleText || "Media Item";
        const parsedTitle = parseMediaInfo(rawTitle).title || rawTitle || "Media Details";
        
        // 2. Poster & Image Cache Resolution
        let posterUrl = currentMeta.image || "";
        const imgEl = document.getElementById("detailPoster");
        if (imgEl && imgEl.src && !imgEl.src.includes('missing.jpg') && !imgEl.src.includes('placeholder') && !imgEl.src.includes('data:image/svg')) {
            posterUrl = imgEl.src;
        }
        
        const base64Image = await fetchImageAsBase64(posterUrl);
        const providerDisplayName = currentMeta.__provider && providersMap[currentMeta.__provider] 
            ? providersMap[currentMeta.__provider].display_name 
            : currentMeta.__provider;
        
        wishlist.push({
            title: parsedTitle,
            rawTitle: rawTitle,
            image: base64Image || posterUrl || "missing.jpg",
            coverUrl: posterUrl || currentMeta.image || "",
            link: currentMeta.__link,
            __provider: currentMeta.__provider,
            providerName: providerDisplayName || currentMeta.__provider,
            type: currentMeta.type || "Media",
            tmdbId: currentMeta.tmdbId || currentMeta.tmdb || currentMeta.tmdb_id || null,
            imdbId: currentMeta.imdbId || currentMeta.imdb || currentMeta.imdb_id || null,
            synopsis: currentMeta.description || currentMeta.synopsis || document.getElementById("detailSynopsis")?.textContent || "",
            addedAt: Date.now()
        });
        
        await db.set('orbix_wishlist', wishlist);
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
    const lastShown = db.get('orbix_notice_time', 0);
    const now = Date.now();
    // 30 minutes = 30 * 60 * 1000 = 1800000 ms
    if (lastShown && (now - lastShown) < 1800000) {
        return; 
    }
    
    db.set('orbix_notice_time', now);

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
    let wishlist = db.get('orbix_wishlist', []);
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

    await db.set('orbix_wishlist', wishlist);
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

// 🚀 START — async so the JSON DB is ready before anything reads from it
async function init() {
    await db.init();

    // Populate variables from persisted settings
    API_BASE = db.get('vega_api_url', 'http://localhost:3001');
    currentProvider = db.get('orbix_last_provider', '');
    tmdbKey = db.get('tmdb_api_key', '');

    initTheme();
    updateWishlistBadge();
    loadProviders();
    setTimeout(() => showNoticeToast(), 1500);

    // Restore any downloads that were running before the page refreshed
    restoreActiveDownloads();

    // Populate dl directory input on load
    const savedDir = db.get('orbix_download_dir', '');
    if (savedDir) {
        const input = document.getElementById('dlDirInput');
        if (input) input.value = savedDir;
    }
}
window.startOrbixApp = init;
// Expose functions to window to fix inline onclick handlers in Vite module mode
window.loadHome = loadHome;
window.onCategorySelect = onCategorySelect;
window.loadWishlist = loadWishlist;
window.search = search;
window.toggleSearchMobile = toggleSearchMobile;
window.toggleTheme = toggleTheme;
window.openSettingsModal = openSettingsModal;
window.toggleReadMore = toggleReadMore;
window.backToBrowse = backToBrowse;
window.toggleWishlist = toggleWishlist;
// ============================
// 📥 DOWNLOAD MANAGER
// ============================
window.activeDownloads = {}; // id -> { title, downloaded, total, speed, error, status, paused }

/** Restore downloads running in Rust after a JS page refresh */
async function restoreActiveDownloads() {
    try {
        const active = await invoke('get_active_downloads');
        if (!active || !active.length) return;
        active.forEach(dl => {
            if (!window.activeDownloads[dl.id]) {
                window.activeDownloads[dl.id] = {
                    title: dl.title,
                    downloaded: 0,
                    total: 0,
                    speed: 0,
                    status: dl.paused ? 'paused' : 'downloading',
                    paused: dl.paused
                };
            }
        });
        if (Object.keys(window.activeDownloads).length > 0) {
            renderActiveDownloads();
        }
    } catch (e) {
        // Not in Tauri context or no active downloads — silently ignore
        console.warn('[Downloads] Could not restore active downloads:', e);
    }
}

function openDownloadsModal() {
    // pageDownloads is already in the static HTML — just switch to it
    switchPage('pageDownloads');
    renderActiveDownloads();
}

function renderActiveDownloads() {
    const container = document.getElementById('downloadsList');
    if (!container) return;

    container.innerHTML = '';
    const ids = Object.keys(window.activeDownloads);

    if (ids.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding: 60px 24px; color: var(--text-muted);">
                <i data-lucide="download-cloud" style="width:48px;height:48px;margin-bottom:16px;opacity:0.3;"></i>
                <p style="font-size:14px;">No active downloads</p>
            </div>`;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    ids.forEach(id => {
        const dl = window.activeDownloads[id];

        let progressPercent = 0;
        if (dl.total && dl.total > 0) {
            progressPercent = Math.round((dl.downloaded / dl.total) * 100);
        }

        const speedMB    = dl.speed ? (dl.speed / (1024 * 1024)).toFixed(2) : '0.00';
        const downloadedMB = dl.downloaded ? (dl.downloaded / (1024 * 1024)).toFixed(1) : '0';
        const totalMB    = dl.total ? (dl.total / (1024 * 1024)).toFixed(1) : '?';
        const isPaused   = dl.paused || dl.status === 'paused';
        const isError    = dl.status === 'error';
        const isFinished = dl.status === 'finished';

        // Progress bar & accent colour
        const barColor = isError ? '#ef4444' : isPaused ? '#f59e0b' : 'var(--accent)';

        // Status label
        let statusLabel = '';
        if (isFinished)       statusLabel = '✅ Finished';
        else if (isError)     statusLabel = `❌ Error: ${dl.error || 'unknown'}`;
        else if (isPaused)    statusLabel = '⏸ Paused';
        else                  statusLabel = `⬇ ${speedMB} MB/s`;

        const item = document.createElement('div');
        item.dataset.dlId = id;
        item.style.cssText = `
            background: rgba(255,255,255,0.02);
            border: 1px solid ${isPaused ? 'rgba(245,158,11,0.3)' : 'var(--glass-border)'};
            border-radius: 14px; padding: 16px;
            display: flex; flex-direction: column; gap: 12px;
            transition: border-color 0.3s;
        `;

        item.innerHTML = `
            <!-- Title row -->
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
                <div style="font-weight:600; font-size:14px; line-height:1.4; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${dl.title}</div>
                <div style="display:flex; gap:6px; flex-shrink:0;">
                    ${!isFinished && !isError ? `
                    <button class="dl-pause-btn" data-id="${id}" data-paused="${isPaused}"
                        style="background:${isPaused ? 'rgba(245,158,11,0.15)' : 'rgba(139,92,246,0.12)'};
                               color:${isPaused ? '#f59e0b' : 'var(--accent)'};
                               border:1px solid ${isPaused ? 'rgba(245,158,11,0.3)' : 'rgba(139,92,246,0.3)'};
                               padding:5px 10px; border-radius:6px; cursor:pointer;
                               font-size:12px; font-weight:600; display:flex; align-items:center; gap:5px;">
                        <i data-lucide="${isPaused ? 'play' : 'pause'}" style="width:12px;height:12px;"></i>
                        ${isPaused ? 'Resume' : 'Pause'}
                    </button>` : ''}
                    ${!isFinished ? `
                    <button class="dl-cancel-btn" data-id="${id}"
                        style="background:rgba(239,68,68,0.1); color:#ef4444;
                               border:1px solid rgba(239,68,68,0.2);
                               padding:5px 10px; border-radius:6px; cursor:pointer;
                               font-size:12px; font-weight:600; display:flex; align-items:center; gap:5px;">
                        <i data-lucide="x" style="width:12px;height:12px;"></i> Cancel
                    </button>` : ''}
                </div>
            </div>

            <!-- Progress -->
            <div>
                <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted); margin-bottom:6px;">
                    <span>${statusLabel}</span>
                    <span style="font-variant-numeric:tabular-nums;">
                        ${dl.total > 0 ? `${downloadedMB} / ${totalMB} MB` : `${progressPercent}%`}
                    </span>
                </div>
                <div style="height:5px; background:rgba(255,255,255,0.08); border-radius:4px; overflow:hidden;">
                    <div style="height:100%; width:${progressPercent}%;
                                background:${barColor}; border-radius:4px;
                                transition:width 0.4s ease;"></div>
                </div>
            </div>

            <!-- File path -->
            <div style="font-size:10px; color:var(--text-dim); word-break:break-all; opacity:0.6;">${id}</div>
        `;

        container.appendChild(item);
    });

    if (window.lucide) window.lucide.createIcons();

    // ── Attach events ──────────────────────────────────────────────────────
    container.querySelectorAll('.dl-pause-btn').forEach(btn => {
        btn.onclick = async () => {
            const id     = btn.dataset.id;
            const paused = btn.dataset.paused === 'true';
            try {
                if (paused) {
                    await invoke('resume_download', { id });
                } else {
                    await invoke('pause_download', { id });
                }
            } catch (e) { console.error(e); }
        };
    });

    container.querySelectorAll('.dl-cancel-btn').forEach(btn => {
        btn.onclick = () => {
            invoke('cancel_download', { id: btn.dataset.id }).catch(console.error);
        };
    });
}

// ============================
// ⚙️ SETTINGS ACTIONS
// ============================

async function selectDownloadDirectory() {
    try {
        const selectedPath = await open({
            directory: true,
            multiple: false,
            title: "Select Default Download Folder"
        });
        if (selectedPath) {
            await db.set('orbix_download_dir', selectedPath);
            const input = document.getElementById('dlDirInput');
            if (input) input.value = selectedPath;
            setStatus("Download directory saved!", "#22c55e");
        }
    } catch (e) {
        console.error(e);
        alert("Failed to pick directory: " + e);
    }
}

async function clearDownloadDirectory() {
    await db.remove('orbix_download_dir');
    const input = document.getElementById('dlDirInput');
    if (input) input.value = "";
    setStatus("Download directory cleared.", "#f59e0b");
}

function openVlcDownloadPage() {
    invoke("open_vlc_download_page").catch(e => {
        console.error("Failed to open VLC download page:", e);
        // Fallback: try window.open
        window.open("https://www.videolan.org/vlc/download-windows.html", "_blank");
    });
}

function showVlcNotFoundModal() {
    const modal = document.getElementById('vlcNotFoundModal');
    if (!modal) return;
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);
    if (window.lucide) window.lucide.createIcons();
}

window.closeVlcModal = function() {
    const modal = document.getElementById('vlcNotFoundModal');
    if (!modal) return;
    modal.classList.remove('active');
    setTimeout(() => modal.style.display = 'none', 300);
};

window.installVlcAndClose = function() {
    openVlcDownloadPage();
    window.closeVlcModal();
};

// 🎧 TAURI LISTENERS
try {
    listen('download-started', (event) => {
        const { id, title } = event.payload;
        window.activeDownloads[id] = { title, downloaded: 0, total: 0, speed: 0, status: 'downloading', paused: false };
        if (document.getElementById('pageDownloads')?.classList.contains('active')) {
            renderActiveDownloads();
        }
        setStatus('Download started', '#22c55e');
    });

    listen('download-progress', (event) => {
        const { id, downloaded, total, speed } = event.payload;
        if (window.activeDownloads[id]) {
            window.activeDownloads[id].downloaded = downloaded;
            window.activeDownloads[id].total = total;
            window.activeDownloads[id].speed = speed;
            if (document.getElementById('pageDownloads')?.classList.contains('active')) {
                renderActiveDownloads();
            }
        }
    });

    listen('download-paused', (event) => {
        const { id } = event.payload;
        if (window.activeDownloads[id]) {
            window.activeDownloads[id].status = 'paused';
            window.activeDownloads[id].paused = true;
            window.activeDownloads[id].speed = 0;
            if (document.getElementById('pageDownloads')?.classList.contains('active')) {
                renderActiveDownloads();
            }
            setStatus('Download paused', '#f59e0b');
        }
    });

    listen('download-resumed', (event) => {
        const { id } = event.payload;
        if (window.activeDownloads[id]) {
            window.activeDownloads[id].status = 'downloading';
            window.activeDownloads[id].paused = false;
            if (document.getElementById('pageDownloads')?.classList.contains('active')) {
                renderActiveDownloads();
            }
            setStatus('Download resumed', '#22c55e');
        }
    });

    listen('download-finished', (event) => {
        const { id } = event.payload;
        if (window.activeDownloads[id]) {
            window.activeDownloads[id].status = 'finished';
            window.activeDownloads[id].paused = false;
            window.activeDownloads[id].downloaded = window.activeDownloads[id].total;
            if (document.getElementById('pageDownloads')?.classList.contains('active')) {
                renderActiveDownloads();
            }
            setTimeout(() => {
                delete window.activeDownloads[id];
                if (document.getElementById('pageDownloads')?.classList.contains('active')) {
                    renderActiveDownloads();
                }
            }, 5000);
            setStatus('Download finished!', '#22c55e');
        }
    });

    listen('download-error', (event) => {
        const { id, error } = event.payload;
        if (window.activeDownloads[id]) {
            window.activeDownloads[id].status = 'error';
            window.activeDownloads[id].error = error;
            window.activeDownloads[id].speed = 0;
            if (document.getElementById('pageDownloads')?.classList.contains('active')) {
                renderActiveDownloads();
            }
            setStatus('Download error', '#ef4444');
        }
    });

    listen('download-cancelled', (event) => {
        const { id } = event.payload;
        delete window.activeDownloads[id];
        if (document.getElementById('pageDownloads')?.classList.contains('active')) {
            renderActiveDownloads();
        }
        setStatus('Download cancelled', '#ef4444');
    });
} catch(e) {
    console.warn('Tauri event listeners not initialized', e);
}


window.openDownloadsModal = openDownloadsModal;
window.refreshDetails = refreshDetails;
window.switchDetailTab = switchDetailTab;
window.closeDownloadModal = closeDownloadModal;
window.closeSettingsModal = closeSettingsModal;
window.saveSettings = saveSettings;
window.playStream = playStream;
window.switchToProvider = switchToProvider;
window.refreshWishlistData = refreshWishlistData;
window.selectDownloadDirectory = selectDownloadDirectory;
window.clearDownloadDirectory = clearDownloadDirectory;
window.openVlcDownloadPage = openVlcDownloadPage;



