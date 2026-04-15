/* ═══════════════════════════════════════════════════════
   ORBIX PLAY — app.js
   All UI logic for the pywebview-based frontend.
   Python is called via: await window.pywebview.api.<method>(args)
   ═══════════════════════════════════════════════════════ */

// ─── State ────────────────────────────────────────────
const S = {
  provider: null,
      meta: null, 
  itemType: 'movie',
  settings: {},
  continueWatching: []
};

// ─── Pywebview API shim ───────────────────────────────
// pywebview injects window.pywebview.api once the bridge is ready.
function api() { return window.pywebview.api; }

// ─── Init ─────────────────────────────────────────────
window.addEventListener('pywebviewready', async () => {
  updateStatus('fetching', 'Connecting…');
  S.settings = await api().get_settings() || {};
  
  const urlInput = document.getElementById('server-url-input');
  if (urlInput) urlInput.value = S.settings.server_url || 'http://localhost:3001';
  
  // Load history from JSON file
  S.continueWatching = await api().get_history() || [];

  showSkeletons(16);
  const providers = await api().get_providers();

  if (!providers || providers.length === 0) {
    updateStatus('error', 'Server Offline');
    showToast('⚠️ Could not connect to provider server');
    document.getElementById('card-grid').innerHTML =
      '<p style="color:var(--amber);padding:20px">Server offline — start your provider backend and restart.</p>';
    return;
  }

  buildProviderDropdown(providers, S.settings.last_provider);
  
  updateStatus('online', 'Online');
  checkFfmpegStatus();
  await loadHome();
});

// ─── Provider Dropdown ───────────────────────────────
function buildProviderDropdown(providers, lastValue) {
  const sel = document.getElementById('provider-select');
  sel.innerHTML = '';
  providers.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.value;
    opt.textContent = p.display_name;
    if (p.value === lastValue) opt.selected = true;
    sel.appendChild(opt);
  });
  S.provider = sel.value;
}

async function onProviderChange() {
  S.provider = document.getElementById('provider-select').value;
  await api().save_settings({ last_provider: S.provider });
  await loadHome();
}

// ─── Navigation ───────────────────────────────────────
function setPage(pageId, navId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
  if (navId) document.getElementById(navId).classList.add('active');
}

function navHome()     { setPage('page-home', 'btn-home'); loadHome(); }
function navTrending() { setPage('page-home', 'btn-trending'); fetchMedia('trending', false); }
function navContinue() { setPage('page-continue', 'btn-continue'); renderContinueWatching(); }
function navSettings() { setPage('page-settings', 'btn-settings'); }
function goBack()      {
  if (document.getElementById('page-detail').classList.contains('active')) {
    setPage('page-home', 'btn-home'); 
  } else {
    setPage('page-home', 'btn-home');
  }
}

