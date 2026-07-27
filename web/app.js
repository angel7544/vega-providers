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
function switchPage(pageId) {
    document.querySelectorAll('.page-view').forEach(el => {
        el.classList.remove('active');
        el.style.display = 'none';
    });
    const target = document.getElementById(pageId);
    if (target) {
        target.classList.add('active');
        target.style.display = 'block';
    }
}

function handleImageError(imgEl, title) {
    if (!imgEl) return;
    imgEl.onerror = null;
    const safeTitle = (title || "OrbixPlay").trim();
    const cleanTitle = safeTitle.length > 18 ? safeTitle.slice(0, 18) + "..." : safeTitle;
    const encodedTitle = encodeURIComponent(cleanTitle);
    imgEl.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><rect width="100%" height="100%" fill="%231e1b4b"/><rect width="100%" height="100%" fill="url(%23g)" opacity="0.3"/><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%239333ea"/><stop offset="100%" stop-color="%234338ca"/></linearGradient></defs><text x="50%" y="45%" font-family="sans-serif" font-size="20" font-weight="bold" fill="%23ffffff" text-anchor="middle">${encodedTitle}</text><text x="50%" y="55%" font-family="sans-serif" font-size="12" fill="%23a78bfa" text-anchor="middle">OrbixPlay Media</text></svg>`;
}

function initTheme() {
    const savedTheme = localStorage.getItem('orbix_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeUI(savedTheme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
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

// ============================
// ℹ️ INFO & LEGAL MODAL HANDLERS
// ============================
function openInfoModal(tab = 'about', subOption = '') {
    switchInfoTab(tab, subOption);
    const infoModal = document.getElementById('infoModal');
    if (infoModal) {
        infoModal.style.display = "flex";
        setTimeout(() => infoModal.classList.add('active'), 10);
    }
}

function closeInfoModal() {
    const infoModal = document.getElementById('infoModal');
    if (infoModal) {
        infoModal.classList.remove('active');
        setTimeout(() => infoModal.style.display = "none", 300);
    }
}

function switchInfoTab(tabName, subOption = '') {
    const tabs = document.querySelectorAll('.info-tab-btn');
    const contents = document.querySelectorAll('.info-tab-content');
    tabs.forEach(t => t.classList.remove('active'));
    contents.forEach(c => c.classList.remove('active'));

    const targetTab = document.getElementById(`infoTabBtn-${tabName}`);
    const targetContent = document.getElementById(`infoTab-${tabName}`);

    if (targetTab) targetTab.classList.add('active');
    if (targetContent) targetContent.classList.add('active');

    if (tabName === 'contact' && subOption) {
        const contactSubject = document.getElementById('contactSubject');
        if (contactSubject) contactSubject.value = subOption;
    }

    if (window.lucide) window.lucide.createIcons();
}

function handleContactSubmit(e) {
    e.preventDefault();
    const toast = document.getElementById('contactToast');
    if (toast) {
        toast.style.display = 'block';
        setTimeout(() => {
            toast.style.display = 'none';
            document.getElementById('contactForm')?.reset();
        }, 4000);
    }
}

// Modal Backdrop Click Handlers & Escape Key Handler
document.addEventListener('click', (e) => {
    const infoModal = document.getElementById('infoModal');
    if (infoModal && e.target === infoModal) {
        closeInfoModal();
    }
    const settingsModal = document.getElementById('settingsModal');
    if (settingsModal && e.target === settingsModal) {
        closeSettingsModal();
    }
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeInfoModal();
        closeSettingsModal();
        if (typeof closeDownloadModal === 'function') closeDownloadModal();
    }
});

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
    
    const wishlist = JSON.parse(localStorage.getItem('orbix_wishlist') || "[]");
    const countText = wishlist.length ? `${wishlist.length} item${wishlist.length === 1 ? '' : 's'}` : 'Empty';

    catalogContainer.innerHTML = `
        <button class="catalog-btn active" onclick="refreshWishlistData()" style="display: flex; align-items: center; gap: 8px;">
            <i data-lucide="refresh-cw" style="width: 14px; height: 14px;"></i> Refresh Wishlist (${countText})
        </button>
    `;
    if (window.lucide) lucide.createIcons();
    
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

        if (providerSelect) providerSelect.innerHTML = "";
        providersMap = {};

        // Track and map all providers
        providers.forEach(p => {
            providersMap[p.value] = p;
        });

        // Filter out disabled providers from user selection dropdown
        const disabledProviders = JSON.parse(localStorage.getItem('orbix_disabled_providers') || '[]');
        const enabledProviders = providers.filter(p => !disabledProviders.includes(p.value));

        if (providerSelect) {
            enabledProviders.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.value;
                opt.textContent = p.display_name;
                providerSelect.appendChild(opt);
            });
        }

        const isCurrentProviderDisabled = disabledProviders.includes(currentProvider);
        if (!currentProvider || currentProvider === "__all__" || !providersMap[currentProvider] || isCurrentProviderDisabled) {
            currentProvider = enabledProviders[0]?.value || "";
            localStorage.setItem('orbix_last_provider', currentProvider);
        }
        
        if (providerSelect) {
            providerSelect.value = currentProvider;
            syncCustomDropdown("providerDropdownContainer", "providerSelect");

            providerSelect.onchange = async (e) => {
                currentProvider = e.target.value;
                localStorage.setItem('orbix_last_provider', currentProvider);
                window.location.reload();
            };
        }

        // On mobile.html: just load providers map and stop — no grid/catalog needed
        const isMobilePage = document.body.classList.contains('mobile-body');
        if (isMobilePage) {
            setStatus("Online");
            return;
        }

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

        if (contentGrid) contentGrid.innerHTML = `
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
        const poster = isValidImage(item.image) ? item.image : (isValidImage(item.coverUrl) ? item.coverUrl : null);
        const itemTitle = item.title || item.rawTitle || item.name || null;
        showDetails(item.link, provider, poster, tmdbId, item.type, imdbId, itemTitle);
    };

    const validImg = isValidImage(item.image) ? item.image : (isValidImage(item.coverUrl) ? item.coverUrl : null);
    const proxiedImage = validImg || "missing.jpg";

    const providerDisplayName = item.providerName || (item.__provider && providersMap[item.__provider] 
        ? providersMap[item.__provider].display_name 
        : item.__provider);

    const isWishlistMode = currentFilter === "wishlist";
    const itemTitle = item.title || item.rawTitle || "Untitled";
    const safeTitleArg = itemTitle.replace(/'/g, "\\'").replace(/"/g, "&quot;");
    const safeLinkArg = (item.link || "").replace(/'/g, "\\'");

    card.innerHTML = `
        <div class="media-poster-container" style="position: relative;">
            <img class="media-poster" src="${proxiedImage}" loading="lazy" referrerpolicy="no-referrer"
            onerror="handleImageError(this, '${safeTitleArg}')">
            ${isWishlistMode ? `
                <button class="wishlist-remove-btn" onclick="removeFromWishlist('${safeLinkArg}', event)" title="Remove from Wishlist">
                    <i data-lucide="trash-2" style="width:15px;height:15px;"></i>
                </button>
            ` : ''}
            <div class="media-overlay">
                <div class="media-title">${itemTitle}</div>
                <div class="media-meta">
                    <span>${item.type || 'Media'}</span>
                    ${providerDisplayName ? `<span style="color:var(--accent); font-weight:700;">${providerDisplayName}</span>` : ""}
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
        if (contentGrid) contentGrid.innerHTML = "";
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

