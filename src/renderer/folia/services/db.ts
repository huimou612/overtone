// Lab shim for folia's src/services/db.ts.
// The app persists caches in IndexedDB; the lab keeps them in memory for the
// lifetime of the page, which is enough for uploaded visualizer images and
// packs. The exported surface mirrors the real module for the calls the
// extracted visualizer code makes.

interface CacheEntry {
    data: unknown;
    timestamp: number;
}

const cache = new Map<string, CacheEntry>();

export const saveToCache = async (key: string, data: unknown): Promise<void> => {
    cache.set(key, { data, timestamp: Date.now() });
};

export const getFromCache = async <T>(key: string): Promise<T | null> => {
    const entry = cache.get(key);
    return entry ? (entry.data as T) : null;
};

export const getCacheEntriesByPrefix = async <T>(
    prefix: string,
): Promise<Array<{ key: string; data: T; timestamp: number }>> => {
    const out: Array<{ key: string; data: T; timestamp: number }> = [];
    cache.forEach((entry, key) => {
        if (key.startsWith(prefix)) out.push({ key, data: entry.data as T, timestamp: entry.timestamp });
    });
    return out;
};

export const getCacheEntriesByKey = async <T>(
    keys: readonly string[],
): Promise<Array<{ key: string; data: T; timestamp: number }>> => {
    const out: Array<{ key: string; data: T; timestamp: number }> = [];
    keys.forEach((key) => {
        const entry = cache.get(key);
        if (entry) out.push({ key, data: entry.data as T, timestamp: entry.timestamp });
    });
    return out;
};

export const getFromCacheWithMigration = async <T>(
    key: string,
    migrate?: (value: unknown) => T | null,
): Promise<T | null> => {
    const entry = cache.get(key);
    if (!entry) return null;
    if (!migrate) return entry.data as T;
    const migrated = migrate(entry.data);
    if (migrated !== null) cache.set(key, { data: migrated, timestamp: entry.timestamp });
    return migrated;
};

export const removeFromCache = async (key: string): Promise<void> => {
    cache.delete(key);
};

export const clearCache = async (preserveKeys: string[] = []): Promise<void> => {
    const keep = new Set(preserveKeys);
    [...cache.keys()].forEach((key) => {
        if (!keep.has(key)) cache.delete(key);
    });
};
