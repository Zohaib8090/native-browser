// Tab Management
const DEFAULT_URL = 'https://www.google.com';
let tabs = [];
let activeTabId = null;
let tabIdCounter = 0;

// Initialize Storage and Ad Blocker
const storage = new StorageManager();
const adBlocker = new AdBlocker();
adBlocker.setEnabled(storage.getSetting('adBlockEnabled'));

// DOM Elements
const tabsContainer = document.getElementById('tabsContainer');
const contentArea = document.getElementById('contentArea');
const newTabBtn = document.getElementById('newTabBtn');
const addressBar = document.getElementById('addressBar');
const backBtn = document.getElementById('backBtn');
const forwardBtn = document.getElementById('forwardBtn');
const refreshBtn = document.getElementById('refreshBtn');
const homeBtn = document.getElementById('homeBtn');
const bookmarkBtn = document.getElementById('bookmarkBtn');
const minimizeBtn = document.getElementById('minimizeBtn');
const maximizeBtn = document.getElementById('maximizeBtn');
const closeBtn = document.getElementById('closeBtn');
const focusModeBtn = document.getElementById('focusModeBtn');

// Sidebar & Panels
const bookmarksSidebar = document.getElementById('bookmarksSidebar');
const historySidebar = document.getElementById('historySidebar');
const downloadsPanel = document.getElementById('downloadsPanel');
const settingsModal = document.getElementById('settingsModal');
const contextMenu = document.getElementById('contextMenu');

// Lists
const bookmarksList = document.getElementById('bookmarksList');
const historyList = document.getElementById('historyList');
const downloadsList = document.getElementById('downloadsList');

// Close Buttons
// Helper to safely bind click events
function bindClick(id, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', handler);
}

// Menu Actions (Bound in DOMContentLoaded to ensure elements exist)
function setupMenuActions() {
    // Menu Dropdown Logic
    const menuItems = document.querySelectorAll('.menu-item');
    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            closeAllMenus();
            item.classList.toggle('active');
        });
    });
    document.addEventListener('click', closeAllMenus);

    bindClick('closeBookmarks', () => toggleSidebar('bookmarks'));
    bindClick('closeHistory', () => toggleSidebar('history'));
    bindClick('closeDownloads', () => togglePanel('downloads'));
    bindClick('closeSettings', () => toggleModal('settings'));

    bindClick('menuNewWindow', () => window.electronAPI.createNewWindow());
    bindClick('menuNewIncognito', () => window.electronAPI.createIncognitoWindow());
    bindClick('menuNewTab', () => createTab());
    bindClick('menuNewIncognitoTab', () => createTab(DEFAULT_URL, { incognito: true }));
    bindClick('menuSettings', () => toggleModal('settings'));
    bindClick('menuBookmarks', () => toggleSidebar('bookmarks'));
    bindClick('menuHistory', () => toggleSidebar('history'));
    bindClick('menuDownloads', () => togglePanel('downloads'));
    bindClick('menuDevTools', () => {
        const tab = tabs.find(t => t.id === activeTabId);
        if (tab) tab.webview.openDevTools();
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupMenuActions();
    // Check Incognito Mode
    // Check Incognito Mode
    const urlParams = new URLSearchParams(window.location.search);
    const isIncognito = urlParams.get('incognito') === 'true';

    if (isIncognito) {
        document.body.classList.add('incognito-mode');
        // Force settings
        storage.getSettings().privacyMode = true; // Use ephemeral sessions
        storage.getSettings().theme = 'dark';

        // Add visual indicator
        const titleBar = document.querySelector('.title-bar');
        const badge = document.createElement('span');
        badge.textContent = '🕵️ InPrivate';
        badge.style.cssText = 'background:#333; color:#fff; padding:2px 8px; border-radius:4px; font-size:12px; margin-left:10px;';
        titleBar.querySelector('.window-title').appendChild(badge);
    }

    applySettings();
    renderBookmarks();
    setupEventListeners();

    // In incognito, maybe start with google?
    createTab(storage.getSetting('homepage') || DEFAULT_URL);
});

// UI Helpers
function closeAllMenus() {
    document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
}

function toggleSidebar(type) {
    if (type === 'bookmarks') {
        bookmarksSidebar.classList.toggle('active');
        historySidebar.classList.remove('active');
        if (bookmarksSidebar.classList.contains('active')) renderBookmarks();
    } else if (type === 'history') {
        historySidebar.classList.toggle('active');
        bookmarksSidebar.classList.remove('active');
        if (historySidebar.classList.contains('active')) renderHistory();
    }
}

