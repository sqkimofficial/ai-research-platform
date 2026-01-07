// Simple localStorage cache utilities with TTL support
// Key format examples:
// - cache:documents:{projectId}
// - cache:highlights:{projectId}
// - cache:pdfs:{projectId}
// - cache:lastSync:{projectId}

function safeNowMs() {
  try {
    return Date.now();
  } catch {
    return new Date().getTime();
  }
}

export function getCacheKey(type, projectId) {
  const key = `cache:${type}:${projectId}`;
  try {
    // Debug
    // eslint-disable-next-line no-console
    console.log('[CACHE] Cache key:', key);
  } catch {
    // ignore
  }
  return key;
}

export function getCachedData(key) {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    // Debug
    // eslint-disable-next-line no-console
    console.log('[CACHE] Cache hit:', !!parsed);
    if (parsed && parsed.cachedAtMs) {
      const ageSec = Math.floor((safeNowMs() - parsed.cachedAtMs) / 1000);
      // eslint-disable-next-line no-console
      console.log('[CACHE] Cache age:', ageSec, 'seconds');
    }
    return parsed;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[CACHE] Failed to parse cache. Clearing.', e);
    try { localStorage.removeItem(key); } catch { /* ignore */ }
    return null;
  }
}

export function setCachedData(key, data, ttlSeconds) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const payload = {
      data,
      cachedAtMs: safeNowMs(),
      ttlSeconds: ttlSeconds ?? null
    };
    localStorage.setItem(key, JSON.stringify(payload));
    // Debug
    // eslint-disable-next-line no-console
    console.log('[CACHE] Cache set:', key, 'TTL:', ttlSeconds, 's');
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[CACHE] Failed to set cache:', e);
  }
}

export function isCacheValid(cached, ttlSeconds) {
  if (!cached) return false;
  const ttl = typeof ttlSeconds === 'number' ? ttlSeconds : (cached.ttlSeconds ?? 0);
  if (!ttl || ttl <= 0) return false;
  const ageSec = Math.floor((safeNowMs() - (cached.cachedAtMs || 0)) / 1000);
  const isValid = ageSec < ttl;
  try {
    // eslint-disable-next-line no-console
    console.log('[CACHE] Cache valid:', isValid);
  } catch {
    // ignore
  }
  return isValid;
}

export function clearCache(projectId) {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  const keys = [
    getCacheKey('documents', projectId),
    getCacheKey('highlights', projectId),
    getCacheKey('pdfs', projectId),
    getCacheKey('lastSync', projectId)
  ];
  const cleared = [];
  try {
    // eslint-disable-next-line no-console
    console.log('[CACHE] Invalidating cache for project:', projectId);
    keys.forEach((k) => {
      try {
        localStorage.removeItem(k);
        cleared.push(k);
      } catch {
        // ignore
      }
    });
    // eslint-disable-next-line no-console
    console.log('[CACHE] Cleared cache keys:', cleared);
  } catch {
    // ignore
  }
  return cleared;
}

export function getCacheStats() {
  if (typeof window === 'undefined' || !window.localStorage) return { totalKeys: 0, approxBytes: 0 };
  let totalKeys = 0;
  let approxBytes = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('cache:')) {
        totalKeys += 1;
        const val = localStorage.getItem(key) || '';
        approxBytes += key.length + val.length;
      }
    }
  } catch {
    // ignore
  }
  return { totalKeys, approxBytes };
}


