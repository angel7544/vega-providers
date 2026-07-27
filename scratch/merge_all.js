const fs = require('fs');
const path = require('path');

// ==========================================
// 1. STYLE.CSS COPY
// ==========================================
console.log("Copying style.css to desktop-app locations...");
const webCss = fs.readFileSync('web/style.css', 'utf8');
const cssPaths = [
    'desktop-app/src/style.css',
    'desktop-app/src/styles/style.css',
    'desktop-app/src/assets/style.css',
    'desktop-app/public/style.css'
];

cssPaths.forEach(p => {
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(p, webCss, 'utf8');
    console.log("- Updated " + p);
});

// ==========================================
// 2. INDEX.HTML MERGE
// ==========================================
console.log("Merging index.html...");
let webHtml = fs.readFileSync('web/index.html', 'utf8');
webHtml = webHtml.replace(/\r\n/g, '\n'); // Normalize line endings

// A. Head modifications:
webHtml = webHtml.replace('href="style.css"', 'href="/src/style.css"');
webHtml = webHtml.replace(/<!-- HLS\.js & Artplayer -->[\s\S]+?<\/head>/, '</head>');
webHtml = webHtml.replace('<script src="app.js"></script>', '');

// B. Body wrapper:
const bodyStartIdx = webHtml.indexOf('<body>');
if (bodyStartIdx === -1) {
    throw new Error("Could not find <body> tag in web/index.html");
}
const bodyContentStart = bodyStartIdx + '<body>'.length;

const bodyEndIdx = webHtml.indexOf('</body>');
if (bodyEndIdx === -1) {
    throw new Error("Could not find </body> tag in web/index.html");
}

let bodyHtml = webHtml.slice(bodyContentStart, bodyEndIdx);

bodyHtml = bodyHtml.replace('onclick="window.location.reload()"', 'onclick="loadHome()" style="cursor: pointer;"');

// Insert pageDownloads inside <main> element before the closing </main> tag
const mainCloseIdx = bodyHtml.lastIndexOf('</main>');
if (mainCloseIdx !== -1) {
    const pageDownloadsHtml = '\n' +
        '        <!-- DOWNLOADS PAGE (static, survives Ctrl+F5) -->\n' +
        '        <div id="pageDownloads" class="page-view">\n' +
        '            <div style="padding: 24px; max-width: 800px; margin: 0 auto; margin-top: 80px;">\n' +
        '                <h2 style="font-size: 24px; margin-bottom: 24px; display: flex; align-items: center; gap: 12px;">\n' +
        '                    <i data-lucide="download-cloud" style="color: var(--accent); width: 28px; height: 28px;"></i>\n' +
        '                    Active Downloads\n' +
        '                </h2>\n' +
        '                <div id="downloadsList" style="display: flex; flex-direction: column; gap: 16px;"></div>\n' +
        '            </div>\n' +
        '        </div>\n';
    bodyHtml = bodyHtml.slice(0, mainCloseIdx) + pageDownloadsHtml + bodyHtml.slice(mainCloseIdx);
}

// In the nav-links, insert Downloads link
const wishlistLinkText = 'href="#" class="nav-link" onclick="loadWishlist()" id="navWishlist">';
const navWishlistIdx = bodyHtml.indexOf(wishlistLinkText);
if (navWishlistIdx !== -1) {
    const closeAnchorIdx = bodyHtml.indexOf('</a>', navWishlistIdx) + '</a>'.length;
    const dlNavLink = '\n                <a href="#" class="nav-link" onclick="openDownloadsModal()" id="navDownloads">\n' +
        '                    <i data-lucide="download-cloud" style="width:16px;height:16px;"></i>\n' +
        '                    <span>Downloads</span>\n' +
        '                </a>';
    bodyHtml = bodyHtml.slice(0, closeAnchorIdx) + dlNavLink + bodyHtml.slice(closeAnchorIdx);
}

// Strip out pagePlayer section
bodyHtml = bodyHtml.replace(/<!-- DEDICATED PLAYER PAGE -->[\s\S]+?(?=<!-- DOWNLOAD MODAL -->)/, '<!-- PLAYER REMOVED FOR DESKTOP -->\n    ');