// Helper to validate whether a resolved title is meaningful (rejects placeholder strings)
function isValidTitle(title) {
    if (!title || typeof title !== 'string') return false;
    const clean = title.trim().toLowerCase();
    if (!clean || clean.length < 2) return false;
    if (['media details', 'media detail', 'unknown', 'unknown title', 'details', 'loading...', 'failed to load details', 'null', 'undefined', 'media', 'untitled'].includes(clean)) {
        return false;
    }
    return true;
}

// Helper to extract clean media title from URL path slug if provider fails to output title
function extractTitleFromUrl(url) {
    if (!url || typeof url !== 'string') return "";
    try {
        let cleanUrl = url.split('?')[0].split('#')[0];
        if (cleanUrl.endsWith('/')) cleanUrl = cleanUrl.slice(0, -1);
        const segments = cleanUrl.split('/').filter(Boolean);
        if (segments.length === 0) return "";
        
        let lastSegment = segments[segments.length - 1];
        if (/^\d+$/.test(lastSegment) && segments.length > 1) {
            lastSegment = segments[segments.length - 2];
        }

        lastSegment = decodeURIComponent(lastSegment).replace(/\.(html|htm|php|aspx|phtml)$/i, "");
        let rawTitle = lastSegment.replace(/[-_+]/g, " ").trim();
        
        if (!rawTitle || rawTitle.length < 2 || /^(watch|download|movie|series|post|item|view|details|index|home)$/i.test(rawTitle)) {
            return "";
        }
        return rawTitle;
    } catch (e) {
        return "";
    }
}

// ============================
// 📽️ DETAILS
// ============================
function handleImageError(imgEl, title = "") {
    if (!imgEl) return;
    imgEl.onerror = null;
    const displayTitle = (title || currentMeta?.title || "OrbixPlay").trim();
    const encodedTitle = encodeURIComponent(displayTitle.length > 25 ? displayTitle.substring(0, 25) + "..." : displayTitle);
    imgEl.src = `https://placehold.co/400x600/1a1a24/a78bfa.svg?text=${encodedTitle}`;
}

function refreshDetails() {
    if (currentMeta && currentMeta.__link) {
        showDetails(currentMeta.__link, currentMeta.__provider, currentMeta.image || currentMeta.poster, currentMeta.tmdbId, currentMeta.type, currentMeta.imdbId, currentMeta.title);
    } else {
        const urlParams = new URLSearchParams(window.location.search);
        const link = urlParams.get('link');
        const provider = urlParams.get('provider');
        if (link && provider) {
            showDetails(link, provider);
        }
    }
}

function scrollToStreams() {
    const el = document.getElementById("linksContainer");
    if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
    }
}

function shareDetails() {
    const title = currentMeta?.title || document.getElementById("detailTitle")?.textContent || "OrbixPlay";
    const url = window.location.href;
    if (navigator.share) {
        navigator.share({
            title: title,
            text: `Check out ${title} on OrbixPlay!`,
            url: url
        }).catch(() => {});
    } else {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(url).then(() => {
                alert("Link copied to clipboard!");
            }).catch(() => {
                alert("Share URL: " + url);
            });
        } else {
            alert("Share URL: " + url);
        }
    }
}