function togglePanel(type) {
    if (type === 'downloads') {
        downloadsPanel.classList.toggle('active');
    }
}

function toggleModal(type) {
    if (type === 'settings') {
        settingsModal.classList.toggle('active');
        if (settingsModal.classList.contains('active')) loadSettingsToUI();
    }
}

// Event Listeners
function setupEventListeners() {
    // Window controls
    minimizeBtn.addEventListener('click', () => window.electronAPI.minimizeWindow());
    maximizeBtn.addEventListener('click', () => window.electronAPI.maximizeWindow());
    closeBtn.addEventListener('click', () => window.electronAPI.closeWindow());

    // Tab controls
    newTabBtn.addEventListener('click', () => createTab(storage.getSetting('homepage') || DEFAULT_URL));

    // Toolbar controls
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => toggleModal('settings'));
    }

    // Navigation controls
    backBtn.addEventListener('click', goBack);
    forwardBtn.addEventListener('click', goForward);
    refreshBtn.addEventListener('click', refresh);
    homeBtn.addEventListener('click', goHome);
    bookmarkBtn.addEventListener('click', addCurrentPageBookmark);

    // Address bar
    addressBar.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            navigateToUrl(addressBar.value);
        }
    });

    // Sidebar Search
    document.getElementById('historySearch').addEventListener('input', (e) => {
        renderHistory(e.target.value);
    });

    document.getElementById('clearHistoryBtn').addEventListener('click', () => {
        storage.clearHistory();
        renderHistory();
    });

    // Settings Save
    document.getElementById('saveSettings').addEventListener('click', saveSettingsFromUI);

    // Focus mode button
    focusModeBtn.addEventListener('click', toggleFocusMode);

    // AI Toggle
    document.getElementById('aiToggleBtn').addEventListener('click', toggleAISidebar);
    document.getElementById('aiFab').addEventListener('click', toggleAISidebar);

    // AI Message Handler (Cross-frame communication)
    window.addEventListener('message', async (event) => {
        if (event.data.type === 'close-ai-sidebar') {
            toggleAISidebar();
        } else if (event.data.type === 'request-page-content') {
            // Get content from active tab
            const tab = tabs.find(t => t.id === activeTabId);
            if (tab && tab.webview) {
                try {
                    // Execute script to get text content
                    const code = `document.body.innerText`;
                    const text = await tab.webview.executeJavaScript(code);

                    // Send back to AI sidebar
                    const aiIframe = document.getElementById('aiIframe');
                    aiIframe.contentWindow.postMessage({
                        type: 'page-content',
                        text: text
                    }, '*');
                } catch (e) {
                    console.error('Failed to get page content', e);
                }
            }
        }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.key === 't') {
            e.preventDefault();
            createTab(storage.getSetting('homepage') || DEFAULT_URL);
        } else if (e.ctrlKey && e.key === 'w') {
            e.preventDefault();
            if (activeTabId !== null) {
                closeTab(activeTabId);
            }
        } else if (e.ctrlKey && e.key === 'l') {
            e.preventDefault();
            addressBar.select();
        } else if (e.ctrlKey && e.key === 'r') {
            e.preventDefault();
            refresh();
        } else if (e.ctrlKey && e.key === 'n') {
            e.preventDefault();
            window.electronAPI.createNewWindow();
        } else if (e.ctrlKey && e.key === 'h') {
            e.preventDefault();
            toggleSidebar('history');
        } else if (e.ctrlKey && e.key === 'b') {
            e.preventDefault();
            toggleSidebar('bookmarks');
        } else if (e.key === 'F11') {
            e.preventDefault();
            toggleFocusMode();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            exitFocusMode();
        }
    });

    // Download Listeners
    setupDownloadListeners();
}

