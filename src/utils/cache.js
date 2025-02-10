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

    // Add size method
    size() {
        return this.cache.size;
    }

    // Add method to get all valid keys
    keys() {
        const now = Date.now();
        return Array.from(this.cache.entries())
            .filter(([_, data]) => now - data.timestamp <= this.ttl)
            .map(([key]) => key);
    }

    // Add method to get all valid entries
    entries() {
        const now = Date.now();
        return Array.from(this.cache.entries())
            .filter(([_, data]) => now - data.timestamp <= this.ttl)
            .map(([key, data]) => [key, data.value]);
    }
}

module.exports = Cache;