async function showDetails(link, provider, fallbackPoster = null, explicitTmdbId = null, explicitType = null, explicitImdbId = null, explicitTitle = null) {
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth <= 768;
    const isMobilePage = document.body.classList.contains('mobile-body');

    // Automatically navigate to dedicated mobile.html UI when on mobile devices
    if (isMobileDevice && !isMobilePage && !window.location.pathname.includes('mobile.html')) {
        const titleParam = explicitTitle ? `&title=${encodeURIComponent(explicitTitle)}` : '';
        window.location.href = `mobile.html?link=${encodeURIComponent(link)}&provider=${encodeURIComponent(provider || 'vegamovies')}${titleParam}`;
        return;
    }

    window.scrollTo(0, 0); // scroll to top when opening details
    
    currentProvider = provider;
    if (!isMobilePage) switchPage('pageDetails');
    
    // Check local Wishlist Data Store for cached metadata
    const wishlist = JSON.parse(localStorage.getItem('orbix_wishlist') || "[]");
    const cachedItem = wishlist.find(item => (item.link === link || item.url === link || item.id === link));

    const titleEl = document.getElementById("detailTitle");
    const synopsisEl = document.getElementById("detailSynopsis");
    const posterEl = document.getElementById("detailPoster");
    const backdropEl = document.getElementById("detailBackdrop") || document.getElementById("backdropImg");

    // 1. Initial UI state
    const urlSlugTitle = extractTitleFromUrl(link);
    const candidateInitial = [
        explicitTitle,
        cachedItem?.title,
        cachedItem?.rawTitle,
        urlSlugTitle
    ];
    const initialTitle = candidateInitial.find(t => isValidTitle(t)) || "";
    
    if (titleEl) {
        if (isValidTitle(initialTitle)) {
            titleEl.textContent = parseMediaInfo(initialTitle).title || initialTitle;
        } else {
            titleEl.textContent = "Loading...";
        }
    }

    if (synopsisEl) {
        synopsisEl.textContent = (cachedItem && cachedItem.synopsis) ? cachedItem.synopsis : "";
    }

    const initialPoster = isValidImage(fallbackPoster) ? fallbackPoster : (cachedItem && isValidImage(cachedItem.image) ? cachedItem.image : (cachedItem && isValidImage(cachedItem.coverUrl) ? cachedItem.coverUrl : null));
    if (posterEl) {
        posterEl.onerror = () => handleImageError(posterEl, initialTitle);
        if (isValidImage(initialPoster)) {
            posterEl.src = initialPoster;
        } else {
            handleImageError(posterEl, initialTitle);
        }
    }
    if (backdropEl && isValidImage(initialPoster)) backdropEl.style.backgroundImage = `url(${initialPoster})`;

    if (cachedItem) {
        currentMeta = {
            title: cachedItem.rawTitle || cachedItem.title,
            image: cachedItem.coverUrl || cachedItem.image,
            type: cachedItem.type,
            __link: link,
            __provider: provider
        };
        checkWishlistState();
    }

    const wishlistBtn = document.getElementById("wishlistBtn");
    if (wishlistBtn) wishlistBtn.style.display = "inline-flex";

    const linksContainer = document.getElementById("linksContainer");
    if (linksContainer) linksContainer.innerHTML = `<div class="loader"><div class="spinner"></div></div>`;

    try {
        const resp = await fetch(`${getApiUrl()}/fetch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                provider,
                functionName: "getMeta",
                params: { link, url: link, id: link }
            })
        });

        const freshMeta = await resp.json();
        currentMeta = { ...freshMeta, __link: link, __provider: provider };

        // 🎬 Title Extraction
        const candidateMetaTitles = [
            freshMeta.title,
            freshMeta.name,
            freshMeta.postTitle,
            freshMeta.caption,
            freshMeta.heading,
            freshMeta.details && freshMeta.details.title,
            freshMeta.movieName,
            freshMeta.showName,
            freshMeta.linkList && freshMeta.linkList[0] && freshMeta.linkList[0].title,
            initialTitle,
            cachedItem && cachedItem.title,
            cachedItem && cachedItem.rawTitle,
            extractTitleFromUrl(link)
        ];

        const metaTitle = candidateMetaTitles.find(t => isValidTitle(t)) || "Media Details";
        const parsed = parseMediaInfo(metaTitle);
        if (titleEl) titleEl.textContent = parsed.title;
        currentMeta.title = parsed.title;

        // Populate Specs Bar & Series Info
        const specLang = parsed.meta.find(m => m.type === 'audio')?.text || freshMeta.language || "English";
        const specQual = parsed.meta.find(m => m.type === 'quality')?.text || freshMeta.quality || "WEB-DL 720p";
        const specSize = parsed.meta.find(m => m.type === 'size')?.text || freshMeta.size || "400MB";

        const setSafeText = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        setSafeText("specLanguage", specLang);
        setSafeText("specSubtitles", freshMeta.subtitles || "English");
        setSafeText("specQuality", specQual);
        setSafeText("specSize", specSize);
        setSafeText("specCodec", freshMeta.codec || "x264 E");

        setSafeText("infoMetaTitle", parsed.title);
        setSafeText("infoMetaLanguage", specLang);
        setSafeText("infoMetaGenre", freshMeta.genre || freshMeta.genres || "Sci-Fi, Mystery, Drama");

        // 🎬 Synopsis Extraction
        let metaSynopsis = freshMeta.description || freshMeta.synopsis || freshMeta.summary || freshMeta.overview || freshMeta.story || freshMeta.plot || freshMeta.desc || (cachedItem ? cachedItem.synopsis : "");
        if (synopsisEl) {
            synopsisEl.textContent = metaSynopsis || "No synopsis available.";
        }
        
        // 🎬 Poster Extraction
        let posterImg = freshMeta.image || freshMeta.poster || freshMeta.cover || freshMeta.thumbnail || freshMeta.img || freshMeta.src || initialPoster;
        if (posterEl) {
            if (isValidImage(posterImg)) {
                posterEl.src = posterImg;
            } else {
                handleImageError(posterEl, parsed.title);
            }
            posterEl.onerror = () => handleImageError(posterEl, parsed.title);
        }

        if (backdropEl && isValidImage(posterImg)) {
            const isMobileB = document.body.classList.contains('mobile-body');
            if (isMobileB && backdropEl.tagName === 'IMG') {
                backdropEl.src = posterImg;
            } else {
                backdropEl.style.backgroundImage = `url(${posterImg})`;
            }
        }
        
        checkWishlistState();
        if (wishlistBtn) wishlistBtn.style.display = "inline-flex";

        renderLinks(currentMeta);
        renderDownloads(currentMeta);

        // 🌟 Enrich metadata via TMDB/TVMaze
        const metaTmdbId = currentMeta.tmdbId || currentMeta.tmdb || currentMeta.tmdb_id || explicitTmdbId || (cachedItem ? cachedItem.tmdbId : null);
        const metaType = currentMeta.type || explicitType || (cachedItem ? cachedItem.type : null);
        const metaImdbId = currentMeta.imdbId || currentMeta.imdb || currentMeta.imdb_id || explicitImdbId || (cachedItem ? cachedItem.imdbId : null);
        enrichMetadata(parsed.title, metaTmdbId, metaType, metaImdbId);

    } catch (err) {
        console.error("Details fetch error, fallback to direct stream:", err);
        const fallbackTitle = initialTitle || extractTitleFromUrl(link) || "Media Details";
        const parsed = parseMediaInfo(fallbackTitle);
        if (titleEl) titleEl.textContent = parsed.title;
        
        const setSafeText = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        setSafeText("infoMetaTitle", parsed.title);
        setSafeText("infoMetaLanguage", parsed.meta.find(m => m.type === 'audio')?.text || "Dual");
        setSafeText("infoMetaGenre", "Sci-Fi, Mystery, Drama");

        const fallbackStream = [{
            title: parsed.title || "Play Stream Link",
            link: link
        }];
        renderEpisodeList(fallbackStream, provider, link);
        enrichMetadata(parsed.title, explicitTmdbId, explicitType, explicitImdbId);
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
                    const ratingVal = document.getElementById("detailRatingVal");
                    if (ratingVal) ratingVal.textContent = item.vote_average.toFixed(1);
                    if (ratingEl) ratingEl.style.display = "inline-flex";
                }
                
                const year = item.release_date ? item.release_date.split('-')[0] : (item.first_air_date ? item.first_air_date.split('-')[0] : "");
                if (year) {
                    const yearEl = document.getElementById("detailYear");
                    if (yearEl) {
                        yearEl.textContent = year;
                        yearEl.style.display = "inline-block";
                    }
                }

                if (item.number_of_seasons) {
                    const seasonPill = document.getElementById("detailSeasonsCount");
                    if (seasonPill) {
                        seasonPill.textContent = `${item.number_of_seasons} Season${item.number_of_seasons > 1 ? 's' : ''}`;
                        seasonPill.style.display = "inline-block";
                    }
                }

                const genresContainer = document.getElementById("detailGenres");
                if (genresContainer && item.genre_ids) {
                    genresContainer.innerHTML = "";
                    const genreNames = item.genres ? item.genres.map(g => g.name) : ["Sci-Fi", "Mystery", "Drama"];
                    genreNames.slice(0, 3).forEach(g => {
                        const pill = document.createElement("span");
                        pill.className = "genre-pill";
                        pill.textContent = g;
                        genresContainer.appendChild(pill);
                    });
                    const imgG = document.getElementById("infoMetaGenre");
                    if (imgG) imgG.textContent = genreNames.join(", ");
                }

                if (item.origin_country && item.origin_country[0]) {
                    const imgC = document.getElementById("infoMetaCountry");
                    if (imgC) imgC.textContent = item.origin_country[0] === 'US' ? 'United States' : item.origin_country[0];
                }

                if (item.backdrop_path) {
                    const backdropEl = document.getElementById("detailBackdrop") || document.getElementById("backdropImg");
                    if (backdropEl) {
                        const isMobileImg = (backdropEl.tagName === 'IMG');
                        if (isMobileImg) {
                            backdropEl.src = `https://image.tmdb.org/t/p/w1280${item.backdrop_path}`;
                        } else if (!backdropEl.style.backgroundImage || backdropEl.style.backgroundImage === 'none') {
                            backdropEl.style.backgroundImage = `url(https://image.tmdb.org/t/p/w1280${item.backdrop_path})`;
                        }
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
                    const ratingVal = document.getElementById("detailRatingVal");
                    if (ratingVal) ratingVal.textContent = show.rating.average;
                    if (ratingEl) ratingEl.style.display = "inline-flex";
                }
                
                const year = show.premiered ? show.premiered.split('-')[0] : "";
                if (year) {
                    const yearEl = document.getElementById("detailYear");
                    if (yearEl) {
                        yearEl.textContent = year;
                        yearEl.style.display = "inline-block";
                    }
                }

                if (show.genres && show.genres.length > 0) {
                    const genresContainer = document.getElementById("detailGenres");
                    if (genresContainer) {
                        genresContainer.innerHTML = "";
                        show.genres.slice(0, 3).forEach(g => {
                            const pill = document.createElement("span");
                            pill.className = "genre-pill";
                            pill.textContent = g;
                            genresContainer.appendChild(pill);
                        });
                    }
                    const imgG = document.getElementById("infoMetaGenre");
                    if (imgG) imgG.textContent = show.genres.join(", ");
                }

                if (show.network?.country?.name) {
                    const imgC = document.getElementById("infoMetaCountry");
                    if (imgC) imgC.textContent = show.network.country.name;
                }
                if (show.network?.name) {
                    const platformTag = document.getElementById("detailPlatform");
                    const platformText = document.getElementById("detailPlatformText");
                    if (platformTag && platformText) {
                        platformText.textContent = `${show.network.name} Original`;
                        platformTag.style.display = "inline-flex";
                    }
                }
            }
        } catch (e) { console.error("TVMaze enrich failed", e); }
    }
    
    if (window.lucide) window.lucide.createIcons();
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