// Tab Functions
function createTab(url = DEFAULT_URL, options = {}) {
    // If the entire WINDOW is in incognito mode, ALL new tabs must be incognito
    const windowIsIncognito = document.body.classList.contains('incognito-mode');
    if (windowIsIncognito) {
        options.incognito = true;
        // Optional: Force a generic search or blank page in Incognito instead of user's custom homepage
        // to avoid leaking "presence" to that homepage immediately?
        // Let's stick to the requested URL unless it's the startup default.
        if (url === storage.getSetting('homepage')) {
            // Keep it or change? User said "not use your saved info".
            // If homepage is "google.com" and we load it in incognito, that's fine (no cookies sent).
        }
    }

    const tabId = tabIdCounter++;
    const isIncognito = options.incognito || false;

    // Create tab element
    const tabElement = document.createElement('div');
    tabElement.className = 'tab';
    if (isIncognito) tabElement.classList.add('incognito'); // CSS needed
    tabElement.dataset.tabId = tabId;

    const icon = isIncognito ? '🕵️' : `
        <svg class="tab-favicon" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
        </svg>`;

    tabElement.innerHTML = `
        ${isIncognito ? '<span class="tab-icon" style="margin-right:8px; font-size:12px;">🕵️</span>' :
            `<svg class="tab-favicon" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>`}
        <span class="tab-title">${isIncognito ? 'InPrivate Tab' : 'New Tab'}</span>
        <button class="tab-close">
            <svg width="12" height="12" viewBox="0 0 12 12">
                <line x1="2" y1="2" x2="10" y2="10" stroke="currentColor" stroke-width="1.5"/>
                <line x1="10" y1="2" x2="2" y2="10" stroke="currentColor" stroke-width="1.5"/>
            </svg>
        </button>
    `;

    // Create webview
    const webview = document.createElement('webview');
    webview.id = `webview-${tabId}`;

    // Choose URL
    let initialUrl = url || storage.getSetting('homepage') || DEFAULT_URL;
    // If Incognito, maybe we want to be explicit? 
    // For now, loading the requested URL is standard behavior.

    webview.src = initialUrl;
    webview.className = 'webview active';

    // CRITICAL: Set partition
    const globalPrivacy = storage.getSetting('privacyMode');

    if (isIncognito) {
        // Use a unique but consistent partition for this window's incognito tabs if possible, 
        // OR just a new random one for every tab if "Incognito Tab" implies total isolation.
        // Let's use a per-window ephemeral session for "Incognito Tabs" to allow them to share login state *with each other* but not the main session.
        // Since we don't have a stable window ID, we'll lazily create one session ID for the app instance's incognito tabs or use completely unique ones.
        // For now: Unique per tab is safest for "InPrivate" promise.
        webview.partition = `incognito-tab-${Date.now()}-${Math.random()}`;
    } else if (globalPrivacy) {
        webview.partition = `privacy-${Date.now()}`;
    } else {
        webview.partition = 'persist:main';
    }

    webview.setAttribute('allowpopups', '');

    // Webview event listeners
    webview.addEventListener('did-start-loading', () => {
        updateNavigationButtons();
    });

    webview.addEventListener('did-stop-loading', () => {
        updateNavigationButtons();
        const title = webview.getTitle();
        updateTabTitle(tabId, title || 'New Tab');
    });

    webview.addEventListener('page-title-updated', (e) => {
        updateTabTitle(tabId, e.title);
    });

    webview.addEventListener('did-navigate', (e) => {
        if (tabId === activeTabId) {
            addressBar.value = e.url;
        }
        updateNavigationButtons();

        // Add to history ONLY if not incognito
        // Check if this specific tab is incognito (via class we added)
        const currentTab = tabs.find(t => t.id === tabId);
        const isIncognitoTab = currentTab && currentTab.element.classList.contains('incognito');

        if (!isIncognitoTab) {
            addToHistory(webview.getTitle(), e.url);
        }
    }); // End of did-navigate

    webview.addEventListener('did-navigate-in-page', (e) => {
        if (tabId === activeTabId) {
            addressBar.value = e.url;
        }
    });

    // Tab click event
    tabElement.addEventListener('click', (e) => {
        if (!e.target.closest('.tab-close')) {
            switchTab(tabId);
        }
    });

    // Tab close button
    const closeButton = tabElement.querySelector('.tab-close');
    closeButton.addEventListener('click', (e) => {
        e.stopPropagation();
        closeTab(tabId);
    });

    // Add to DOM
    tabsContainer.appendChild(tabElement);
    contentArea.appendChild(webview);

    // Store tab data
    tabs.push({
        id: tabId,
        element: tabElement,
        webview: webview,
        url: url,
        lastActive: Date.now(),
        suspended: false
    });

    // Switch to new tab
    switchTab(tabId);
}