// Replace the right column in settings modal
const settingsRightColStart = bodyHtml.indexOf('<!-- Right Column: Risk Disclaimer & Info -->');
if (settingsRightColStart !== -1) {
    let searchArea = bodyHtml.slice(settingsRightColStart);
    let openDivs = 0;
    let closeIdx = 0;
    const lines = searchArea.split('\n');
    let found = false;
    let charCount = 0;
    
    for (let line of lines) {
        charCount += line.length + 1;
        const openMatches = (line.match(/<div/g) || []).length;
        const closeMatches = (line.match(/\/div>/g) || []).length;
        openDivs += openMatches - closeMatches;
        if (openMatches > 0) found = true;
        if (found && openDivs <= 0) {
            closeIdx = charCount;
            break;
        }
    }
    
    if (closeIdx > 0) {
        const desktopSettingsRightCol = '\n' +
            '                <!-- Right Column: Risk Disclaimer & Notes -->\n' +
            '                <div style="display: flex; flex-direction: column; gap: 12px;">\n' +
            '                    <h3 style="font-size: 14px; margin-bottom: 0px; color: var(--text-main); font-weight: 700; display: flex; align-items: center; gap: 8px;">\n' +
            '                        <i data-lucide="settings-2" style="width: 16px; height: 16px; color: var(--accent);"></i> Application Settings\n' +
            '                    </h3>\n' +
            '                    <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--glass-border); padding: 12px; border-radius: var(--radius-md); display: flex; flex-direction: column; gap: 10px; font-size: 12px;">\n' +
            '                        <label style="font-weight: 600; color: var(--text-main);">API Server URL</label>\n' +
            '                        <div style="display: flex; gap: 8px;">\n' +
            '                            <input type="text" id="apiUrlInput" placeholder="http://localhost:3001" style="flex: 1; background: rgba(0,0,0,0.3); border: 1px solid var(--glass-border); border-radius: 6px; padding: 8px; color: var(--text-main); font-size: 12px;">\n' +
            '                            <button onclick="setQuickApi(\'http://localhost:3001\')" type="button" style="background: rgba(255,255,255,0.05); color: var(--text-dim); border: 1px solid var(--glass-border); border-radius: 6px; padding: 0 10px; font-weight: 600; cursor: pointer; font-size: 11px;">Local</button>\n' +
            '                            <button onclick="setQuickApi(\'https://ottpatna.vercel.app\')" type="button" style="background: rgba(255,255,255,0.05); color: var(--text-dim); border: 1px solid var(--glass-border); border-radius: 6px; padding: 0 10px; font-weight: 600; cursor: pointer; font-size: 11px;">Cloud</button>\n' +
            '                        </div>\n' +
            '                        <p style="color: var(--text-dim); margin: 0; font-size: 11px;">Select local server, cloud server, or manually input a custom API endpoint.</p>\n' +
            '                    </div>\n' +
            '\n' +
            '                    <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--glass-border); padding: 12px; border-radius: var(--radius-md); display: flex; flex-direction: column; gap: 10px; font-size: 12px;">\n' +
            '                        <label style="font-weight: 600; color: var(--text-main);">Default Download Directory</label>\n' +
            '                        <div style="display: flex; gap: 8px;">\n' +
            '                            <input type="text" id="dlDirInput" placeholder="Prompt each time..." readonly style="flex: 1; background: rgba(0,0,0,0.3); border: 1px solid var(--glass-border); border-radius: 6px; padding: 8px; color: var(--text-muted); font-size: 12px;">\n' +
            '                            <button onclick="selectDownloadDirectory()" style="background: var(--accent); color: #fff; border: none; border-radius: 6px; padding: 0 12px; font-weight: 600; cursor: pointer;">Browse</button>\n' +
            '                            <button onclick="clearDownloadDirectory()" style="background: rgba(239, 68, 68, 0.2); color: #ef4444; border: none; border-radius: 6px; padding: 0 12px; font-weight: 600; cursor: pointer;">Clear</button>\n' +
            '                        </div>\n' +
            '                        <p style="color: var(--text-dim); margin: 0; font-size: 11px;">If left blank, you will be prompted for a save location on every download.</p>\n' +
            '                    </div>\n' +
            '\n' +
            '                    <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--glass-border); padding: 12px; border-radius: var(--radius-md); display: flex; flex-direction: column; gap: 10px; font-size: 12px;">\n' +
            '                        <label style="font-weight: 600; color: var(--text-main);">VLC Player (Required for Streaming)</label>\n' +
            '                        <p style="color: var(--text-dim); margin: 0; font-size: 11px;">OrbixPlay uses the VLC media player to natively stream 4K/MKV formats.</p>\n' +
            '                        <button onclick="openVlcDownloadPage()" style="background: var(--accent); color: #fff; border: none; border-radius: 6px; padding: 8px 12px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">\n' +
            '                            <i data-lucide="external-link" style="width: 14px; height: 14px;"></i> Download VLC from videolan.org\n' +
            '                        </button>\n' +
            '                    </div>\n' +
            '                    \n' +
            '                    <div style="background: rgba(239, 68, 68, 0.06); border: 1px solid rgba(239, 68, 68, 0.2); padding: 12px; border-radius: var(--radius-md); display: flex; gap: 10px; align-items: flex-start; font-size: 12px; color: var(--text-dim); line-height: 1.5; margin-top: 12px;">\n' +
            '                         <i data-lucide="info" style="width: 16px; height: 16px; color: #ef4444; flex-shrink: 0; margin-top: 2px;"></i>\n' +
            '                         <span><strong>Disclaimer:</strong> OrbixPlay is a scraping search engine. We do not host, store, download, or index any video files. Streams are scraped from public services.</span>\n' +
            '                    </div>\n' +
            '                    \n' +
            '                    <div style="background: rgba(147, 51, 234, 0.06); border: 1px solid rgba(147, 51, 234, 0.2); padding: 12px; border-radius: var(--radius-md); display: flex; gap: 10px; align-items: flex-start; font-size: 12px; color: var(--text-dim); line-height: 1.5;">\n' +
            '                         <i data-lucide="help-circle" style="width: 16px; height: 16px; color: var(--accent); flex-shrink: 0; margin-top: 2px;"></i>\n' +
            '                         <span><strong>2K/4K Streams:</strong> Browser players only support up to 1080p audio natively. For 2K/4K, please use the <strong>Download</strong> option to get the full audio track.</span>\n' +
            '                    </div>\n' +
            '                </div>\n';
        bodyHtml = bodyHtml.slice(0, settingsRightColStart) + desktopSettingsRightCol + bodyHtml.slice(settingsRightColStart + closeIdx);
    }
}

// Assemble new HTML structure
const desktopModals = '\n' +
    '    <!-- VLC NOT FOUND MODAL -->\n' +
    '    <div id="vlcNotFoundModal" class="modal-overlay" style="display: none;">\n' +
    '        <div class="settings-dialog" style="max-width: 440px; width: 90%; padding: 0;">\n' +
    '            <div style="padding: 28px; display: flex; flex-direction: column; align-items: center; gap: 20px; text-align: center;">\n' +
    '                <div style="width: 64px; height: 64px; border-radius: 50%; background: rgba(239,68,68,0.12); display: flex; align-items: center; justify-content: center;">\n' +
    '                    <i data-lucide="video-off" style="width: 30px; height: 30px; color: #ef4444;"></i>\n' +
    '                </div>\n' +
    '                <div>\n' +
    '                    <h2 style="margin: 0 0 8px; font-size: 20px; color: var(--text-main);">VLC Not Found</h2>\n' +
    '                    <p style="margin: 0; font-size: 13px; color: var(--text-dim); line-height: 1.6;">VLC Media Player is required to stream videos. Please install it manually from <strong style="color: var(--accent);">videolan.org</strong> and try again.</p>\n' +
    '                </div>\n' +
    '                <div style="display: flex; gap: 12px; width: 100%;">\n' +
    '                    <button onclick="closeVlcModal()" style="flex: 1; padding: 10px; background: rgba(255,255,255,0.05); color: var(--text-dim); border: 1px solid var(--glass-border); border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 13px;">Close</button>\n' +
    '                    <button onclick="installVlcAndClose()" style="flex: 1.5; padding: 10px; background: var(--accent); color: #fff; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 13px; display: flex; align-items: center; justify-content: center; gap: 8px;">\n' +
    '                        <i data-lucide="external-link" style="width: 14px; height: 14px;"></i> Go to VLC Download\n' +
    '                    </button>\n' +
    '                </div>\n' +
    '            </div>\n' +
    '        </div>\n' +
    '    </div>\n' +
    '\n' +
    '    <!-- SERVER DOWN MODAL -->\n' +
    '    <div id="serverDownModal" class="modal-overlay" style="display: none; z-index: 99999;">\n' +
    '        <div class="settings-dialog" style="max-width: 440px; width: 90%; padding: 0;">\n' +
    '            <div style="padding: 28px; display: flex; flex-direction: column; align-items: center; gap: 20px; text-align: center;">\n' +
    '                <div style="width: 64px; height: 64px; border-radius: 50%; background: rgba(239,68,68,0.12); display: flex; align-items: center; justify-content: center;">\n' +
    '                    <i data-lucide="server-crash" style="width: 30px; height: 30px; color: #ef4444;"></i>\n' +
    '                </div>\n' +
    '                <div>\n' +
    '                    <h2 style="margin: 0 0 8px; font-size: 20px; color: var(--text-main);">Error 404: Server Down</h2>\n' +
    '                    <p style="margin: 0; font-size: 13px; color: var(--text-dim); line-height: 1.6;">Cannot connect to the backend server. Please ensure your API server is running and accessible at <br><strong style="color: var(--accent);" id="serverDownUrlLabel"></strong></p>\n' +
    '                </div>\n' +
    '                <div style="display: flex; gap: 12px; width: 100%;">\n' +
    '                    <button onclick="openSettingsModal(); document.getElementById(\'serverDownModal\').style.display=\'none\';" style="flex: 1; padding: 10px; background: rgba(255,255,255,0.05); color: var(--text-dim); border: 1px solid var(--glass-border); border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 13px;">Change API</button>\n' +
    '                    <button onclick="window.location.reload()" style="flex: 1; padding: 10px; background: var(--accent); color: #fff; border: none; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 13px; display: flex; align-items: center; justify-content: center; gap: 8px;">\n' +
    '                        <i data-lucide="refresh-cw" style="width: 14px; height: 14px;"></i> Retry\n' +
    '                    </button>\n' +
    '                </div>\n' +
    '            </div>\n' +
    '        </div>\n' +
    '    </div>\n' +
    '    \n' +
    '    <div id="react-player-root"></div>\n';

