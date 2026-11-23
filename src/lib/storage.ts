import fs from 'node:fs';
import path from 'node:path';
import type { DeepDiveArticle, Edition, RawArticle, StorySummary } from './types';

interface MeridianCacheStore {
  edition: Edition | null;
  rawArticles: RawArticle[];
  deepDives: Record<string, DeepDiveArticle>;
  hydratedFromDisk: boolean;
}

declare global {
  var __meridianCache: MeridianCacheStore | undefined;
}

function getCacheFilePath(): string {
  if (process.env.VERCEL) {
    return '/tmp/meridian-cache.json';
  }
  return path.join(process.cwd(), '.data', 'meridian-cache.json');
}

function getStore(): MeridianCacheStore {
  if (!globalThis.__meridianCache) {
    globalThis.__meridianCache = {
      edition: null,
      rawArticles: [],
      deepDives: {},
      hydratedFromDisk: false,
    };
  }

  if (!globalThis.__meridianCache.hydratedFromDisk) {
    globalThis.__meridianCache.hydratedFromDisk = true;
    try {
      const filePath = getCacheFilePath();
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw) as Partial<MeridianCacheStore>;
        if (parsed.edition) {
          globalThis.__meridianCache.edition = parsed.edition;
        }
        if (Array.isArray(parsed.rawArticles)) {
          globalThis.__meridianCache.rawArticles = parsed.rawArticles;
        }
        if (parsed.deepDives && typeof parsed.deepDives === 'object') {
          globalThis.__meridianCache.deepDives = parsed.deepDives;
        }
      }
    } catch {
      // Ignore read errors on ephemeral/serverless filesystems
    }
  }

  return globalThis.__meridianCache;
}

function persistStore(store: MeridianCacheStore): void {
  try {
    const filePath = getCacheFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const payload = {
      edition: store.edition,
      rawArticles: store.rawArticles.slice(0, 400),
      deepDives: pruneDeepDives(store.deepDives, 40),
    };
    fs.writeFileSync(filePath, JSON.stringify(payload), 'utf-8');
  } catch {
    // Serverless environments may restrict filesystem writes outside /tmp
  }
}

function pruneDeepDives(
  dives: Record<string, DeepDiveArticle>,
  limit: number
): Record<string, DeepDiveArticle> {
  const entries = Object.entries(dives).sort((a, b) =>
    b[1].generatedAt.localeCompare(a[1].generatedAt)
  );
  return Object.fromEntries(entries.slice(0, limit));
}

export function getCachedEdition(): Edition | null {
  return getStore().edition;
}

export function saveEdition(edition: Edition, rawArticles?: RawArticle[]): void {
  const store = getStore();
  store.edition = edition;
  if (rawArticles) {
    store.rawArticles = rawArticles;
  }
  persistStore(store);
}

export function getCachedRawArticles(): RawArticle[] {
  return getStore().rawArticles;
}

export function getCachedStoryById(id: string): StorySummary | null {
  const edition = getStore().edition;
  if (!edition) return null;
  return edition.stories.find((story) => story.id === id) ?? null;
}

export function getCachedDeepDive(id: string): DeepDiveArticle | null {
  return getStore().deepDives[id] ?? null;
}

export function saveDeepDive(article: DeepDiveArticle): void {
  const store = getStore();
  store.deepDives[article.id] = article;
  store.deepDives = pruneDeepDives(store.deepDives, 40);
  persistStore(store);
}