function toggleSeasonDropdown(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById("seasonDropdownMenu");
    if (menu) {
        menu.classList.toggle("show");
    }
}

document.addEventListener('click', (e) => {
    const wrapper = document.getElementById("seasonDropdownWrapper");
    const menu = document.getElementById("seasonDropdownMenu");
    if (menu && wrapper && !wrapper.contains(e.target)) {
        menu.classList.remove("show");
    }
});

function renderLinks(meta) {
    const container = document.getElementById("linksContainer");
    const seasonCardBox = document.getElementById("seasonCardBox");
    const currentSeasonTitle = document.getElementById("currentSeasonTitle");
    const dropdownMenu = document.getElementById("seasonDropdownMenu");
    const dropdownLabel = document.getElementById("seasonDropdownLabel");
    const seasonSelectorMobile = document.getElementById("seasonSelectorMobile");
    
    container.innerHTML = "";
    if (dropdownMenu) dropdownMenu.innerHTML = "";
    if (seasonSelectorMobile) seasonSelectorMobile.innerHTML = "";
    
    if (!meta || !meta.linkList || !meta.linkList.length) {
         if (seasonCardBox) seasonCardBox.style.display = "none";
         if (currentSeasonTitle) currentSeasonTitle.textContent = meta.title || "Streams";
         container.innerHTML = "<p style='color: var(--text-dim); padding: 20px 0;'>No playable streams found for this content.</p>";
         return;
    }

    let seasonGroups = meta.linkList.filter(l => {
        if (!l) return false;
        const t = l.title || "";
        return l.episodesLink || /(Season|Episodes|S\d+|^S\d|Series|Ep\s*\d+|Episode)/i.test(t) || (l.directLinks && l.directLinks.length > 0);
    });
    
    let movieGroups = meta.linkList.filter(l => {
        if (!l) return false;
        const t = l.title || "";
        return !l.episodesLink && 
        !/(Season|Episodes|S\d+|^S\d|Series|Ep\s*\d+|Episode)/i.test(t) && 
        (!l.directLinks || l.directLinks.length === 0);
    });

    if (seasonGroups.length > 0) {
        if (seasonCardBox) seasonCardBox.style.display = "block";
        
        const selectSeason = (index) => {
            const group = seasonGroups[index];
            if (!group) return;
            
            window.currentSeasonRawTitle = group.title || "";
            const cleanTitleText = parseMediaInfo(group.title || `Season ${index + 1}`).title;
            if (dropdownLabel) {
                dropdownLabel.textContent = cleanTitleText;
            }

            // Update Specs Bar dynamically for the selected season/group
            const parsedGroup = parseMediaInfo(group.title || "");
            const specLang = parsedGroup.meta.find(m => m.type === 'audio')?.text || "Dual";
            const specQual = parsedGroup.meta.find(m => m.type === 'quality')?.text || "720p";
            const specSize = parsedGroup.meta.find(m => m.type === 'size')?.text || "300MB";
            
            let codec = "x264";
            const rawTitleLower = (group.title || "").toLowerCase();
            if (rawTitleLower.includes("x265") || rawTitleLower.includes("hevc")) {
                codec = "HEVC x265";
            } else if (rawTitleLower.includes("x264")) {
                codec = "x264";
            }
            if (rawTitleLower.includes("10bit")) {
                codec += " 10Bit";
            }

            const setSafeText = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.textContent = val;
            };

            setSafeText("specLanguage", specLang);
            setSafeText("specQuality", specQual);
            setSafeText("specSize", specSize);
            setSafeText("specCodec", codec);

            // Mobile season selector display updates
            const mobLabel = document.getElementById("seasonSelectLabel");
            if (mobLabel) {
                mobLabel.textContent = cleanTitleText;
            }
            const mobMenu = document.getElementById("mobileSeasonDropMenu");
            if (mobMenu) {
                mobMenu.style.display = "none";
            }
            const mobChevron = document.getElementById("seasonChevron");
            if (mobChevron) {
                mobChevron.style.transform = "rotate(0deg)";
            }

            if (dropdownMenu) {
                dropdownMenu.querySelectorAll(".season-dropdown-item").forEach((el, i) => {
                    el.classList.toggle("selected", i === index);
                });
                dropdownMenu.classList.remove("show");
            }

            if (seasonSelectorMobile) {
                seasonSelectorMobile.querySelectorAll(".mobile-season-card").forEach((el, i) => {
                    el.classList.toggle("active", i === index);
                });
            }
            
            if (currentSeasonTitle) {
                currentSeasonTitle.textContent = cleanTitleText;
            }
            
            const groupTargetUrl = group.episodesLink || group.link || group.url;

            if (group.directLinks && group.directLinks.length > 0) {
                renderEpisodeList(group.directLinks, currentProvider, groupTargetUrl);
            } else if (groupTargetUrl) {
                loadEpisodes(groupTargetUrl, currentProvider);
            } else {
                renderEpisodeList([group], currentProvider, "");
            }
        };

        if (dropdownMenu) {
            dropdownMenu.innerHTML = "";
            seasonGroups.forEach((group, index) => {
                const item = document.createElement("div");
                item.className = "season-dropdown-item" + (index === 0 ? " selected" : "");
                const epCountStr = group.directLinks ? `${group.directLinks.length} Episodes` : "Available";
                item.innerHTML = `
                    <span>${group.title || `Season ${index + 1}`}</span>
                    <span style="font-size: 11px; opacity: 0.7;">${epCountStr}</span>
                `;
                item.onclick = (e) => {
                    e.stopPropagation();
                    selectSeason(index);
                };
                dropdownMenu.appendChild(item);
            });
        }

        if (seasonSelectorMobile) {
            seasonSelectorMobile.innerHTML = "";
            seasonGroups.forEach((group, index) => {
                const card = document.createElement("div");
                card.className = "mobile-season-card" + (index === 0 ? " active" : "");
                const epCountStr = group.directLinks ? `${group.directLinks.length} Episodes` : "Available";
                card.innerHTML = `
                    <span>${group.title || `Season ${index + 1}`}</span>
                    <div class="season-badge-group">
                        <span class="season-ep-badge">${epCountStr}</span>
                        <i data-lucide="chevron-right" style="width:16px;height:16px;"></i>
                    </div>
                `;
                card.onclick = () => selectSeason(index);
                seasonSelectorMobile.appendChild(card);
            });
            if (window.lucide) window.lucide.createIcons();
        }

        window.currentSeasonRawTitle = seasonGroups[0].title || "Season 1";
        const initialCleanText = parseMediaInfo(seasonGroups[0].title || "Season 1").title;
        if (dropdownLabel) {
            dropdownLabel.textContent = initialCleanText;
        }
        if (currentSeasonTitle) {
            currentSeasonTitle.textContent = initialCleanText;
        }

        // Render first season automatically
        selectSeason(0);
    } else {
        if (seasonCardBox) seasonCardBox.style.display = "none";
        
        const firstMovieGroup = meta.linkList[0];
        if (firstMovieGroup) {
            window.currentSeasonRawTitle = firstMovieGroup.title || "";
            const parsedGroup = parseMediaInfo(firstMovieGroup.title || "");
            const specLang = parsedGroup.meta.find(m => m.type === 'audio')?.text || "Dual";
            const specQual = parsedGroup.meta.find(m => m.type === 'quality')?.text || "720p";
            const specSize = parsedGroup.meta.find(m => m.type === 'size')?.text || "300MB";
            
            let codec = "x264";
            const rawTitleLower = (firstMovieGroup.title || "").toLowerCase();
            if (rawTitleLower.includes("x265") || rawTitleLower.includes("hevc")) {
                codec = "HEVC x265";
            } else if (rawTitleLower.includes("x264")) {
                codec = "x264";
            }
            if (rawTitleLower.includes("10bit")) {
                codec += " 10Bit";
            }

            const setSafeText = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.textContent = val;
            };

            setSafeText("specLanguage", specLang);
            setSafeText("specQuality", specQual);
            setSafeText("specSize", specSize);
            setSafeText("specCodec", codec);
        } else {
            window.currentSeasonRawTitle = meta.title || "Streams";
        }

        if (currentSeasonTitle) {
            currentSeasonTitle.textContent = meta.title || "Streams";
        }
        
        if (movieGroups.length > 0) {
            const streamList = movieGroups.map((g, idx) => ({
                title: g.title || `Stream Link ${idx + 1}`,
                link: g.directLinks?.[0]?.link || g.link || g.url
            }));
            renderEpisodeList(streamList, currentProvider);
        } else if (meta.linkList && meta.linkList.length > 0) {
            const streamList = meta.linkList.map((g, idx) => ({
                title: g.title || `Stream Link ${idx + 1}`,
                link: g.directLinks?.[0]?.link || g.link || g.url
            }));
            renderEpisodeList(streamList, currentProvider);
        } else {
            container.innerHTML = "<p style='color: var(--text-dim); padding: 20px 0;'>No playable streams found.</p>";
        }
    }
}