const newHtmlContent = webHtml.slice(0, bodyContentStart) + `
    <!-- React Welcome Screen Root -->
    <div id="welcome-root"></div>

    <div id="orbix-main-app" style="display: none; opacity: 0; transition: opacity 0.5s ease-in-out;">
` + bodyHtml + desktopModals + `
    </div>

    <!-- APP SCRIPT (Bundled via Vite) -->
    <script type="module" src="/src/main.tsx"></script>
` + webHtml.slice(bodyEndIdx);

fs.writeFileSync('desktop-app/index.html', newHtmlContent, 'utf8');
console.log("- Successfully merged desktop-app/index.html");


// ==========================================
// 3. APP.JS TRANSLATION & MERGE
// ==========================================
console.log("Merging and translating app.js...");
let webApp = fs.readFileSync('web/app.js', 'utf8');
webApp = webApp.replace(/\r\n/g, '\n'); // Normalize line endings

// A. REMOVE FIRST DUPLICATE DEFINITION OF switchPage
const duplicateSwitchPage = 'function switchPage(pageId) {\n' +
    '    document.querySelectorAll(\'.page-view\').forEach(el => {\n' +
    '        el.classList.remove(\'active\');\n' +
    '        el.style.display = \'none\';\n' +
    '    });\n' +
    '    const target = document.getElementById(pageId);\n' +
    '    if (target) {\n' +
    '        target.classList.add(\'active\');\n' +
    '        target.style.display = \'block\';\n' +
    '    }\n' +
    '}';

webApp = webApp.replace(duplicateSwitchPage, '');
console.log("- Removed duplicate switchPage declaration");

// B. REMOVE DUPLICATE handleImageError DECLARATIONS (keep only the async one at the end)
const duplicateHie1 = 'function handleImageError(imgEl, title) {\n' +
    '    if (!imgEl) return;\n' +
    '    imgEl.onerror = null;\n' +
    '    const safeTitle = (title || "OrbixPlay").trim();\n' +
    '    const cleanTitle = safeTitle.length > 18 ? safeTitle.slice(0, 18) + "..." : safeTitle;\n' +
    '    const encodedTitle = encodeURIComponent(cleanTitle);\n' +
    '    imgEl.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><rect width="100%" height="100%" fill="%231e1b4b"/><rect width="100%" height="100%" fill="url(%23g)" opacity="0.3"/><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="%239333ea"/><stop offset="100%" stop-color="%234338ca"/></linearGradient></defs><text x="50%" y="45%" font-family="sans-serif" font-size="20" font-weight="bold" fill="%23ffffff" text-anchor="middle">${encodedTitle}</text><text x="50%" y="55%" font-family="sans-serif" font-size="12" fill="%23a78bfa" text-anchor="middle">OrbixPlay Media</text></svg>`;\n' +
    '}';

webApp = webApp.replace(duplicateHie1, '');
console.log("- Removed duplicate handleImageError 1");

const duplicateHie2 = 'function handleImageError(imgEl, title = "") {\n' +
    '    if (!imgEl) return;\n' +
    '    imgEl.onerror = null;\n' +
    '    const displayTitle = (title || currentMeta?.title || "OrbixPlay").trim();\n' +
    '    const encodedTitle = encodeURIComponent(displayTitle.length > 25 ? displayTitle.substring(0, 25) + "..." : displayTitle);\n' +
    '    imgEl.src = `https://placehold.co/400x600/1a1a24/a78bfa.svg?text=${encodedTitle}`;\n' +
    '}';

webApp = webApp.replace(duplicateHie2, '');
console.log("- Removed duplicate handleImageError 2");

// C. REMOVE DUPLICATE refreshDetails DECLARATION
const duplicateRefreshDetails2 = 'function refreshDetails() {\n' +
    '    if (!currentMeta || !currentMeta.__link) return;\n' +
    '    showDetails(currentMeta.__link, currentMeta.__provider);\n' +
    '}';

webApp = webApp.replace(duplicateRefreshDetails2, '');
console.log("- Removed duplicate refreshDetails 2");


// Perform localStorage translation
webApp = webApp.replace(/let API_BASE = localStorage\.getItem\('vega_api_url'\) \|\| "";/, 'let API_BASE = "http://localhost:3001";');
webApp = webApp.replace(/let currentProvider = localStorage\.getItem\('orbix_last_provider'\) \|\| "";/, 'let currentProvider = "";');
webApp = webApp.replace(/let tmdbKey = localStorage\.getItem\('tmdb_api_key'\) \|\| "";/, 'let tmdbKey = "";');

webApp = webApp.replace(/localStorage\.getItem\('orbix_theme'\) \|\| 'light'/g, "db.get('orbix_theme', 'light')");
webApp = webApp.replace(/localStorage\.setItem\('orbix_theme',\s*newTheme\)/g, "db.set('orbix_theme', newTheme)");

webApp = webApp.replace(/JSON\.parse\(localStorage\.getItem\('orbix_wishlist'\) \|\| "\[\]"\)/g, "db.get('orbix_wishlist', [])");
webApp = webApp.replace(/JSON\.parse\(localStorage\.getItem\('orbix_wishlist'\) \|\| '\[\]'\)/g, "db.get('orbix_wishlist', [])");
webApp = webApp.replace(/localStorage\.setItem\('orbix_wishlist',\s*JSON\.stringify\(wishlist\)\)/g, "db.set('orbix_wishlist', wishlist)");