// Global function (Correctly placed)
function addToHistory(title, url) {
    // 1. Incognito Window Check
    if (document.body.classList.contains('incognito-mode')) return;

    // 2. Bad URL Check
    if (!url || url.startsWith('file://') || url === DEFAULT_URL || url === 'about:blank') return;

    const history = storage.data.history || [];
    const historyItem = {
        title: title || url,
        url: url,
        timestamp: Date.now()
    };

    history.unshift(historyItem);
    if (history.length > 1000) history.pop();

    storage.data.history = history;
    storage.save();

    // Only update UI if NOT incognito (double check)
    if (historySidebar.classList.contains('active') && !document.body.classList.contains('incognito-mode')) {
        renderHistory();
    }
}

function switchTab(tabId) {
    // Deactivate all tabs
    tabs.forEach(tab => {
        tab.element.classList.remove('active');
        tab.webview.classList.remove('active');
    });

    // Activate selected tab
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
        tab.element.classList.add('active');
        tab.webview.classList.add('active');
        activeTabId = tabId;

        // Visual check for Incognito
        if (tab.element.classList.contains('incognito')) {
            addressBar.style.backgroundColor = '#1f1f1f'; // Darker address bar
            addressBar.placeholder = 'Search securely (Incognito)';
        } else {
            addressBar.style.backgroundColor = '';
            addressBar.placeholder = 'Search or enter website URL';
        }

        // Update address bar
        try {
            addressBar.value = tab.webview.getURL();
        } catch (e) {
            addressBar.value = tab.url;
        }

        updateNavigationButtons();
    }
}

function closeTab(tabId) {
    const tabIndex = tabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;

    const tab = tabs[tabIndex];

    // Explicitly help Garbage Collection
    if (tab.webview) {
        // Stop navigation logic
        try {
            if (tab.webview.isLoading()) tab.webview.stop();
        } catch (e) { /* ignore */ }

        // Removed src='about:blank' as it causes race condition errors (ERR_FAILED)
    }

    // Remove from DOM
    tab.element.remove();
    tab.webview.remove();

    // Remove from array (Critical)
    tabs.splice(tabIndex, 1);

    // If closing active tab, switch to another
    if (tabId === activeTabId) {
        if (tabs.length > 0) {
            const newActiveTab = tabs[Math.max(0, tabIndex - 1)];
            switchTab(newActiveTab.id);
        } else {
            // No tabs left, create a new one
            createTab(DEFAULT_URL);
        }
    }

    // Trigger memory check cleanup if needed
    // memoryManager.checkTabs(); 
}

function updateTabTitle(tabId, title) {
    const tab = tabs.find(t => t.id === tabId);
    if (tab) {
        const titleElement = tab.element.querySelector('.tab-title');
        titleElement.textContent = title || 'New Tab';
    }
}

// Navigation Functions
// Memory Management
class MemoryManager {
    constructor() {
        this.checkInterval = null;
        this.startMonitoring();
    }

    startMonitoring() {
        if (this.checkInterval) clearInterval(this.checkInterval);
        this.checkInterval = setInterval(() => this.checkTabs(), 60000); // Check every minute
    }

    async checkTabs() {
        if (!storage.getSettings().memorySaver) return;

        const maxRam = parseInt(storage.getSettings().maxRam) || 0;
        let currentRam = 0;

        // Check RAM usage if limit is set
        if (maxRam > 0 && window.electronAPI.getAppMetrics) {
            try {
                // Returns MB
                currentRam = await window.electronAPI.getAppMetrics();
                console.log(`Current RAM: ${currentRam}MB / Limit: ${maxRam}MB`);
            } catch (e) {
                console.error('Failed to get RAM usage', e);
            }
        }

        const limitMinutes = parseInt(storage.getSettings().suspendTime) || 5;
        const now = Date.now();

        // Regular Time-based suspension
        const tabsToSuspend = tabs.filter(tab => {
            return tab.id !== activeTabId &&
                !tab.suspended &&
                (now - (tab.lastActive || now)) > (limitMinutes * 60 * 1000);
        });

        // Aggressive suspension if over RAM limit
        if (maxRam > 0 && currentRam > maxRam) {
            console.log('RAM limit exceeded, aggressively suspending tabs...');
            // Sort by last active (oldest first)
            const activeSortedTabs = tabs
                .filter(t => t.id !== activeTabId && !t.suspended)
                .sort((a, b) => (a.lastActive || 0) - (b.lastActive || 0));

            // Suspend until we hope to be under limit (simply add all inactive to suspend list for now)
            activeSortedTabs.forEach(tab => {
                if (!tabsToSuspend.includes(tab)) {
                    tabsToSuspend.push(tab);
                }
            });
        }

        // --- NEW: Smart Limit (3 Tab Rule) ---
        // "If user open 3 page it will make least used page to go on low ram mode"
        // Only if enabled in settings
        if (activeTabsCount > 3 && storage.getSettings().smartLimit !== false) {
            // Find least used tabs to bring count down to 3
            // Keep active tab protected
            const candidateTabs = tabs
                .filter(t => t.id !== activeTabId && !t.suspended)
                .sort((a, b) => (a.lastActive || 0) - (b.lastActive || 0)); // Oldest first

            // Number of tabs to suspend to get back to 3
            const tabsToSuspendCount = activeTabsCount - 3;

            for (let i = 0; i < tabsToSuspendCount; i++) {
                if (candidateTabs[i] && !tabsToSuspend.includes(candidateTabs[i])) {
                    console.log(`Smart Limit: Suspending ${candidateTabs[i].id} to save RAM (< 3 active tabs)`);
                    tabsToSuspend.push(candidateTabs[i]);
                }
            }
        }

        tabsToSuspend.forEach(tab => this.suspendTab(tab));
    }