function renderDownloads(meta) {
    const wrapper = document.getElementById("downloadsSectionWrapper");
    const container = document.getElementById("downloadContainer");
    
    if (container) container.innerHTML = "";
    
    if (!meta || !meta.linkList) {
        if (wrapper) wrapper.style.display = 'none';
        return;
    }
    
    let downloadGroups = meta.linkList.filter(l => {
        if (!l) return false;
        const t = l.title || "";
        return t.toLowerCase().includes("download");
    });
    
    if (downloadGroups.length === 0) {
        if (wrapper) wrapper.style.display = 'none';
        return;
    }
    
    if (wrapper) wrapper.style.display = 'block';
    
    const table = document.createElement("table");
    table.className = "ep-table";
    table.innerHTML = `
        <thead>
            <tr>
                <th style="width: 50px; text-align: center;">#</th>
                <th>Download Title</th>
                <th>Quality</th>
                <th style="text-align: right;">Action</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;
    
    const tbody = table.querySelector("tbody");

    downloadGroups.forEach((group, idx) => {
        const parsed = parseMediaInfo(group.title || "Download Link");
        const qualTag = parsed.meta.find(m => m.type === 'quality')?.text || "WEB-DL";
        const groupTargetLink = group.link || group.url || "";

        const tr = document.createElement("tr");
        tr.className = "ep-row-card";
        
        tr.innerHTML = `
            <td class="ep-num-cell">${idx + 1}</td>
            <td class="ep-title-cell">
                <span>${parsed.title || group.title || "Download Link"}</span>
            </td>
            <td><span class="ep-quality-tag">${qualTag}</span></td>
            <td class="ep-actions-cell">
                <button class="ep-action-btn-dl" title="Get Download Links" onclick="resolveDownload('${groupTargetLink}', '${currentProvider}', '${group.title || ''}')">
                    <i data-lucide="download" style="width: 16px; height: 16px;"></i>
                </button>
            </td>
        `;

        tbody.appendChild(tr);
    });

    container.appendChild(table);
    if (window.lucide) window.lucide.createIcons();
}

async function loadEpisodes(episodesUrl, provider) {
    const container = document.getElementById("linksContainer");
    if (container) {
        container.innerHTML = `<div class="loader" style="min-height: 100px;"><div class="spinner"></div></div>`;
    }

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

        const data = await resp.json();
        let episodes = [];
        if (Array.isArray(data)) {
            episodes = data;
        } else if (data && Array.isArray(data.episodes)) {
            episodes = data.episodes;
        }

        if (episodes && episodes.length > 0) {
            renderEpisodeList(episodes, provider, episodesUrl);
        } else {
            const fallbackStream = [{
                title: currentMeta?.title || "Play Direct Stream",
                link: episodesUrl
            }];
            renderEpisodeList(fallbackStream, provider, episodesUrl);
        }

    } catch (err) {
        console.error("Episode load error, rendering fallback direct stream:", err);
        const fallbackStream = [{
            title: currentMeta?.title || "Play Direct Stream",
            link: episodesUrl
        }];
        renderEpisodeList(fallbackStream, provider, episodesUrl);
    }
}

function renderEpisodeList(episodes, provider, fallbackUrl = "") {
    const container = document.getElementById("linksContainer");
    if (!container) return;
    
    const safeEpisodes = Array.isArray(episodes) ? episodes : [];
    const epBadge = document.getElementById("currentEpisodeBadge");
    const epCountBadge = document.getElementById("episodesCountBadge");
    // Mobile card layout is rendered exclusively on mobile.html; Desktop Web UI is rendered on index.html / details.html
    const isMobileView = document.body.classList.contains('mobile-body') || document.getElementById("seasonSelectorMobile") !== null;

    const countText = `${safeEpisodes.length} Episodes`;
    if (epBadge) epBadge.textContent = countText;
    if (epCountBadge) epCountBadge.textContent = countText;
    
    container.innerHTML = "";
    
    if (!safeEpisodes.length) {
        container.innerHTML = "<p style='color: var(--text-dim); padding: 20px 0;'>No episodes found.</p>";
        if (fallbackUrl) {
            const btn = document.createElement("button");
            btn.className = "watch-now-btn";
            btn.style.marginTop = "10px";
            btn.innerHTML = `<i data-lucide="play"></i> Try playing as direct stream`;
            btn.onclick = () => playStream(fallbackUrl, provider);
            container.appendChild(btn);
            if (window.lucide) window.lucide.createIcons();
        }
        return;
    }

    // Extract dynamic fallbacks from parent title (season/group name)
    const parentTitleText = window.currentSeasonRawTitle || "";
    let fallbackSize = "300MB";
    let fallbackQual = "720p";
    if (parentTitleText) {
        const sizeMatch = parentTitleText.match(/\[(\d+(?:\.\d+)?\s*(?:MB|GB|mb|gb)(?:\/[eE])?)\]/i) || parentTitleText.match(/(\d+(?:\.\d+)?\s*(?:MB|GB|mb|gb))/i);
        if (sizeMatch) fallbackSize = sizeMatch[1] || sizeMatch[0];
        const qualMatch = parentTitleText.match(/(\d{3,4}p|4k|2k)/i);
        if (qualMatch) fallbackQual = qualMatch[1];
    }

    if (isMobileView) {
        const epList = document.createElement("div");
        epList.className = "mobile-episodes-list";

        safeEpisodes.forEach((ep, idx) => {
            const epNum = ep.episode || (idx + 1);
            const parsedEp = parseMediaInfo(ep.title || `Episode ${epNum}`);
            const sizeTag = parsedEp.meta.find(m => m.type === 'size')?.text || fallbackSize;
            const qualTag = parsedEp.meta.find(m => m.type === 'quality')?.text || fallbackQual;
            const epTargetLink = ep.link || ep.url || ep.episodesLink || fallbackUrl || "";

            const card = document.createElement("div");
            card.className = "mobile-ep-card";
            card.innerHTML = `
                <span class="mobile-ep-num">${epNum}.</span>
                <div class="mobile-ep-info">
                    <div class="mobile-ep-title-row">
                        <span class="mobile-ep-title">${parsedEp.title || ep.title || `Episode ${epNum}`}</span>
                        ${idx === 0 ? '<span class="ep-badge-new">New</span>' : ''}
                    </div>
                    <div class="mobile-ep-specs">
                        <span class="ep-quality-tag" style="background:rgba(59,130,246,0.15); border:1px solid rgba(59,130,246,0.3); color:#60a5fa; margin-right:4px;">${sizeTag}</span>
                        <span class="ep-quality-tag">${qualTag}</span>
                    </div>
                </div>
                <div class="mobile-ep-actions">
                    <button class="ep-action-btn-play" title="Watch Now" onclick="playStream('${epTargetLink}', '${provider}', '${ep.title || ''}')">
                        <i data-lucide="play" style="width: 16px; height: 16px; fill: currentColor;"></i>
                    </button>
                    <button class="ep-action-btn-dl" title="Extract Download Links" onclick="resolveDownload('${epTargetLink}', '${provider}', '${ep.title || ''}')">
                        <i data-lucide="download" style="width: 16px; height: 16px;"></i>
                    </button>
                </div>
            `;
            epList.appendChild(card);
        });

        container.appendChild(epList);
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    const table = document.createElement("table");
    table.className = "ep-table";
    table.innerHTML = `
        <thead>
            <tr>
                <th style="width: 50px; text-align: center;">Episode</th>
                <th>Title</th>
                <th>Size</th>
                <th>Quality</th>
                <th style="text-align: right;">Action</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;
    
    const tbody = table.querySelector("tbody");

    safeEpisodes.forEach((ep, idx) => {
        const epNum = ep.episode || (idx + 1);
        const parsedEp = parseMediaInfo(ep.title || `Episode ${epNum}`);
        const sizeTag = parsedEp.meta.find(m => m.type === 'size')?.text || fallbackSize;
        const qualTag = parsedEp.meta.find(m => m.type === 'quality')?.text || fallbackQual;

        const tr = document.createElement("tr");
        tr.className = "ep-row-card";
        
        tr.innerHTML = `
            <td class="ep-num-cell">${epNum}</td>
            <td class="ep-title-cell">
                <span>${parsedEp.title || ep.title || `Episode ${epNum}`}</span>
                ${idx === 0 ? '<span class="ep-badge-new">New</span>' : ''}
            </td>
            <td style="color: #94a3b8; font-size: 12px;">${sizeTag}</td>
            <td><span class="ep-quality-tag">${qualTag}</span></td>
            <td class="ep-actions-cell">
                <button class="ep-action-btn-play" title="Watch Now" onclick="playStream('${ep.link}', '${provider}', '${ep.title || ''}')">
                    <i data-lucide="play" style="width: 16px; height: 16px; fill: currentColor;"></i>
                </button>
                <button class="ep-action-btn-dl" title="Extract Download Links" onclick="resolveDownload('${ep.link}', '${provider}', '${ep.title || ''}')">
                    <i data-lucide="download" style="width: 16px; height: 16px;"></i>
                </button>
            </td>
        `;

        tbody.appendChild(tr);
    });

    container.appendChild(table);
    if (window.lucide) window.lucide.createIcons();
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
    const providerName = (providersMap[provider]?.display_name || provider || "Server");
    document.getElementById("dlModalProvider").innerText = "Fetching direct links from " + providerName + "...";
    
    const container = document.getElementById("dlModalLinksContainer");
    container.innerHTML = `<div class="loader dl-loader">
                        <div class="spinner" style="width: 24px; height: 24px;"></div>
                        <p style="font-size: 13px; color: var(--text-dim);">Extracting direct links...</p>
                    </div>`;

    const streams = await getResolvedStreams(link, provider);
    
    container.innerHTML = "";
    if (!streams || !streams.length) {
        container.innerHTML = "<p style='color: #ef4444; font-size: 14px; text-align: center; padding: 20px;'>Failed to extract direct download links for this stream.</p>";
        return;
    }

    document.getElementById("dlModalProvider").innerText = `Found ${streams.length} direct stream link(s) via ${providerName}`;

    streams.forEach((s) => {
        const card = document.createElement("div");
        card.className = "dl-stream-card";

        const qRaw = s.quality ? s.quality.toString() : "HD";
        const qText = qRaw.toLowerCase().includes('p') || qRaw.toLowerCase().includes('k') ? qRaw.toUpperCase() : qRaw + "P";
        const serverText = s.server ? `Server: ${s.server}` : "Direct Stream Server";

        card.innerHTML = `
            <div class="dl-stream-info">
                <div class="dl-quality-row">
                    <span class="dl-quality-badge">${qText}</span>
                    <span class="dl-server-tag">${serverText}</span>
                </div>
            </div>
            <div class="dl-actions">
                <button class="copy-link-btn" title="Copy Direct Link">
                    <i data-lucide="copy" style="width: 16px; height: 16px;"></i>
                </button>
                <a href="${s.link}" target="_blank" rel="noreferrer" class="dl-action-btn">
                    <i data-lucide="download" style="width: 15px; height: 15px;"></i> Direct Download
                </a>
            </div>
        `;

        const copyBtn = card.querySelector(".copy-link-btn");
        copyBtn.onclick = () => {
            if (s.link) {
                navigator.clipboard.writeText(s.link);
                copyBtn.innerHTML = `<i data-lucide="check" style="width: 16px; height: 16px; color: #22c55e;"></i>`;
                showScrollToast("Stream link copied to clipboard!");
                setTimeout(() => { 
                    copyBtn.innerHTML = `<i data-lucide="copy" style="width: 16px; height: 16px;"></i>`; 
                    if (window.lucide) lucide.createIcons(); 
                }, 2000);
            }
        };

        container.appendChild(card);
    });
    
    if (window.lucide) window.lucide.createIcons();
}