webApp = webApp.replace(/JSON\.parse\(localStorage\.getItem\('orbix_disabled_providers'\) \|\| '\[\]'\)/g, "db.get('orbix_disabled_providers', [])");
webApp = webApp.replace(/JSON\.parse\(localStorage\.getItem\('orbix_disabled_providers'\) \|\| "\[\]"\)/g, "db.get('orbix_disabled_providers', [])");
webApp = webApp.replace(/localStorage\.setItem\('orbix_disabled_providers',\s*JSON\.stringify\(disabledList\)\)/g, "db.set('orbix_disabled_providers', disabledList)");

webApp = webApp.replace(/localStorage\.setItem\('orbix_last_provider',\s*currentProvider\)/g, "db.set('orbix_last_provider', currentProvider)");

webApp = webApp.replace(/localStorage\.getItem\('orbix_notice_time'\)/g, "db.get('orbix_notice_time', 0)");
webApp = webApp.replace(/localStorage\.setItem\('orbix_notice_time',\s*now\.toString\(\)\)/g, "db.set('orbix_notice_time', now)");

function replaceFunction(source, funcName, replacement) {
    const lines = source.split('\n');
    let startIdx = -1;
    let braceCount = 0;
    let endIdx = -1;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes("function " + funcName)) {
            startIdx = i;
            braceCount = (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
            continue;
        }
        if (startIdx !== -1) {
            braceCount += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
            if (braceCount <= 0) {
                endIdx = i;
                break;
            }
        }
    }
    
    if (startIdx !== -1 && endIdx !== -1) {
        console.log("Replacing function " + funcName + " from line " + (startIdx+1) + " to " + (endIdx+1));
        lines.splice(startIdx, endIdx - startIdx + 1, replacement);
        return lines.join('\n');
    } else {
        console.warn("WARNING: function " + funcName + " not found!");
        return source;
    }
}

const desktopOpenSettings = "function openSettingsModal() {\n" +
    "    // Render active providers checklist\n" +
    "    renderSettingsProviders();\n" +
    "    \n" +
    "    // Populate API URL\n" +
    "    const savedApi = db.get('vega_api_url', 'http://localhost:3001');\n" +
    "    const input = document.getElementById('apiUrlInput');\n" +
    "    if (input) input.value = savedApi;\n" +
    "\n" +
    "    settingsModal.style.display = \"flex\";\n" +
    "    setTimeout(() => settingsModal.classList.add('active'), 10);\n" +
    "}";

const desktopSaveSettings = "async function saveSettings() {\n" +
    "    // Save disabled providers list\n" +
    "    const checkboxes = document.querySelectorAll(\"#settingsProvidersList input[type='checkbox']\");\n" +
    "    const disabledList = [];\n" +
    "    checkboxes.forEach(chk => {\n" +
    "        if (!chk.checked) {\n" +
    "            disabledList.push(chk.dataset.providerId);\n" +
    "        }\n" +
    "    });\n" +
    "    await db.set('orbix_disabled_providers', disabledList);\n" +
    "\n" +
    "    // Save API Base URL\n" +
    "    const apiInput = document.getElementById('apiUrlInput');\n" +
    "    if (apiInput) {\n" +
    "        let val = apiInput.value.trim() || 'http://localhost:3001';\n" +
    "        await db.set('vega_api_url', val);\n" +
    "    }\n" +
    "\n" +
    "    closeSettingsModal();\n" +
    "    window.location.reload();\n" +
    "}";

const desktopPlayStream = "async function playStream(link, provider, episodeTitle = \"\") {\n" +
    "    setStatus(\"Extracting stream...\", \"#8b5cf6\");\n" +
    "\n" +
    "    const streams = await getResolvedStreams(link, provider);\n" +
    "    console.log(\"🎥 RESOLVED STREAMS:\", streams);\n" +
    "\n" +
    "    if (!streams || !streams.length) {\n" +
    "        if (confirm(\"⚠️ No playable stream found for this provider. Would you like to search again?\")) {\n" +
    "            fetchData(currentMeta ? parseMediaInfo(currentMeta.title).title : \"\", true);\n" +
    "        } else {\n" +
    "            setStatus(\"Online\");\n" +
    "        }\n" +
    "        return;\n" +
    "    }\n" +
    "\n" +
    "    setStatus(\"Online\", \"#22c55e\");\n" +
    "    \n" +
    "    const parsedMeta = parseMediaInfo(currentMeta?.title || \"Video\");\n" +
    "    const displayTitle = episodeTitle ? (parsedMeta.title + \" - \" + episodeTitle) : parsedMeta.title;\n" +
    "    \n" +
    "    showSourceSelectionModal(streams, displayTitle, provider, false);\n" +
    "}";

const desktopResolveDownload = "async function resolveDownload(link, provider, title) {\n" +
    "    setStatus(\"Extracting links...\", \"#8b5cf6\");\n" +
    "    const streams = await getResolvedStreams(link, provider);\n" +
    "    \n" +
    "    if (!streams || !streams.length) {\n" +
    "        setStatus(\"Failed to extract links.\", \"#ef4444\");\n" +
    "        return;\n" +
    "    }\n" +
    "    \n" +
    "    setStatus(\"Online\", \"#22c55e\");\n" +
    "    showSourceSelectionModal(streams, title || \"Extracting Media\", provider, true);\n" +
    "}";

webApp = replaceFunction(webApp, 'openSettingsModal', desktopOpenSettings);
webApp = replaceFunction(webApp, 'saveSettings', desktopSaveSettings);
webApp = replaceFunction(webApp, 'playStream', desktopPlayStream);
webApp = replaceFunction(webApp, 'resolveDownload', desktopResolveDownload);

// Strip web auto start block at the end
webApp = webApp.replace(/\/\/ 🚀 START[\s\S]+$/, '');