    suspendTab(tab) {
        console.log(`Suspending tab ${tab.id}`);
        tab.originalUrl = tab.url;
        tab.suspended = true;

        // Use a "Low RAM" suspended page
        // We use a light placeholder that keeps the strict "Low RAM Mode"
        tab.webview.src = `file://${__dirname}/suspended.html`;

        // Optional: Force garbage collection recommendation (not directly exposed in renderer but good practice to clear ref)
    }

    restoreTab(tab) {
        if (!tab.suspended) return;
        console.log(`Restoring tab ${tab.id}`);
        tab.suspended = false;
        tab.webview.src = tab.originalUrl;
        tab.lastActive = Date.now();
    }

    updateTabActivity(tabId) {
        const tab = tabs.find(t => t.id === tabId);
        if (tab) {
            tab.lastActive = Date.now();
            if (tab.suspended) {
                this.restoreTab(tab);
            }
        }
    }
}

const memoryManager = new MemoryManager();

// Updated switchTab to handle restoration
const originalSwitchTab = switchTab;
switchTab = function (tabId) {
    memoryManager.updateTabActivity(tabId);
    originalSwitchTab(tabId);
};

// ... (Existing code)

function navigateToUrl(input) {
    if (!input) return;

    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) return;

    // Update activity
    memoryManager.updateTabActivity(activeTabId);

    let url = input.trim();

    // Check if it's a URL or search query
    if (!url.includes('.') && !url.startsWith('http://') && !url.startsWith('https://')) {
        // Search query
        const searchEngine = storage.getSetting('searchEngine');
        let searchUrl = 'https://www.google.com/search?q='; // Default

        if (searchEngine === 'bing') {
            searchUrl = 'https://www.bing.com/search?q=';
        } else if (searchEngine === 'duckduckgo') {
            searchUrl = 'https://duckduckgo.com/?q=';
        } else if (searchEngine === 'custom') {
            const customUrl = storage.getSetting('customSearchUrl');
            if (customUrl) {
                if (customUrl.includes('%s')) {
                    url = customUrl.replace('%s', encodeURIComponent(url));
                } else {
                    url = customUrl + encodeURIComponent(url);
                }
                activeTab.webview.src = url;
                activeTab.url = url;
                return;
            }
        }

        url = `${searchUrl}${encodeURIComponent(url)}`;
    } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
        // Add https:// if missing
        url = 'https://' + url;
    }

    activeTab.webview.src = url;
    activeTab.url = url;
}

function goBack() {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab && activeTab.webview.canGoBack()) {
        activeTab.webview.goBack();
    }
}

function goForward() {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab && activeTab.webview.canGoForward()) {
        activeTab.webview.goForward();
    }
}

function refresh() {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab) {
        activeTab.webview.reload();
    }
}

function goHome() {
    navigateToUrl(HOME_URL);
}

function updateNavigationButtons() {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (activeTab) {
        try {
            backBtn.disabled = !activeTab.webview.canGoBack();
            forwardBtn.disabled = !activeTab.webview.canGoForward();
        } catch (e) {
            backBtn.disabled = true;
            forwardBtn.disabled = true;
        }
    }
}

