// Storage Manager - Centralized data persistence
class StorageManager {
    constructor() {
        this.storageKey = 'nativeBrowser';
        this.data = this.load();
    }

    load() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            return stored ? JSON.parse(stored) : this.getDefaultData();
        } catch (e) {
            console.error('Failed to load storage:', e);
            return this.getDefaultData();
        }
    }

    getDefaultData() {
        return {
            version: '1.0',
            bookmarks: [],
            history: [],
            settings: {
                homepage: 'https://www.google.com',
                searchEngine: 'google',
                customSearchUrl: '',
                theme: 'dark',
                adBlockEnabled: true,
                proxyEnabled: false,
                proxyUrl: '',
                privacyMode: false,
                memorySaver: true,
                smartLimit: true,
                suspendTime: '5',
                maxRam: 0
            },
            downloads: []
        };
    }

    save() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.data));
            return true;
        } catch (e) {
            console.error('Failed to save storage:', e);
            return false;
        }
    }

    // Bookmarks
    getBookmarks() {
        return this.data.bookmarks || [];
    }

    addBookmark(bookmark) {
        if (!this.data.bookmarks) this.data.bookmarks = [];
        bookmark.id = Date.now();
        bookmark.createdAt = new Date().toISOString();
        this.data.bookmarks.push(bookmark);
        this.save();
        return bookmark;
    }

    removeBookmark(id) {
        this.data.bookmarks = this.data.bookmarks.filter(b => b.id !== id);
        this.save();
    }

    updateBookmark(id, updates) {
        const bookmark = this.data.bookmarks.find(b => b.id === id);
        if (bookmark) {
            Object.assign(bookmark, updates);
            this.save();
        }
    }

    // History
    getHistory(limit = 100) {
        return (this.data.history || []).slice(0, limit);
    }

    addHistory(entry) {
        if (!this.data.history) this.data.history = [];
        entry.id = Date.now();
        entry.visitedAt = new Date().toISOString();
        this.data.history.unshift(entry);

        // Keep only last 1000 entries
        if (this.data.history.length > 1000) {
            this.data.history = this.data.history.slice(0, 1000);
        }
        this.save();
    }

    searchHistory(query) {
        const q = query.toLowerCase();
        return this.data.history.filter(h =>
            h.title.toLowerCase().includes(q) ||
            h.url.toLowerCase().includes(q)
        );
    }

    clearHistory() {
        this.data.history = [];
        this.save();
    }

    // Settings
    getSettings() {
        return this.data.settings || this.getDefaultData().settings;
    }

    updateSettings(updates) {
        this.data.settings = { ...this.data.settings, ...updates };
        this.save();
    }

    getSetting(key) {
        return this.data.settings[key];
    }

    // Downloads
    getDownloads() {
        return this.data.downloads || [];
    }

    addDownload(download) {
        if (!this.data.downloads) this.data.downloads = [];
        download.id = Date.now();
        download.startedAt = new Date().toISOString();
        this.data.downloads.unshift(download);
        this.save();
        return download;
    }

    updateDownload(id, updates) {
        const download = this.data.downloads.find(d => d.id === id);
        if (download) {
            Object.assign(download, updates);
            this.save();
        }
    }

    // Export/Import
    exportData() {
        return JSON.stringify(this.data, null, 2);
    }

    importData(jsonString) {
        try {
            const imported = JSON.parse(jsonString);
            this.data = { ...this.getDefaultData(), ...imported };
            this.save();
            return true;
        } catch (e) {
            console.error('Failed to import data:', e);
            return false;
        }
    }
}

// Ad Blocker - Filter-based blocking
class AdBlocker {
    constructor() {
        this.enabled = true;
        this.filters = [];
        this.loadDefaultFilters();
    }

    loadDefaultFilters() {
        // Common ad domains and patterns
        this.filters = [
            // Ad networks
            'doubleclick.net',
            'googlesyndication.com',
            'googleadservices.com',
            'google-analytics.com',
            'googletagmanager.com',
            'facebook.com/tr',
            'facebook.net',
            'scorecardresearch.com',
            'outbrain.com',
            'taboola.com',
            'ads.yahoo.com',
            'advertising.com',
            'adnxs.com',
            'adsystem.com',
            // Trackers
            'hotjar.com',
            'mouseflow.com',
            'crazyegg.com',
            'mixpanel.com',
            // Common ad patterns
            '/ads/',
            '/advert',
            '/banner',
            '/popup',
            '/tracking'
        ];
    }

    shouldBlock(url) {
        if (!this.enabled) return false;

        const urlLower = url.toLowerCase();
        return this.filters.some(filter => urlLower.includes(filter));
    }

    setEnabled(enabled) {
        this.enabled = enabled;
    }

    addFilter(filter) {
        this.filters.push(filter);
    }

    getBlockedCount() {
        return this.blockedCount || 0;
    }

    incrementBlocked() {
        this.blockedCount = (this.blockedCount || 0) + 1;
    }
}

// Export for use in renderer
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { StorageManager, AdBlocker };
}
