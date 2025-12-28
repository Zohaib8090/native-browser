class AdBlocker {
    constructor() {
        this.enabled = true;
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

    enable(val) {
        this.enabled = val;
    }
}

module.exports = AdBlocker;