// Focus Mode Functions
let isFocusMode = false;

function toggleFocusMode() {
    if (isFocusMode) {
        exitFocusMode();
    } else {
        enterFocusMode();
    }
}

function enterFocusMode() {
    isFocusMode = true;
    document.body.classList.add('focus-mode');

    // Show focus mode indicator
    showFocusModeIndicator();
}

function exitFocusMode() {
    isFocusMode = false;
    document.body.classList.remove('focus-mode');
}

const aiSidebar = document.getElementById('aiSidebar');
function toggleAISidebar() {
    aiSidebar.classList.toggle('active');
}

function showFocusModeIndicator() {
    // Create temporary indicator
    const indicator = document.createElement('div');
    indicator.className = 'focus-mode-indicator';
    indicator.innerHTML = `
        <div class="focus-mode-text">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>
            </svg>
            <span>Focus Mode</span>
        </div>
        <div class="focus-mode-hint">Press ESC to exit</div>
    `;
    document.body.appendChild(indicator);

    // Remove after 3 seconds
    setTimeout(() => {
        indicator.classList.add('fade-out');
        setTimeout(() => indicator.remove(), 300);
    }, 3000);
}

// --- Feature Implementations ---

// Bookmarks
function renderBookmarks() {
    const marks = storage.getBookmarks();
    bookmarksList.innerHTML = marks.map(b => `
        <div class="bookmark-item" onclick="createTab('${b.url}')">
            <img src="https://www.google.com/s2/favicons?domain=${b.url}" class="bookmark-icon">
            <span class="bookmark-title">${b.title}</span>
            <button class="bookmark-delete" onclick="deleteBookmark(event, ${b.id})">×</button>
        </div>
    `).join('');
}

function addCurrentPageBookmark() {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;

    const bookmark = {
        title: tab.webview.getTitle(),
        url: tab.webview.getURL(),
        favicon: `https://www.google.com/s2/favicons?domain=${tab.webview.getURL()}`
    };
    storage.addBookmark(bookmark);
    renderBookmarks();

    // Visual feedback
    bookmarkBtn.style.color = 'var(--accent-primary)';
    setTimeout(() => bookmarkBtn.style.color = '', 1000);
}

function deleteBookmark(e, id) {
    e.stopPropagation();
    storage.removeBookmark(id);
    renderBookmarks();
}

// History
function renderHistory() {
    historyList.innerHTML = '';

    // PRIVACY FIX: If Incognito, show Empty History
    if (document.body.classList.contains('incognito-mode')) {
        historyList.innerHTML = '<div style="padding:20px; text-align:center; opacity:0.6;">History is hidden in Incognito Mode</div>';
        return;
    }

    const history = storage.getHistory(); // Use the getter
    history.forEach(item => {
        const div = document.createElement('div');
        div.className = 'list-item';
        const date = new Date(item.timestamp).toLocaleTimeString();
        div.innerHTML = `
            <div class="list-item-title">${item.title}</div>
            <div class="list-item-url">${date} - ${item.url}</div>
        `;
        div.onclick = () => {
            const tab = tabs.find(t => t.id === activeTabId);
            if (tab) navigateToUrl(item.url);
        };
        historyList.appendChild(div);
    });
}

function addToHistory(title, url) {
    // 1. Incognito Window Check
    if (document.body.classList.contains('incognito-mode')) return;

    // 2. Bad URL Check
    if (!url || url.startsWith('file://') || url === DEFAULT_URL || url === 'about:blank') return;

    const history = storage.getHistory();
    // Note: storage.getHistory returns a copy or ref?
    // storage.js getHistory returns (this.data.history || []).slice(0,limit), which is a copy.
    // We need to modify the actual data array.

    if (!storage.data.history) storage.data.history = [];
    const historyArray = storage.data.history;

    const historyItem = {
        title: title || url,
        url: url,
        timestamp: Date.now()
    };

    historyArray.unshift(historyItem);
    if (historyArray.length > 1000) historyArray.pop();

    storage.save();

    // Only update UI if NOT incognito (double check)
    if (historySidebar.classList.contains('active') && !document.body.classList.contains('incognito-mode')) {
        renderHistory();
    }
}