// Tauri specific methods block to append at the end
const tauriBlocks = '\n' +
    '// ==========================================\n' +
    '// 🛠️ TAURI NATIVE IMPLEMENTATIONS\n' +
    '// ==========================================\n' +
    '\n' +
    'function extractStreamData(data) {\n' +
    '    if (!data) return null;\n' +
    '\n' +
    '    if (Array.isArray(data)) return extractStreamData(data[0]);\n' +
    '\n' +
    '    let url = null;\n' +
    '    if (data.link) url = data.link;\n' +
    '    else if (data.file) url = data.file;\n' +
    '    else if (data.url) url = data.url;\n' +
    '    else if (data.sources?.length) url = data.sources[0].file;\n' +
    '    else if (data.data) return extractStreamData(data.data);\n' +
    '\n' +
    '    if (url) {\n' +
    '        let headers = data.headers || null;\n' +
    '        if (!headers && data.sources?.length && data.sources[0].headers) {\n' +
    '            headers = data.sources[0].headers;\n' +
    '        }\n' +
    '        return { url, headers };\n' +
    '    }\n' +
    '    return null;\n' +
    '}\n' +
    '\n' +
    'function showSourceSelectionModal(streams, title, provider, isDownload) {\n' +
    '    const overlay = document.createElement("div");\n' +
    '    overlay.className = "modal-overlay active";\n' +
    '    overlay.style.display = "flex";\n' +
    '    \n' +
    '    const dialog = document.createElement("div");\n' +
    '    dialog.className = "settings-dialog";\n' +
    '    dialog.style.maxWidth = "500px";\n' +
    '    dialog.style.width = "90%";\n' +
    '    dialog.style.background = "var(--surface-deep)";\n' +
    '    dialog.style.border = "1px solid var(--glass-border)";\n' +
    '    dialog.style.borderRadius = "16px";\n' +
    '    dialog.style.display = "flex";\n' +
    '    dialog.style.flexDirection = "column";\n' +
    '    dialog.style.boxShadow = "0 20px 40px rgba(0,0,0,0.8)";\n' +
    '    dialog.style.position = "relative";\n' +
    '    \n' +
    '    const closeBtn = document.createElement("button");\n' +
    '    closeBtn.className = "close-modal";\n' +
    '    closeBtn.innerHTML = `<i data-lucide="x"></i>`;\n' +
    '    closeBtn.style.position = "absolute";\n' +
    '    closeBtn.style.top = "16px";\n' +
    '    closeBtn.style.right = "16px";\n' +
    '    closeBtn.style.background = "transparent";\n' +
    '    closeBtn.style.border = "none";\n' +
    '    closeBtn.style.color = "var(--text-muted)";\n' +
    '    closeBtn.style.cursor = "pointer";\n' +
    '    closeBtn.onclick = () => {\n' +
    '        overlay.remove();\n' +
    '    };\n' +
    '    \n' +
    '    const header = document.createElement("div");\n' +
    '    header.style.padding = "24px";\n' +
    '    header.style.borderBottom = "1px solid var(--glass-border)";\n' +
    '    header.innerHTML = `\n' +
    '        <h2 style="margin: 0; font-size: 20px; display: flex; align-items: center; gap: 10px; color: var(--text-main);">\n' +
    '            ${isDownload ? "Download Source" : "Play Source"} <i data-lucide="${isDownload ? "download-cloud" : "play-circle"}" style="color: var(--accent);"></i>\n' +
    '        </h2>\n' +
    '        <div style="font-size: 13px; color: var(--text-dim); margin-top: 6px;">Select a quality to ${isDownload ? "download" : "play in MPV"}</div>\n' +
    '    `;\n' +
    '    \n' +
    '    const content = document.createElement("div");\n' +
    '    content.style.padding = "24px";\n' +
    '    \n' +
    '    const meta = document.createElement("div");\n' +
    '    meta.style.display = "flex";\n' +
    '    meta.style.alignItems = "center";\n' +
    '    meta.style.gap = "12px";\n' +
    '    meta.style.background = "var(--surface-light)";\n' +
    '    meta.style.padding = "16px";\n' +
    '    meta.style.borderRadius = "12px";\n' +
    '    meta.style.marginBottom = "24px";\n' +
    '    meta.style.border = "1px solid var(--glass-border)";\n' +
    '    meta.innerHTML = `\n' +
    '        <i data-lucide="film" style="width: 24px; height: 24px; color: var(--text-dim);"></i>\n' +
    '        <div>\n' +
    '            <div style="font-weight: 600; font-size: 15px; margin-bottom: 4px; color: var(--text-main);">${title}</div>\n' +
    '            <div style="font-size: 12px; color: var(--text-muted);">Provider: ${provider}</div>\n' +
    '        </div>\n' +
    '    `;\n' +
    '    content.appendChild(meta);\n' +
    '    \n' +
    '    const list = document.createElement("div");\n' +
    '    list.style.display = "flex";\n' +
    '    list.style.flexDirection = "column";\n' +
    '    list.style.gap = "10px";\n' +
    '    \n' +
    '    streams.forEach((s, i) => {\n' +
    '        const row = document.createElement("div");\n' +
    '        row.style.display = "flex";\n' +
    '        row.style.justifyContent = "space-between";\n' +
    '        row.style.alignItems = "center";\n' +
    '        row.style.padding = "12px";\n' +
    '        row.style.border = "1px solid var(--glass-border)";\n' +
    '        row.style.borderRadius = "12px";\n' +
    '        row.style.background = "var(--surface-light)";\n' +
    '        row.style.cursor = "pointer";\n' +
    '        row.onmouseover = () => row.style.background = "var(--glass-border)";\n' +
    '        row.onmouseout = () => row.style.background = "var(--surface-light)";\n' +
    '        \n' +
    '        const qText = s.quality ? s.quality + "p" : "Unknown Quality";\n' +
    '        const serverText = s.server ? `Server: ${s.server}` : "";\n' +
    '\n' +
    '        row.innerHTML = `\n' +
    '            <div style="display: flex; flex-direction: column; gap: 4px;">\n' +
    '                <div style="font-size: 14px; font-weight: 600; color: var(--text-main);">${qText}</div>\n' +
    '                <div style="font-size: 12px; color: var(--text-muted);">${serverText}</div>\n' +
    '            </div>\n' +
    '            <button style="background: var(--accent); color: #fff; padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; border: none; cursor: pointer; display: flex; align-items: center; gap: 6px;">\n' +
    '                <i data-lucide="${isDownload ? "download" : "play"}" style="width: 14px; height: 14px;"></i> ${isDownload ? "Download" : "Play"}\n' +
    '            </button>\n' +
    '        `;\n' +
    '        \n' +
    '        row.onclick = () => {\n' +
    '            overlay.remove();\n' +
    '            let streamData = extractStreamData(s);\n' +
    '            if (!streamData || !streamData.url) return;\n' +
    '            \n' +
    '            if (isDownload) {\n' +
    '                // Initialize Native Download\n' +
    '                const savedDir = db.get(\'orbix_download_dir\', \'\') || null;\n' +
    '                invoke("start_download_dialog", { url: streamData.url, title: title, downloadDir: savedDir, headers: streamData.headers })\n' +
    '                    .catch(e => {\n' +
    '                        console.error("Download failed:", e);\n' +
    '                        alert("Download Error: " + e);\n' +
    '                    });\n' +
    '            } else {\n' +
    '                // Launch VLC\n' +
    '                setStatus("Launching VLC player...", "#8b5cf6");\n' +
    '                invoke("launch_vlc", { url: streamData.url, title: title, headers: streamData.headers })\n' +
    '                    .then(() => setStatus("Online", "#22c55e"))\n' +
    '                    .catch(e => {\n' +
    '                        console.error("VLC launch failed:", e);\n' +
    '                        setStatus("Online");\n' +
    '                        if (String(e).includes("VLC_NOT_FOUND")) {\n' +
    '                            showVlcNotFoundModal();\n' +
    '                        } else {\n' +
    '                            alert("Error launching VLC: " + e);\n' +
    '                        }\n' +
    '                    });\n' +
    '            }\n' +
    '        };\n' +
    '        \n' +
    '        list.appendChild(row);\n' +
    '    });\n' +
    '    \n' +
    '    content.appendChild(list);\n' +
    '    dialog.appendChild(closeBtn);\n' +
    '    dialog.appendChild(header);\n' +
    '    dialog.appendChild(content);\n' +
    '    overlay.appendChild(dialog);\n' +
    '    document.body.appendChild(overlay);\n' +
    '\n' +
    '    if (window.lucide) lucide.createIcons();\n' +
    '}\n' +
    '\n' +
    'window.activeDownloads = {};\n' +
    '\n' +
    'async function restoreActiveDownloads() {\n' +
    '    try {\n' +
    '        const active = await invoke(\'get_active_downloads\');\n' +
    '        if (!active || !active.length) return;\n' +
    '        active.forEach(dl => {\n' +
    '            if (!window.activeDownloads[dl.id]) {\n' +
    '                window.activeDownloads[dl.id] = {\n' +
    '                    title: dl.title,\n' +
    '                    downloaded: 0,\n' +
    '                    total: 0,\n' +
    '                    speed: 0,\n' +
    '                    status: dl.paused ? \'paused\' : \'downloading\',\n' +
    '                    paused: dl.paused\n' +
    '                };\n' +
    '            }\n' +
    '        });\n' +
    '        if (Object.keys(window.activeDownloads).length > 0) {\n' +
    '            renderActiveDownloads();\n' +
    '        }\n' +
    '    } catch (e) {\n' +
    '        console.warn(\'[Downloads] Could not restore active downloads:\', e);\n' +
    '    }\n' +
    '}\n' +
    '\n' +
    'function openDownloadsModal() {\n' +
    '    switchPage(\'pageDownloads\');\n' +
    '    renderActiveDownloads();\n' +
    '}\n' +
    '\n' +
    'function renderActiveDownloads() {\n' +
    '    const container = document.getElementById(\'downloadsList\');\n' +
    '    if (!container) return;\n' +
    '\n' +
    '    container.innerHTML = \'\';\n' +
    '    const ids = Object.keys(window.activeDownloads);\n' +
    '\n' +
    '    if (ids.length === 0) {\n' +
    '        container.innerHTML = `\n' +
    '            <div style="text-align:center; padding: 60px 24px; color: var(--text-muted);">\n' +
    '                <i data-lucide="download-cloud" style="width:48px;height:48px;margin-bottom:16px;opacity:0.3;"></i>\n' +
    '                <p style="font-size:14px;">No active downloads</p>\n' +
    '            </div>`;\n' +
    '        if (window.lucide) window.lucide.createIcons();\n' +
    '        return;\n' +
    '    }\n' +
    '\n' +
    '    ids.forEach(id => {\n' +
    '        const dl = window.activeDownloads[id];\n' +
    '\n' +
    '        let progressPercent = 0;\n' +
    '        if (dl.total && dl.total > 0) {\n' +
    '            progressPercent = Math.round((dl.downloaded / dl.total) * 100);\n' +
    '        }\n' +
    '\n' +
    '        const speedMB    = dl.speed ? (dl.speed / (1024 * 1024)).toFixed(2) : \'0.00\';\n' +
    '        const downloadedMB = dl.downloaded ? (dl.downloaded / (1024 * 1024)).toFixed(1) : \'0\';\n' +
    '        const totalMB    = dl.total ? (dl.total / (1024 * 1024)).toFixed(1) : \'?\';\n' +
    '        const isPaused   = dl.paused || dl.status === \'paused\';\n' +
    '        const isError    = dl.status === \'error\';\n' +
    '        const isFinished = dl.status === \'finished\';\n' +
    '\n' +
    '        const barColor = isError ? \'#ef4444\' : isPaused ? \'#f59e0b\' : \'var(--accent)\';\n' +
    '\n' +
    '        let statusLabel = \'\';\n' +
    '        if (isFinished)       statusLabel = \'✅ Finished\';\n' +
    '        else if (isError)     statusLabel = `❌ Error: ${dl.error || \'unknown\'}`;\n' +
    '        else if (isPaused)    statusLabel = \'⏸ Paused\';\n' +
    '        else                  statusLabel = `⬇ ${speedMB} MB/s`;\n' +
    '\n' +
    '        const item = document.createElement(\'div\');\n' +
    '        item.dataset.dlId = id;\n' +
    '        item.style.cssText = `\n' +
    '            background: rgba(255,255,255,0.02);\n' +
    '            border: 1px solid ${isPaused ? \'rgba(245,158,11,0.3)\' : \'var(--glass-border)\'};\n' +
    '            border-radius: 14px; padding: 16px;\n' +
    '            display: flex; flex-direction: column; gap: 12px;\n' +
    '            transition: border-color 0.3s;\n' +
    '        `;\n' +
    '\n' +
    '        item.innerHTML = `\n' +
    '            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">\n' +
    '                <div style="font-weight:600; font-size:14px; line-height:1.4; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${dl.title}</div>\n' +
    '                <div style="display:flex; gap:6px; flex-shrink:0;">\n' +
    '                    ${!isFinished && !isError ? `\n' +
    '                    <button class="dl-pause-btn" data-id="${id}" data-paused="${isPaused}"\n' +
    '                        style="background:${isPaused ? \'rgba(245,158,11,0.15)\' : \'rgba(139,92,246,0.12)\'};\n' +
    '                               color:${isPaused ? \'#f59e0b\' : \'var(--accent)\'};\n' +
    '                               border:1px solid ${isPaused ? \'rgba(245,158,11,0.3)\' : \'rgba(139,92,246,0.3)\'};\n' +
    '                               padding:5px 10px; border-radius:6px; cursor:pointer;\n' +
    '                               font-size:12px; font-weight:600; display:flex; align-items:center; gap:5px;">\n' +
    '                        <i data-lucide="${isPaused ? \'play\' : \'pause\'}" style="width:12px;height:12px;"></i>\n' +
    '                        ${isPaused ? \'Resume\' : \'Pause\'}\n' +
    '                    </button>` : \'\'}\n' +
    '                    ${!isFinished ? `\n' +
    '                    <button class="dl-cancel-btn" data-id="${id}"\n' +
    '                        style="background:rgba(239,68,68,0.1); color:#ef4444;\n' +
    '                               border:1px solid rgba(239,68,68,0.2);\n' +
    '                               padding:5px 10px; border-radius:6px; cursor:pointer;\n' +
    '                               font-size:12px; font-weight:600; display:flex; align-items:center; gap:5px;">\n' +
    '                        <i data-lucide="x" style="width:12px;height:12px;"></i> Cancel\n' +
    '                    </button>` : \'\'}\n' +
    '                </div>\n' +
    '            </div>\n' +
    '\n' +
    '            <div>\n' +
    '                <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-muted); margin-bottom:6px;">\n' +
    '                    <span>${statusLabel}</span>\n' +
    '                    <span style="font-variant-numeric:tabular-nums;">\n' +
    '                        ${dl.total > 0 ? `${downloadedMB} / ${totalMB} MB` : `${progressPercent}%`}\n' +
    '                    </span>\n' +
    '                </div>\n' +
    '                <div style="height:5px; background:rgba(255,255,255,0.08); border-radius:4px; overflow:hidden;">\n' +
    '                    <div style="height:100%; width:${progressPercent}%;\n' +
    '                                background:${barColor}; border-radius:4px;\n' +
    '                                transition:width 0.4s ease;"></div>\n' +
    '                </div>\n' +
    '            </div>\n' +
    '\n' +
    '            <div style="font-size:10px; color:var(--text-dim); word-break:break-all; opacity:0.6;">${id}</div>\n' +
    '        `;\n' +
    '\n' +
    '        container.appendChild(item);\n' +
    '    });\n' +
    '\n' +
    '    if (window.lucide) window.lucide.createIcons();\n' +
    '\n' +
    '    container.querySelectorAll(\'.dl-pause-btn\').forEach(btn => {\n' +
    '        btn.onclick = async () => {\n' +
    '            const id     = btn.dataset.id;\n' +
    '            const paused = btn.dataset.paused === \'true\';\n' +
    '            try {\n' +
    '                if (paused) {\n' +
    '                    await invoke(\'resume_download\', { id });\n' +
    '                } else {\n' +
    '                    await invoke(\'pause_download\', { id });\n' +
    '                }\n' +
    '            } catch (e) { console.error(e); }\n' +
    '        };\n' +
    '    });\n' +
    '\n' +
    '    container.querySelectorAll(\'.dl-cancel-btn\').forEach(btn => {\n' +
    '        btn.onclick = () => {\n' +
    '            invoke(\'cancel_download\', { id: btn.dataset.id }).catch(console.error);\n' +
    '        };\n' +
    '    });\n' +
    '}\n' +
    '\n' +
    'async function selectDownloadDirectory() {\n' +
    '    try {\n' +
    '        const selectedPath = await open({\n' +
    '            directory: true,\n' +
    '            multiple: false,\n' +
    '            title: "Select Default Download Folder"\n' +
    '        });\n' +
    '        if (selectedPath) {\n' +
    '            await db.set(\'orbix_download_dir\', selectedPath);\n' +
    '            const input = document.getElementById(\'dlDirInput\');\n' +
    '            if (input) input.value = selectedPath;\n' +
    '            setStatus("Download directory saved!", "#22c55e");\n' +
    '        }\n' +
    '    } catch (e) {\n' +
    '        console.error(e);\n' +
    '        alert("Failed to pick directory: " + e);\n' +
    '    }\n' +
    '}\n' +
    '\n' +
    'async function clearDownloadDirectory() {\n' +
    '    await db.remove(\'orbix_download_dir\');\n' +
    '    const input = document.getElementById(\'dlDirInput\');\n' +
    '    if (input) input.value = "";\n' +
    '    setStatus("Download directory cleared.", "#f59e0b");\n' +
    '}\n' +
    '\n' +
    'function openVlcDownloadPage() {\n' +
    '    invoke("open_vlc_download_page").catch(e => {\n' +
    '        console.error("Failed to open VLC download page:", e);\n' +
    '        window.open("https://www.videolan.org/vlc/download-windows.html", "_blank");\n' +
    '    });\n' +
    '}\n' +
    '\n' +
    'function showVlcNotFoundModal() {\n' +
    '    const modal = document.getElementById(\'vlcNotFoundModal\');\n' +
    '    if (!modal) return;\n' +
    '    modal.style.display = \'flex\';\n' +
    '    setTimeout(() => modal.classList.add(\'active\'), 10);\n' +
    '    if (window.lucide) window.lucide.createIcons();\n' +
    '}\n' +
    '\n' +
    'window.closeVlcModal = function() {\n' +
    '    const modal = document.getElementById(\'vlcNotFoundModal\');\n' +
    '    if (!modal) return;\n' +
    '    modal.classList.remove(\'active\');\n' +
    '    setTimeout(() => modal.style.display = \'none\', 300);\n' +
    '};\n' +
    '\n' +
    'window.installVlcAndClose = function() {\n' +
    '    openVlcDownloadPage();\n' +
    '    window.closeVlcModal();\n' +
    '};\n' +
    '\n' +
    'function setQuickApi(url) {\n' +
    '    const input = document.getElementById(\'apiUrlInput\');\n' +
    '    if (input) input.value = url;\n' +
    '}\n' +
    '\n' +
    '// 🎧 TAURI LISTENERS\n' +
    'try {\n' +
    '    listen(\'download-started\', (event) => {\n' +
    '        const { id, title } = event.payload;\n' +
    '        window.activeDownloads[id] = { title, downloaded: 0, total: 0, speed: 0, status: \'downloading\', paused: false };\n' +
    '        if (document.getElementById(\'pageDownloads\')?.classList.contains(\'active\')) {\n' +
    '            renderActiveDownloads();\n' +
    '        }\n' +
    '        setStatus(\'Download started\', \'#22c55e\');\n' +
    '    });\n' +
    '\n' +
    '    listen(\'download-progress\', (event) => {\n' +
    '        const { id, downloaded, total, speed } = event.payload;\n' +
    '        if (window.activeDownloads[id]) {\n' +
    '            window.activeDownloads[id].downloaded = downloaded;\n' +
    '            window.activeDownloads[id].total = total;\n' +
    '            window.activeDownloads[id].speed = speed;\n' +
    '            if (document.getElementById(\'pageDownloads\')?.classList.contains(\'active\')) {\n' +
    '                renderActiveDownloads();\n' +
    '            }\n' +
    '        }\n' +
    '    });\n' +
    '\n' +
    '    listen(\'download-paused\', (event) => {\n' +
    '        const { id } = event.payload;\n' +
    '        if (window.activeDownloads[id]) {\n' +
    '            window.activeDownloads[id].status = \'paused\';\n' +
    '            window.activeDownloads[id].paused = true;\n' +
    '            window.activeDownloads[id].speed = 0;\n' +
    '            if (document.getElementById(\'pageDownloads\')?.classList.contains(\'active\')) {\n' +
    '                renderActiveDownloads();\n' +
    '            }\n' +
    '            setStatus(\'Download paused\', \'#f59e0b\');\n' +
    '        }\n' +
    '    });\n' +
    '\n' +
    '    listen(\'download-resumed\', (event) => {\n' +
    '        const { id } = event.payload;\n' +
    '        if (window.activeDownloads[id]) {\n' +
    '            window.activeDownloads[id].status = \'downloading\';\n' +
    '            window.activeDownloads[id].paused = false;\n' +
    '            if (document.getElementById(\'pageDownloads\')?.classList.contains(\'active\')) {\n' +
    '                renderActiveDownloads();\n' +
    '            }\n' +
    '            setStatus(\'Download resumed\', \'#22c55e\');\n' +
    '        }\n' +
    '    });\n' +
    '\n' +
    '    listen(\'download-finished\', (event) => {\n' +
    '        const { id } = event.payload;\n' +
    '        if (window.activeDownloads[id]) {\n' +
    '            window.activeDownloads[id].status = \'finished\';\n' +
    '            window.activeDownloads[id].paused = false;\n' +
    '            window.activeDownloads[id].downloaded = window.activeDownloads[id].total;\n' +
    '            if (document.getElementById(\'pageDownloads\')?.classList.contains(\'active\')) {\n' +
    '                renderActiveDownloads();\n' +
    '            }\n' +
    '            setTimeout(() => {\n' +
    '                delete window.activeDownloads[id];\n' +
    '                if (document.getElementById(\'pageDownloads\')?.classList.contains(\'active\')) {\n' +
    '                    renderActiveDownloads();\n' +
    '                }\n' +
    '            }, 5000);\n' +
    '            setStatus(\'Download finished!\', \'#22c55e\');\n' +
    '        }\n' +
    '    });\n' +
    '\n' +
    '    listen(\'download-error\', (event) => {\n' +
    '        const { id, error } = event.payload;\n' +
    '        if (window.activeDownloads[id]) {\n' +
    '            window.activeDownloads[id].status = \'error\';\n' +
    '            window.activeDownloads[id].error = error;\n' +
    '            window.activeDownloads[id].speed = 0;\n' +
    '            if (document.getElementById(\'pageDownloads\')?.classList.contains(\'active\')) {\n' +
    '                renderActiveDownloads();\n' +
    '            }\n' +
    '            setStatus(\'Download error\', \'#ef4444\');\n' +
    '        }\n' +
    '    });\n' +
    '\n' +
    '    listen(\'download-cancelled\', (event) => {\n' +
    '        const { id } = event.payload;\n' +
    '        delete window.activeDownloads[id];\n' +
    '        if (document.getElementById(\'pageDownloads\')?.classList.contains(\'active\')) {\n' +
    '            renderActiveDownloads();\n' +
    '        }\n' +
    '        setStatus(\'Download cancelled\', \'#ef4444\');\n' +
    '    });\n' +
    '} catch(e) {\n' +
    '    console.warn(\'Tauri event listeners not initialized\', e);\n' +
    '}\n' +
    '\n' +
    '// 🚀 START — async so the JSON DB is ready before anything reads from it\n' +
    'async function init() {\n' +
    '    await db.init();\n' +
    '\n' +
    '    // Populate variables from persisted settings\n' +
    '    API_BASE = db.get(\'vega_api_url\', \'http://localhost:3001\');\n' +
    '    currentProvider = db.get(\'orbix_last_provider\', \'\');\n' +
    '    tmdbKey = db.get(\'tmdb_api_key\', \'\');\n' +
    '\n' +
    '    initTheme();\n' +
    '    updateWishlistBadge();\n' +
    '    loadProviders();\n' +
    '    setTimeout(() => showNoticeToast(), 1500);\n' +
    '\n' +
    '    // Restore any downloads that were running before the page refreshed\n' +
    '    restoreActiveDownloads();\n' +
    '\n' +
    '    // Populate dl directory input on load\n' +
    '    const savedDir = db.get(\'orbix_download_dir\', \'\');\n' +
    '    if (savedDir) {\n' +
    '        const input = document.getElementById(\'dlDirInput\');\n' +
    '        if (input) input.value = savedDir;\n' +
    '    }\n' +
    '}\n' +
    '\n' +
    'window.startOrbixApp = init;\n' +
    'window.loadHome = loadHome;\n' +
    'window.onCategorySelect = onCategorySelect;\n' +
    'window.loadWishlist = loadWishlist;\n' +
    'window.search = search;\n' +
    'window.toggleSearchMobile = toggleSearchMobile;\n' +
    'window.toggleTheme = toggleTheme;\n' +
    'window.openSettingsModal = openSettingsModal;\n' +
    'window.toggleReadMore = toggleReadMore;\n' +
    'window.backToBrowse = backToBrowse;\n' +
    'window.toggleWishlist = toggleWishlist;\n' +
    'window.openDownloadsModal = openDownloadsModal;\n' +
    'window.refreshDetails = refreshDetails;\n' +
    'window.switchDetailTab = switchDetailTab;\n' +
    'window.closeDownloadModal = closeDownloadModal;\n' +
    'window.closeSettingsModal = closeSettingsModal;\n' +
    'window.saveSettings = saveSettings;\n' +
    'window.playStream = playStream;\n' +
    'window.switchToProvider = switchToProvider;\n' +
    'window.refreshWishlistData = refreshWishlistData;\n' +
    'window.selectDownloadDirectory = selectDownloadDirectory;\n' +
    'window.clearDownloadDirectory = clearDownloadDirectory;\n' +
    'window.openVlcDownloadPage = openVlcDownloadPage;\n' +
    'window.setQuickApi = setQuickApi;\n' +
    'window.openInfoModal = openInfoModal;\n' +
    'window.closeInfoModal = closeInfoModal;\n' +
    'window.switchInfoTab = switchInfoTab;\n' +
    'window.handleContactSubmit = handleContactSubmit;\n' +
    'window.shareDetails = shareDetails;\n' +
    'window.toggleSeasonDropdown = toggleSeasonDropdown;\n';

const imports = "import { invoke } from '@tauri-apps/api/core';\n" +
    "import { listen } from '@tauri-apps/api/event';\n" +
    "import { open } from '@tauri-apps/plugin-dialog';\n" +
    "import db from './db.js';\n\n";

const finalAppJs = imports + webApp + tauriBlocks;
fs.writeFileSync('desktop-app/src/app.js', finalAppJs, 'utf8');
console.log("- Successfully merged desktop-app/src/app.js");

console.log("\nALL FILES SUCESSFULLY MERGED!");