function setDetailTab(tabId, btn) {
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${tabId}`).classList.add('active');
  btn.classList.add('active');
}

// ─── Search ───────────────────────────────────────────
function doSearch() {
  const q = document.getElementById('search-input').value.trim();
  if (!q) return;
  setPage('page-home', 'btn-home');
  fetchMedia(q, true);
}

// ─── Home / Media ─────────────────────────────────────
async function loadHome() { await fetchMedia('', false); }

async function fetchMedia(filter, isSearch) {
  updateStatus('fetching', 'Fetching…');
  showSkeletons(16);
  try {
    const data = await api().fetch_media(S.provider, filter, 1, isSearch);
    renderCards(data || []);
    updateStatus('online', 'Online');
  } catch (e) {
    console.error(e);
    updateStatus('error', 'Fetch Failed');
    showToast('❌ Failed to fetch media');
  }
}

// ─── Skeleton Loaders ────────────────────────────────
function showSkeletons(n) {
  const grid = document.getElementById('card-grid');
  grid.innerHTML = Array.from({ length: n }, () =>
    `<div class="skeleton-card">
       <div class="skeleton-poster"></div>
       <div class="skeleton-title"></div>
     </div>`
  ).join('');
}

// ─── Card Rendering ───────────────────────────────────
function renderCards(data, containerId = 'card-grid', isLandscape = false) {
  const grid = document.getElementById(containerId);
  grid.innerHTML = '';
  if (!data.length) {
    grid.innerHTML = '<p style="color:var(--txt-2);padding:20px">No results found.</p>';
    return;
  }

  if (isLandscape) grid.classList.add('landscape');
  else grid.classList.remove('landscape');

  // Batch render: 8 cards per frame to keep UI snappy
  function batch(start) {
    const end = Math.min(start + 8, data.length);
    for (let i = start; i < end; i++) {
      const item = data[i];
      const cleanT = cleanTitle(item.title || 'Unknown');
      const displayT = cleanT.length > 30 ? cleanT.slice(0, 27) + '…' : cleanT;

      const card = document.createElement('div');
      card.className = `media-card ${isLandscape ? 'landscape' : ''}`;
      card.style.animationDelay = `${(i % 8) * 30}ms`;
      
      let progressHtml = '';
      if (item.progress && item.progress > 5) {
        progressHtml = `<div class="card-progress-wrap"><div class="card-progress-fill" style="width:${item.progress}%"></div></div>`;
      }

      const imgSrc = (isLandscape && item.backdrop) ? item.backdrop : (item.image || '');

      card.innerHTML = `
        <img class="card-poster" src="${escHtml(imgSrc)}"
             alt="${escHtml(displayT)}" loading="lazy"
             onerror="this.style.display='none'" />
        ${progressHtml}
        <div class="card-title">${escHtml(displayT)}</div>`;
      card.addEventListener('click', () => {
        openDetail(item.link, item);
      });
      grid.appendChild(card);
    }
    if (end < data.length) requestAnimationFrame(() => batch(end));
  }
  batch(0);
}

// ─── Detail View ──────────────────────────────────────
async function openDetail(link, fallback = {}) {
  const provider = fallback.provider || S.provider;
  
  // If clicking from Continue Watching with a different provider, switch active state
  if (fallback.provider && fallback.provider !== S.provider) {
    console.log(`[JS] Switching provider from ${S.provider} to ${provider}`);
    S.provider = provider;
    const sel = document.getElementById('provider-select');
    if (sel) sel.value = provider;
  }

  updateStatus('fetching', 'Loading…');
  let meta = await api().get_meta(S.provider, link);
  
  if (!meta || (!meta.title && !fallback.title)) {
    updateStatus('error', 'Meta Error');
    showToast('❌ Failed to load metadata');
    return;
  }

  // Merge fallback info (from search card) with the fetched metadata
  meta = { 
    title: fallback.title || '', 
    image: fallback.image || '', 
    type: fallback.type || 'movie',
    ...meta 
  };
  
  S.meta = meta;
  const t = (meta.type || 'movie').toLowerCase();
  S.itemType = (t === 'series' || t === 'tv') ? 'series' : 'movie';
  
  renderDetail(meta);
  setPage('page-detail', null);
  updateStatus('online', 'Online');
}

function renderDetail(info) {
  const cleanT = cleanTitle(info.title || '');

  // Hero Background (Blurry Poster)
  const hero = document.getElementById('detail-hero');
  if (info.image) hero.style.backgroundImage = `url(${info.image})`;
  
  const poster = document.getElementById('detail-poster');
  poster.src = info.image || '';
  poster.onerror = () => { poster.style.display = 'none'; };

  // Text fields
  document.getElementById('detail-title').textContent = cleanT;

  let sub = info.subtitle || '';
  if (!sub) {
    const year = info.year || info.releaseDate || '';
    const typ  = (info.type || 'Movie').charAt(0).toUpperCase() + (info.type || 'movie').slice(1);
    sub = year ? `${typ} · ${year}` : typ;
  }
  document.getElementById('detail-subtitle').textContent = sub;
  
  // Storyline
  document.getElementById('detail-storyline').textContent = info.synopsis || info.description || "No storyline available for this title.";

  // Meta Stats
  document.getElementById('detail-lang').textContent = info.language || "Hindi / English";
  const ratingText = info.maturity_rating || "U/A 13+";
  document.getElementById('detail-maturity').textContent = ratingText;
  document.getElementById('detail-released').textContent = info.year || info.releaseDate || "2024";

  // IMDb
  document.getElementById('imdb-rating').textContent = `⭐ ${info.rating || 'N/A'}`;
  document.getElementById('imdb-votes').textContent = '👥 N/A';

  // Team
  document.getElementById('detail-cast').textContent = (info.cast && info.cast.length) ? info.cast.join(', ') : "Original Cast";
  document.getElementById('detail-director').textContent = info.director || "Production Team";

  // Genres
  const genContainer = document.getElementById('detail-genres');
  genContainer.innerHTML = '';
  const tags = info.genres || info.tags || (info.tagsText ? info.tagsText.split('·') : ['Action', 'Drama', 'Premium']);
  tags.forEach(t => {
    const span = document.createElement('span');
    span.className = 'genre-tag';
    span.textContent = t.trim();
    genContainer.appendChild(span);
  });

  // Gallery - Only show if images exist
  const galleryGrid = document.getElementById('gallery-grid');
  const galleryTabBtn = document.getElementById('tab-btn-gallery');
  galleryGrid.innerHTML = '';
  
  const screenshots = info.screenshots || info.thumbnails || info.gallery || [];
  if (screenshots.length > 0) {
    galleryTabBtn.style.display = 'block';
    screenshots.forEach(src => {
      const div = document.createElement('div');
      div.className = 'gallery-item';
      div.innerHTML = `<img src="${src}" loading="lazy" onerror="this.parentElement.style.display='none'" />`;
      galleryGrid.appendChild(div);
    });
  } else {
    galleryTabBtn.style.display = 'none';
  }

  // Right panel (Links)
  renderLinkList(info);
  
  // Default to Details tab
  setDetailTab('details', document.getElementById('tab-btn-details'));
}

// ─── Episode Discovery ────────────────────────────────
function discoverEpisodes(info) {
  // Try common keys used by different providers
  let eps = info.episodes || info.seasons || info.chapters || info.series_list || info.episode_list || [];
  
  // If seasons is an object/array, flatten it
  if (!Array.isArray(eps) && typeof eps === 'object') {
    // If it's { "Season 1": [...], "Season 2": [...] }
    let flattened = [];
    for (const sName in eps) {
      if (Array.isArray(eps[sName])) {
        eps[sName].forEach(e => flattened.push({ ...e, title: `${sName} - ${e.title || 'Episode'}` }));
      }
    }
    return flattened;
  }
  
  // If it's an array of seasons: [{ season: 1, episodes: [...] }, ...]
  if (Array.isArray(eps) && eps.length > 0 && eps[0].episodes) {
    let flattened = [];
    eps.forEach(s => {
      const sPrefix = s.season ? `S${s.season.toString().padStart(2, '0')}` : 'Season';
      if (Array.isArray(s.episodes)) {
        s.episodes.forEach(e => flattened.push({ ...e, title: `${sPrefix} - ${e.title || 'Episode'}` }));
      }
    });
    return flattened;
  }

  return Array.isArray(eps) ? eps : [];
}

function renderLinkList(info) {
  const isSeries = S.itemType === 'series';
  const list = info.linkList || [];
  const container = document.getElementById('link-list');
  container.innerHTML = '';
  document.getElementById('detail-right-title').textContent = 
    isSeries ? 'Episodes / Seasons' : 'Select Quality';

  // 1. Check if we have discovered episodes directly in the meta
  const discEps = discoverEpisodes(info);
  if (isSeries && discEps.length > 0) {
    const epWrap = document.createElement('div');
    epWrap.className = 'link-group';
    const epsJson = JSON.stringify(discEps).replace(/"/g, '&quot;');
    epWrap.innerHTML = `<div class="link-group-title">Found ${discEps.length} episodes</div>
      <div class="btn-row">
        <button class="action-btn" onclick='renderEpisodes(${epsJson})'>Show Episodes</button>
      </div>`;
    container.appendChild(epWrap);
  }

  if (!list.length && discEps.length === 0) {
    container.innerHTML = '<p style="color:var(--amber);padding:12px">No links found.</p>';
    return;
  }

  list.forEach(group => {
    const gTitle = (group.title || 'Download') + (group.size ? ` [${group.size}]` : '');
    const g = document.createElement('div');
    g.className = 'link-group';

    // If it's a series and we have an explicit episodesLink
    if (isSeries && group.episodesLink) {
      const elJson = JSON.stringify(group.episodesLink).replace(/"/g, '&quot;');
      g.innerHTML = `
        <div class="link-group-title">${escHtml(gTitle)}</div>
        <div class="btn-row">
          <button class="action-btn" onclick='loadEpisodes(${elJson})'>
            View Episodes
          </button>
        </div>`;
    } else {
      // Direct stream links in a group
      const dlinks = group.directLinks || group.direct_links || [];
      if (dlinks.length === 1) {
        const dl = dlinks[0];
        g.innerHTML = `<div class="link-group-title">${escHtml(gTitle)}</div>
          <div class="btn-row">${playBtns(dl.link, dl.title || cleanTitle(S.meta.title || ''))}</div>`;
      } else if (dlinks.length > 1) {
        g.innerHTML = `<div class="link-group-title">${escHtml(gTitle)}` + (isSeries ? ' (Multi-Link)' : '') + `</div>
          ${dlinks.map((dl, idx) => {
            const lj = JSON.stringify(dl.link).replace(/"/g, '&quot;');
            return `
            <div class="link-row">
              <span class="link-row-title" onclick='callPlay(${lj})'>${escHtml(dl.title || `Link ${idx + 1}`)}</span>
              <div class="btn-row" style="flex-shrink:0">${iconBtns(dl.link, dl.title || '')}</div>
            </div>`;
          }).join('')}`;
      } else if (!isSeries) {
         // Fallback for groups with just a link on the group itself if some providers do that
         if (group.link) {
            g.innerHTML = `<div class="link-group-title">${escHtml(gTitle)}</div>
              <div class="btn-row">${playBtns(group.link, gTitle)}</div>`;
         }
      }
    }
    container.appendChild(g);
  });
}

function playBtns(link, title) {
  const lj = JSON.stringify(link).replace(/"/g, '&quot;');
  const tj = JSON.stringify(title).replace(/"/g, '&quot;');
  return `
    <button class="action-btn" onclick='callPlay(${lj})'>▶ App</button>
    <button class="action-btn" onclick='callBrowser(${lj},${tj})'>🌐 Web</button>
    <button class="action-btn" onclick='callVlc(${lj})'>🧡 VLC</button>
    <button class="action-btn icon-only" title="Copy link" onclick='callCopy(${lj})'>📋</button>`;
}

function iconBtns(link, title) {
  const lj = JSON.stringify(link).replace(/"/g, '&quot;');
  const tj = JSON.stringify(title).replace(/"/g, '&quot;');
  return `
    <button class="action-btn icon-only" onclick='callPlay(${lj})' title="Play in App">▶</button>
    <button class="action-btn icon-only" onclick='callBrowser(${lj},${tj})' title="Browser">🌐</button>
    <button class="action-btn icon-only" onclick='callVlc(${lj})' title="VLC">🧡</button>
    <button class="action-btn icon-only" onclick='callCopy(${lj})' title="Copy">📋</button>`;
}

// ─── Episodes ─────────────────────────────────────────
async function loadEpisodes(urlData) {
  let url = urlData;
  // Handle escaped JSON string if passed from onclick
  if (typeof url === 'string' && url.includes('{')) {
    try { url = JSON.parse(url); } catch(e) {}
  }
  
  console.log("[JS] loadEpisodes ->", url);
  updateStatus('fetching', 'Fetching episodes…');
  let eps = [];
  try {
    eps = await api().get_episodes(S.provider, url);
  } catch (e) {
    console.error("Episode API failed:", e);
  }

  // Fallback: Check if episodes are already in S.meta if API failed
  if (!eps || eps.length === 0) {
    console.log("No episodes from API, checking meta fallback...");
    eps = discoverEpisodes(S.meta);
  }

  updateStatus('online', 'Online');
  if (!eps || eps.length === 0) {
    showToast('❌ No episodes found for this link');
  } else {
    renderEpisodes(eps);
  }
}

function renderEpisodes(epData) {
  let episodes = epData;
  if (typeof episodes === 'string' && episodes.includes('[')) {
    try { episodes = JSON.parse(episodes); } catch(e) {}
  }
  console.log("[JS] renderEpisodes count:", episodes.length);
  const container = document.getElementById('link-list');
  const title = document.getElementById('detail-right-title');
  title.textContent = 'Episodes';

  // Back button
  const backBtn = document.createElement('button');
  backBtn.className = 'action-btn';
  backBtn.style.marginBottom = '12px';
  backBtn.textContent = '← Back to Qualities';
  backBtn.onclick = () => renderLinkList(S.meta);
  container.innerHTML = '';
  container.appendChild(backBtn);

  episodes.forEach((ep, i) => {
    const row = document.createElement('div');
    row.className = 'episode-row';
    const lj = JSON.stringify(ep.link).replace(/"/g, '&quot;');
    row.innerHTML = `
      <button class="ep-title-btn" onclick='callPlay(${lj})'>
        ${escHtml(ep.title || `Episode ${i + 1}`)}
      </button>
      <div class="btn-row" style="flex-shrink:0">
        ${iconBtns(ep.link, ep.title || '')}
      </div>`;
    container.appendChild(row);
  });
}

// ─── Action Wrappers ─────────────────────────────────
async function callPlay(linkData) {
  let link = linkData;
  if (typeof link === 'string' && link.startsWith('"')) {
    try { link = JSON.parse(link); } catch(e) {}
  }
  console.log("[JS] callPlay ->", link);
  
  // Track Continue Watching
  await addToContinueWatching(S.meta, S.provider, link, 0);

  updateStatus('fetching', 'Extracting stream…');
  const res = await api().play_app(S.provider, link, S.itemType, S.meta?.title || '', 0);
  updateStatus('online', 'Online');
  if (res.error) showToast(`❌ ${res.error}`);
  else showToast('▶ Launching player…');
}

async function callVlc(linkData) {
  let link = linkData;
  if (typeof link === 'string' && link.startsWith('"')) {
    try { link = JSON.parse(link); } catch(e) {}
  }
  console.log("[JS] callVlc ->", link);
  await addToContinueWatching(S.meta, S.provider, link, 0);
  
  updateStatus('fetching', 'Opening VLC…');
  const res = await api().play_vlc(S.provider, link, S.itemType);
  updateStatus('online', 'Online');
  if (res.error) showToast(`❌ ${res.error}`);
  else showToast('🧡 Playing in VLC');
}

async function callBrowser(linkData, titleData) {
  let link = linkData;
  if (typeof link === 'string' && link.startsWith('"')) {
    try { link = JSON.parse(link); } catch(e) {}
  }
  let title = titleData;
  if (typeof title === 'string' && title.startsWith('"')) {
    try { title = JSON.parse(title); } catch(e) {}
  }
  console.log("[JS] callBrowser ->", title);
  await addToContinueWatching(S.meta, link);

  updateStatus('fetching', 'Opening browser player…');
  const res = await api().open_browser(S.provider, link, S.itemType, title);
  updateStatus('online', 'Online');
  if (res.error) showToast(`❌ ${res.error}`);
  else showToast('🌐 Opened in browser');
}

// ─── Continue Watching Logic ─────────────────────────
async function addToContinueWatching(meta, link, time = 0) {
  if (!meta) return;
  
  const title = meta.title || "Unknown Title";

  const item = {
    title: title,
    link: meta.link || link,
    playbackLink: link,
    image: meta.image || "",
    type: meta.type || S.itemType,
    provider: S.provider,
    time: time,
    duration: 0,
    progress: (time > 0) ? 10 : 0, 
    timestamp: Date.now(),
    isContinue: true
  };

  // Remove existing entry for same title
  S.continueWatching = S.continueWatching.filter(i => i.title !== item.title);
  // Add to start
  S.continueWatching.unshift(item);
  
  // Persist to JSON file
  api().save_history(S.continueWatching);
}

function getResumeTime(link) {
  const found = S.continueWatching.find(i => i.playbackLink === link || i.link === link);
  return found ? found.time : 0;
}

function renderContinueWatching() {
  // Always sort by timestamp before rendering
  const sorted = [...S.continueWatching].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  renderCards(sorted, 'continue-grid', false); // No landscape anymore without TMDB
}

function clearContinueWatching() {
  if (confirm("Clear all watch history?")) {
    S.continueWatching = [];
    api().save_history([]);
    renderContinueWatching();
    showToast("✨ History cleared");
  }
}

// Called from Python to update progress
function onPlayerProgress(link, time, duration) {
  const item = S.continueWatching.find(i => i.playbackLink === link || i.link === link);
  if (item) {
    item.time = time;
    item.duration = duration;
    item.timestamp = Date.now(); // Move to top of recents
    if (duration > 0) {
      item.progress = Math.min(100, Math.floor((time / duration) * 100));
    }
    
    // Periodically save progress to JSON (every ~2s call from Python player)
    api().save_history(S.continueWatching);

    // Refresh only if active
    const contPg = document.getElementById('page-continue');
    if (contPg && contPg.classList.contains('active')) {
      renderContinueWatching();
    }
  }
}

async function callCopy(linkData) {
  let link = linkData;
  if (typeof link === 'string' && link.startsWith('"')) {
    try { link = JSON.parse(link); } catch(e) {}
  }
  console.log("[JS] callCopy ->", link);
  updateStatus('fetching', 'Copying link…');
  const res = await api().copy_link(S.provider, link, S.itemType);
  updateStatus('online', 'Online');
  if (res.error) showToast(`❌ ${res.error}`);
  else showToast('📋 Link copied!');
}

// ─── Settings Actions ────────────────────────────────
async function saveServerUrl() {
  const url = document.getElementById('server-url-input').value.trim();
  if (!url) return;
  await api().save_settings({ server_url: url });
  showToast('✅ Saved — reconnecting…');
  updateStatus('fetching', 'Reconnecting…');
  const providers = await api().get_providers();
  if (providers && providers.length) {
    buildProviderDropdown(providers, S.settings.last_provider);
    updateStatus('online', 'Online');
    showToast('✅ Reconnected');
  } else {
    updateStatus('error', 'Server Offline');
    showToast('⚠️ Server still offline');
  }
}

async function checkFfmpegStatus() {
  const ok = await api().check_ffmpeg();
  const lbl = document.getElementById('ffmpeg-status');
  const btn = document.getElementById('ffmpeg-btn');
  if (ok) {
    lbl.textContent = 'FFmpeg: Installed ✅';
    lbl.style.color = 'var(--green)';
    btn.disabled = true;
    btn.textContent = 'Installed';
  } else {
    lbl.textContent = 'FFmpeg: Not Found ❌';
    lbl.style.color = 'var(--red)';
  }
}

async function runInstallFfmpeg() {
  const btn = document.getElementById('ffmpeg-btn');
  btn.disabled = true;
  btn.textContent = 'Installing…';
  document.getElementById('ffmpeg-progress-wrap').style.display = 'block';
  await api().install_ffmpeg();
}

// Called from Python via evaluate_js
function onFfmpegProgress(stage, percent) {
  const bar = document.getElementById('ffmpeg-progress-bar');
  const txt = document.getElementById('ffmpeg-progress-text');
  const btn = document.getElementById('ffmpeg-btn');
  const lbl = document.getElementById('ffmpeg-status');
  if (!bar) return;

  const labels = {
    connecting:  'Connecting to server…',
    downloading: `Downloading FFmpeg… ${percent}%`,
    extracting:  'Extracting files…',
    done:        'FFmpeg installed! ✅',
    error:       'Installation failed ❌'
  };
  bar.style.width = percent + '%';
  txt.textContent = labels[stage] || stage;

  if (stage === 'done') {
    lbl.textContent = 'FFmpeg: Installed ✅';
    lbl.style.color = 'var(--green)';
    btn.textContent = 'Installed';
    showToast('✅ FFmpeg installed successfully!');
  } else if (stage === 'error') {
    btn.disabled = false;
    btn.textContent = 'Retry Install';
    showToast('❌ FFmpeg installation failed');
  }
}

// ─── External Links ───────────────────────────────────

// ─── Utility ──────────────────────────────────────────
function updateStatus(type, text) {
  const dot  = document.getElementById('status-dot');
  const span = document.getElementById('status-text');
  dot.className  = `status-dot ${type}`;
  span.textContent = text;
}

let _toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

function cleanTitle(raw) {
  let t = raw.replace(/^Download\s+/i, '');
  const m = t.match(/(\s\(\d{4}\)|\sSeason\s\d+|\sS\d+E\d+|\s720p|\s1080p|\s2160p|\s4K|\sWEB-DL|\sHDRip|\.mkv|\.mp4|\.avi|\.webm|\[)/i);
  if (m) t = t.slice(0, m.index);
  return t.replace(/[\s\-:|]+$/, '').trim();
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Native App Feel ──────────────────────────────────
// Disable right-click to hide browser context menu
  window.addEventListener('contextmenu', e => e.preventDefault());
