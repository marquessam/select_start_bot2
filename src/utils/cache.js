// File: src/utils/cache.js

class Cache {
    constructor(ttl = 300000) { // Default TTL: 5 minutes (300000ms)
        this.cache = new Map();
        this.ttl = ttl;
    }

    set(key, value) {
        this.cache.set(key, {
            value,
            timestamp: Date.now()
        });
    }

    get(key) {
        const data = this.cache.get(key);
        if (!data) return null;

        // Check if cached data has expired
        if (Date.now() - data.timestamp > this.ttl) {
            this.cache.delete(key);
            return null;
        }

        return data.value;
    }

    clear() {
        this.cache.clear();
    }
}

module.exports = Cache;