// Downloads
function setupDownloadListeners() {
    window.electronAPI.onDownloadStarted((event, item) => {
        togglePanel('downloads');
        const el = document.createElement('div');
        el.className = 'download-item';
        el.id = `download-${item.id}`;

        // Template with controls
        el.innerHTML = `
            <div class="download-info">
                <div class="download-name" title="${item.filename}">${item.filename}</div>
                <div class="download-status">Starting...</div>
            </div>
            <div class="download-progress-bar"><div class="progress-fill" style="width: 0%"></div></div>
            <div class="download-controls">
                <button class="dl-btn" onclick="window.electronAPI.downloadControl('${item.id}', 'pause')">Pause</button>
                <button class="dl-btn" onclick="window.electronAPI.downloadControl('${item.id}', 'cancel')">Cancel</button>
            </div>
        `;
        downloadsList.prepend(el);
    });

    window.electronAPI.onDownloadProgress((event, item) => {
        const el = document.getElementById(`download-${item.id}`);
        if (el) {
            const percent = Math.round((item.receivedBytes / item.totalBytes) * 100);
            el.querySelector('.progress-fill').style.width = `${percent}%`;

            // Calculate status
            const receivedMB = (item.receivedBytes / 1024 / 1024).toFixed(1);
            const totalMB = (item.totalBytes / 1024 / 1024).toFixed(1);
            el.querySelector('.download-status').textContent = `${percent}% - ${receivedMB} / ${totalMB} MB`;

            // Update buttons to 'Pause' if it was potentially resumed
            const btn = el.querySelector('.dl-btn');
            if (btn && btn.textContent === 'Resume') {
                // Update button logic could be more complex (state tracking), 
                // but for now simple toggle via click handlers separate from here is safer, 
                // or just always ensure 'Pause' is available when progressing.
                // Ideally we'd receive a 'paused' event.
            }
        }
    });

    window.electronAPI.onDownloadComplete((event, item) => {
        const el = document.getElementById(`download-${item.id}`);
        if (el) {
            el.querySelector('.progress-fill').style.width = '100%';
            el.querySelector('.progress-fill').style.background = '#10b981'; // Green
            el.querySelector('.download-status').textContent = 'Completed';

            // Replace controls with Open/Folder/Delete
            const controls = el.querySelector('.download-controls');
            controls.innerHTML = `
                <button class="dl-btn" onclick="window.electronAPI.downloadOpen('${item.path.replace(/\\/g, '\\\\')}', 'file')">Open</button>
                <button class="dl-btn" onclick="window.electronAPI.downloadOpen('${item.path.replace(/\\/g, '\\\\')}', 'folder')">Folder</button>
                <button class="dl-btn" onclick="document.getElementById('download-${item.id}').remove()">Clear</button>
            `;
        }
    });

    window.electronAPI.onDownloadFailed((event, item) => {
        const el = document.getElementById(`download-${item.id}`);
        if (el) {
            el.querySelector('.progress-fill').style.background = '#ef4444'; // Red
            el.querySelector('.download-status').textContent = `Failed: ${item.state}`;
            el.querySelector('.download-controls').innerHTML = `
                <button class="dl-btn" onclick="document.getElementById('download-${item.id}').remove()">Dismiss</button>
            `;
        }
    });
}

// Settings
function applySettings() {
    const s = storage.getSettings();

    // Theme
    if (s.theme === 'light') {
        document.body.classList.add('light-theme');
    } else {
        document.body.classList.remove('light-theme');
    }

    // AdBlocker
    adBlocker.setEnabled(s.adBlockEnabled);
    if (window.electronAPI && window.electronAPI.enableAdBlock) {
        window.electronAPI.enableAdBlock(s.adBlockEnabled);
    }

    // Proxy
    if (s.proxyEnabled && s.proxyUrl) {
        window.electronAPI.setProxy({ enabled: true, proxyUrl: s.proxyUrl });
    } else {
        window.electronAPI.setProxy({ enabled: false });
    }
}

