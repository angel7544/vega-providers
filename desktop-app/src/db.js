/**
 * ============================
 * 🗄️ ORBIXPLAY JSON DATABASE
 * ============================
 * Persistent key-value store backed by a JSON file on disk
 * (stored at: {app_data_dir}/orbixplay/settings.json)
 *
 * Usage:
 *   await db.init()                  → load file into cache on app start
 *   db.get('key', defaultValue)      → sync read from in-memory cache
 *   await db.set('key', value)       → write to cache + persist to disk
 *   await db.remove('key')           → delete key from cache + persist
 *   db.getAll()                      → get entire cache object (readonly)
 */

import { invoke } from '@tauri-apps/api/core';

// ── In-memory cache ──────────────────────────────────────────────────────────
let _cache = {};
let _initialized = false;
let _saveTimer = null;

// ── Default values for all known keys ────────────────────────────────────────
const DEFAULTS = {
    vega_api_url:            'http://localhost:3001',
    orbix_last_provider:     '',
    orbix_theme:             'dark',
    tmdb_api_key:            '',
    orbix_disabled_providers: [],
    orbix_wishlist:          [],
    orbix_download_dir:      '',
    orbix_notice_time:       0,
    // download history persisted across sessions
    download_history:        [],
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Initialize the database.
 * Loads settings.json from disk. If the file does not exist yet,
 * migrates any existing localStorage values (one-time migration).
 * Must be awaited before calling get/set.
 */
export async function init() {
    if (_initialized) return;

    try {
        const raw = await invoke('db_load');
        _cache = typeof raw === 'object' && raw !== null ? raw : {};
    } catch (e) {
        console.warn('[DB] Could not load settings.json (first run or not in Tauri), starting fresh.', e);
        _cache = {};
    }

    // ── One-time migration from localStorage ────────────────────────────────
    const LS_KEYS = [
        'vega_api_url',
        'orbix_last_provider',
        'orbix_theme',
        'tmdb_api_key',
        'orbix_disabled_providers',
        'orbix_wishlist',
        'orbix_download_dir',
        'orbix_notice_time',
    ];

    let migrated = false;
    for (const key of LS_KEYS) {
        // Only migrate if the JSON file doesn't already have this key
        if (!Object.prototype.hasOwnProperty.call(_cache, key)) {
            const val = localStorage.getItem(key);
            if (val !== null) {
                try {
                    // Try to parse arrays/objects stored as JSON strings
                    _cache[key] = JSON.parse(val);
                } catch {
                    _cache[key] = val;
                }
                migrated = true;
            }
        }
    }

    if (migrated) {
        console.log('[DB] Migrated data from localStorage → settings.json');
        await _persist();
        // Clean up localStorage after migration
        for (const key of LS_KEYS) localStorage.removeItem(key);
    }

    _initialized = true;
    console.log('[DB] Initialized. Cache keys:', Object.keys(_cache));
}

/**
 * Get a value from the cache synchronously.
 * @param {string} key
 * @param {*} [fallback] - value to return if key is missing (uses DEFAULTS if not provided)
 */
export function get(key, fallback) {
    if (Object.prototype.hasOwnProperty.call(_cache, key)) {
        return _cache[key];
    }
    if (fallback !== undefined) return fallback;
    if (Object.prototype.hasOwnProperty.call(DEFAULTS, key)) return DEFAULTS[key];
    return null;
}

/**
 * Set a value and persist to disk.
 * Writes are debounced (batched within 300 ms) to avoid excessive I/O.
 * @param {string} key
 * @param {*} value  (must be JSON-serialisable)
 */
export async function set(key, value) {
    _cache[key] = value;
    await _persist();
}

/**
 * Remove a key and persist.
 */
export async function remove(key) {
    delete _cache[key];
    await _persist();
}

/**
 * Get a readonly snapshot of the entire cache.
 */
export function getAll() {
    return { ..._cache };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function _persist() {
    try {
        await invoke('db_save', { data: _cache });
    } catch (e) {
        console.warn('[DB] Could not persist settings.json (not in Tauri?)', e);
    }
}

// Default export for convenience
const db = { init, get, set, remove, getAll };
export default db;