// ============================
// 🎬 PLAYER
// ============================
function initPlayer(streams, initialIndex = 0, episodeTitle = "") {
    let currentStreamIndex = initialIndex;
    let isTranscoding = false;
    let currentAudioTrack = null;
    let loadTimeout = null;

    const isMobilePage = document.body.classList.contains('mobile-body');
    if (isMobilePage) {
        // Mobile: show overlay instead of page switch
        const overlay = document.getElementById('playerOverlay');
        if (overlay) overlay.style.display = 'flex';
    } else {
        switchPage('pagePlayer');
    }

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
            const artContainer = document.getElementById('artplayer-app') || document.getElementById('artplayerContainer');
            if (artContainer) artContainer.style.display = 'block';
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
                container: document.getElementById('artplayer-app') ? '#artplayer-app' : '#artplayerContainer',
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

    const isMobilePage = document.body.classList.contains('mobile-body');

    if (player) {
        player.pause();
        player.destroy(false);
        player = null;
        const artEl = document.getElementById('artplayer-app') || document.getElementById('artplayerContainer');
        if (artEl) artEl.innerHTML = '';
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

    if (isMobilePage) {
        const overlay = document.getElementById('playerOverlay');
        if (overlay) overlay.style.display = 'none';
        return;
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
// ❤️ WISHLIST & DATA STORE
// ============================
function checkWishlistState() {
    if (!currentMeta || !currentMeta.__link) return;
    const wishlist = JSON.parse(localStorage.getItem('orbix_wishlist') || "[]");
    const targetLink = currentMeta.__link;
    const isSaved = wishlist.some(item => (item.link === targetLink || item.url === targetLink || item.id === targetLink));
    const btn = document.getElementById("wishlistBtn");
    const text = document.getElementById("wishlistText");
    
    if (!btn) return;

    if (isSaved) {
        btn.classList.add("saved", "active");
        btn.style.background = "";
        btn.style.borderColor = "";
        if (text) text.textContent = "Remove from Wishlist";
    } else {
        btn.classList.remove("saved", "active");
        btn.style.background = "";
        btn.style.borderColor = "";
        if (text) text.textContent = "Add to Wishlist";
    }
}

window.removeFromWishlist = function(link, e) {
    if (e) e.stopPropagation();
    let wishlist = JSON.parse(localStorage.getItem('orbix_wishlist') || "[]");
    wishlist = wishlist.filter(item => (item.link !== link && item.url !== link && item.id !== link));
    localStorage.setItem('orbix_wishlist', JSON.stringify(wishlist));
    updateWishlistBadge();
    checkWishlistState();
    if (currentFilter === "wishlist") {
        renderGrid(wishlist);
        setStatus(wishlist.length ? "Online" : "Wishlist is empty");
    }
};

async function toggleWishlist() {
    if (!currentMeta || !currentMeta.__link) return;
    
    let wishlist = JSON.parse(localStorage.getItem('orbix_wishlist') || "[]");
    const targetLink = currentMeta.__link;
    const index = wishlist.findIndex(item => (item.link === targetLink || item.url === targetLink || item.id === targetLink));
    
    if (index > -1) {
        wishlist.splice(index, 1);
        localStorage.setItem('orbix_wishlist', JSON.stringify(wishlist));
        checkWishlistState();
        updateWishlistBadge();
    } else {
        const btn = document.getElementById("wishlistBtn");
        const text = document.getElementById("wishlistText");
        if (text) text.textContent = "Caching Poster...";
        if (btn) btn.disabled = true;
        
        // 1. Robust Title Resolution across all provider schemas with validation
        const detailTitleEl = document.getElementById("detailTitle");
        const titleText = (detailTitleEl && isValidTitle(detailTitleEl.textContent))
            ? detailTitleEl.textContent 
            : "";
        
        const candidateWishlistTitles = [
            currentMeta?.title,
            currentMeta?.name,
            currentMeta?.postTitle,
            currentMeta?.caption,
            currentMeta?.heading,
            currentMeta?.details?.title,
            currentMeta?.movieName,
            currentMeta?.showName,
            titleText,
            extractTitleFromUrl(targetLink)
        ];
        const rawTitle = candidateWishlistTitles.find(t => isValidTitle(t)) || "Media Item";
        const parsedTitle = parseMediaInfo(rawTitle).title || rawTitle;
        
        // 2. Poster & Image Cache Resolution across all provider schemas
        let posterUrl = currentMeta.image || currentMeta.poster || currentMeta.cover || currentMeta.thumbnail || currentMeta.img || currentMeta.src || "";
        const imgEl = document.getElementById("detailPoster");
        if (imgEl && imgEl.src && !imgEl.src.includes('missing.jpg') && !imgEl.src.includes('placeholder') && !imgEl.src.includes('data:image/svg')) {
            posterUrl = imgEl.src;
        }
        
        const base64Image = await fetchImageAsBase64(posterUrl);
        const providerId = currentMeta.__provider || currentProvider || "";
        const providerDisplayName = providerId && providersMap[providerId] 
            ? providersMap[providerId].display_name 
            : providerId;
        
        wishlist.push({
            title: parsedTitle,
            rawTitle: rawTitle,
            image: base64Image || posterUrl || "missing.jpg",
            coverUrl: posterUrl || "",
            link: targetLink,
            url: targetLink,
            id: targetLink,
            __provider: providerId,
            provider: providerId,
            providerName: providerDisplayName || providerId,
            type: currentMeta.type || "Media",
            tmdbId: currentMeta.tmdbId || currentMeta.tmdb || currentMeta.tmdb_id || null,
            imdbId: currentMeta.imdbId || currentMeta.imdb || currentMeta.imdb_id || null,
            synopsis: currentMeta.description || currentMeta.synopsis || document.getElementById("detailSynopsis")?.textContent || "",
            addedAt: Date.now()
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
        
        const targetProvider = item.__provider || item.provider || currentProvider;
        const targetLink = item.link || item.url || item.id;
        
        if (!targetProvider || !targetLink) continue;

        setStatus(`Refreshing ${i + 1}/${wishlist.length}: ${item.title || item.rawTitle || 'Item'}...`, "#8b5cf6");
        
        try {
            const resp = await fetch(`${getApiUrl()}/fetch`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    provider: targetProvider,
                    functionName: "getMeta",
                    params: { link: targetLink, url: targetLink, id: targetLink }
                }),
                signal: AbortSignal.timeout(25000)
            });

            if (resp.ok) {
                const freshMeta = await resp.json();
                const freshTitle = freshMeta.title || freshMeta.name || freshMeta.postTitle || freshMeta.caption || freshMeta.heading || (freshMeta.details && freshMeta.details.title);
                if (freshMeta && freshTitle) {
                    item.rawTitle = freshTitle;
                    item.title = parseMediaInfo(freshTitle).title || freshTitle;
                    item.type = freshMeta.type || item.type;
                    if (freshMeta.synopsis || freshMeta.description) {
                        item.synopsis = freshMeta.description || freshMeta.synopsis;
                    }
                    
                    let posterUrl = freshMeta.image || freshMeta.poster || freshMeta.cover || freshMeta.thumbnail || freshMeta.img || freshMeta.src || item.coverUrl || item.image;
                    if (posterUrl && isValidImage(posterUrl)) {
                        item.coverUrl = posterUrl;
                        const base64Img = await fetchImageAsBase64(posterUrl);
                        if (base64Img) item.image = base64Img;
                    }
                    
                    // Normalize provider metadata
                    item.__provider = targetProvider;
                    item.provider = targetProvider;
                    item.providerName = (providersMap[targetProvider]?.display_name || targetProvider);
                    item.link = targetLink;
                    item.url = targetLink;
                    item.id = targetLink;

                    successCount++;
                }
            }
        } catch (err) {
            console.error(`Failed to refresh item ${item.title || item.rawTitle}:`, err);
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
window._providersReady = loadProviders();
setTimeout(() => showNoticeToast(), 1500);