function loadSettingsToUI() {
    const s = storage.getSettings();
    document.getElementById('settingHomepage').value = s.homepage;
    document.getElementById('settingSearchEngine').value = s.searchEngine;
    document.getElementById('settingCustomSearchUrl').value = s.customSearchUrl || '';

    const customGroup = document.getElementById('customSearchEngineGroup');
    const updateCustomVisibility = (val) => {
        customGroup.style.display = val === 'custom' ? 'flex' : 'none';
    };

    updateCustomVisibility(s.searchEngine);

    document.getElementById('settingSearchEngine').onchange = (e) => {
        updateCustomVisibility(e.target.value);
    };

    document.getElementById('settingTheme').value = s.theme;
    document.getElementById('settingAdBlock').checked = s.adBlockEnabled;
    document.getElementById('settingPrivacyMode').checked = s.privacyMode;
    // Memory
    if (document.getElementById('settingMemorySaver')) {
        document.getElementById('settingMemorySaver').checked = s.memorySaver !== false;
    }
    if (document.getElementById('settingSmartLimit')) {
        document.getElementById('settingSmartLimit').checked = s.smartLimit !== false;
    }
    if (document.getElementById('settingSuspendTime')) {
        document.getElementById('settingSuspendTime').value = s.suspendTime || '5';
    }
}

// Clear Cache Button
const clearCacheBtn = document.getElementById('clearCacheBtn');
if (clearCacheBtn) {
    clearCacheBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to clear the browser cache and cookies?')) {
            await window.electronAPI.clearCache();
            alert('Cache cleared.');
        }
    });
}

function saveSettingsFromUI() {
    const searchEngine = document.getElementById('settingSearchEngine').value;
    let homepage = document.getElementById('settingHomepage').value;
    const customSearchUrl = document.getElementById('settingCustomSearchUrl').value;

    // Auto-update homepage if it matches a search engine URL or is empty
    const engines = {
        'google': 'https://www.google.com',
        'bing': 'https://www.bing.com',
        'duckduckgo': 'https://duckduckgo.com',
        'custom': customSearchUrl ? new URL(customSearchUrl.replace('%s', '').replace('?q=', '')).origin : ''
    };

    // If changing search engine, update homepage to match
    const currentSettings = storage.getSettings();
    if (currentSettings.searchEngine !== searchEngine && searchEngine !== 'custom') {
        homepage = engines[searchEngine];
        document.getElementById('settingHomepage').value = homepage;
    }

    const updates = {
        homepage: homepage,
        searchEngine: searchEngine,
        customSearchUrl: customSearchUrl,
        theme: document.getElementById('settingTheme').value,
        adBlockEnabled: document.getElementById('settingAdBlock').checked,
        privacyMode: document.getElementById('settingPrivacyMode').checked,
        proxyEnabled: document.getElementById('settingProxyEnabled').checked,
        proxyUrl: document.getElementById('settingProxyUrl').value,
        memorySaver: document.getElementById('settingMemorySaver') ? document.getElementById('settingMemorySaver').checked : true,
        smartLimit: document.getElementById('settingSmartLimit') ? document.getElementById('settingSmartLimit').checked : true,
        suspendTime: document.getElementById('settingSuspendTime') ? document.getElementById('settingSuspendTime').value : '5',
        maxRam: document.getElementById('settingMaxRam') ? parseInt(document.getElementById('settingMaxRam').value) : 0
    };

    storage.updateSettings(updates);
    applySettings();
    toggleModal('settings');
}

// Context Menu
document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    contextMenu.style.top = `${e.clientY}px`;
    contextMenu.style.left = `${e.clientX}px`;

    // Clear previous items
    contextMenu.innerHTML = '';

    // Create items with listeners
    const newItem = document.createElement('div');
    newItem.className = 'context-item';
    newItem.textContent = 'New Tab';
    newItem.onclick = () => {
        createTab(storage.getSetting('homepage') || DEFAULT_URL);
        contextMenu.classList.remove('active');
    };
    contextMenu.appendChild(newItem);

    const refreshItem = document.createElement('div');
    refreshItem.className = 'context-item';
    refreshItem.textContent = 'Refresh';
    refreshItem.onclick = () => {
        refresh();
        contextMenu.classList.remove('active');
    };
    contextMenu.appendChild(refreshItem);

    if (activeTabId !== null) {
        const closeItem = document.createElement('div');
        closeItem.className = 'context-item';
        closeItem.textContent = 'Close Tab';
        closeItem.onclick = () => {
            closeTab(activeTabId);
            contextMenu.classList.remove('active');
        };
        contextMenu.appendChild(closeItem);
    }

    contextMenu.classList.add('active');
});

document.addEventListener('click', () => {
    contextMenu.classList.remove('active');
});

// Double click on empty tab bar space to open new tab
tabsContainer.addEventListener('dblclick', (e) => {
    // Only if clicking on the container itself, not a tab
    if (e.target === tabsContainer) {
        createTab(storage.getSetting('homepage') || DEFAULT_URL);
    }
});
