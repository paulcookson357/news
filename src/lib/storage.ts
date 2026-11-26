import fs from 'node:fs';
import path from 'node:path';
import type {
  DeepDiveArticle,
  DeepDiveSection,
  DeepDiveSourceDetail,
  Edition,
  RawArticle,
  StoryCategory,
  StorySource,
  StorySummary,
} from './types';

interface MeridianCacheStore {
  edition: Edition | null;
  rawArticles: RawArticle[];
  deepDives: Record<string, DeepDiveArticle>;
  hydratedFromDisk: boolean;
}

declare global {
  var __meridianCache: MeridianCacheStore | undefined;
}

const EDITION_MEMORY_TTL_MS = 10 * 60 * 1000;

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

function pruneDeepDives(
  dives: Record<string, DeepDiveArticle>,
  limit: number
): Record<string, DeepDiveArticle> {
  const entries = Object.entries(dives).sort((a, b) =>
    b[1].generatedAt.localeCompare(a[1].generatedAt)
  );
  return Object.fromEntries(entries.slice(0, limit));
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

function getSupabaseConfig(): {
  url: string;
  key: string;
  writeSecret: string;
} | null {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, '');
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  const writeSecret = process.env.MERIDIAN_WRITE_SECRET?.trim() ?? '';
  if (!url || !key) return null;
  return { url, key, writeSecret };
}

function buildSupabaseHeaders(
  key: string,
  includeJson = false
): Record<string, string> {
  const headers: Record<string, string> = {
    apikey: key,
  };
  if (!key.startsWith('sb_')) {
    headers.Authorization = `Bearer ${key}`;
  }
  if (includeJson) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

interface SupabaseEditionRow {
  id: string;
  updated_at: string;
  edition_date: string;
  sources_checked: number;
  sources_succeeded: number;
  active_source_names: string[];
  story_ids: string[];
}

interface SupabaseStoryRow {
  id: string;
  title: string;
  summary: string;
  section: StoryCategory;
  published_at: string;
  primary_source: string;
  score: number;
  sources: StorySource[];
  image_url?: string | null;
  image_source?: string | null;
}

interface SupabaseDeepDiveRow {
  id: string;
  title: string;
  section: StoryCategory;
  standfirst: string;
  key_facts: string[];
  sections: DeepDiveSection[];
  sources: DeepDiveSourceDetail[];
  editorial_note: string;
  synthesis_mode: 'ai' | 'algorithmic';
  search_queries_used: string[];
  generated_at: string;
}

function mapStoryRow(row: SupabaseStoryRow): StorySummary {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    section: row.section,
    publishedAt: row.published_at,
    primarySource: row.primary_source,
    score: row.score,
    sources: Array.isArray(row.sources) ? row.sources : [],
    imageUrl: row.image_url ?? undefined,
    imageSource: row.image_source ?? undefined,
  };
}

function mapDeepDiveRow(row: SupabaseDeepDiveRow): DeepDiveArticle {
  return {
    id: row.id,
    title: row.title,
    section: row.section,
    standfirst: row.standfirst,
    keyFacts: Array.isArray(row.key_facts) ? row.key_facts : [],
    sections: Array.isArray(row.sections) ? row.sections : [],
    sources: Array.isArray(row.sources) ? row.sources : [],
    editorialNote: row.editorial_note,
    synthesisMode: row.synthesis_mode,
    searchQueriesUsed: Array.isArray(row.search_queries_used)
      ? row.search_queries_used
      : [],
    generatedAt: row.generated_at,
  };
}

export async function loadEdition(): Promise<Edition | null> {
  const store = getStore();
  if (store.edition && store.edition.stories.length > 0) {
    const ageMs = Date.now() - Date.parse(store.edition.updatedAt);
    if (!Number.isNaN(ageMs) && ageMs < EDITION_MEMORY_TTL_MS) {
      return store.edition;
    }
  }

  const cfg = getSupabaseConfig();
  if (cfg) {
    try {
      const editionRes = await fetch(
        `${cfg.url}/rest/v1/meridian_editions?select=id,updated_at,edition_date,sources_checked,sources_succeeded,active_source_names,story_ids&order=updated_at.desc&limit=1`,
        {
          headers: buildSupabaseHeaders(cfg.key),
          signal: AbortSignal.timeout(5500),
          cache: 'no-store',
        }
      );

      if (editionRes.ok) {
        const rows = (await editionRes.json()) as SupabaseEditionRow[];
        const latest = rows[0];
        if (latest && Array.isArray(latest.story_ids) && latest.story_ids.length > 0) {
          const idFilter = latest.story_ids
            .map((id) => `"${id.replace(/"/g, '')}"`)
            .join(',');
          const storiesRes = await fetch(
            `${cfg.url}/rest/v1/meridian_stories?select=id,title,summary,section,published_at,primary_source,score,sources,image_url,image_source&id=in.(${encodeURIComponent(
              idFilter
            )})`,
            {
              headers: buildSupabaseHeaders(cfg.key),
              signal: AbortSignal.timeout(5500),
              cache: 'no-store',
            }
          );

          if (storiesRes.ok) {
            const storyRows = (await storiesRes.json()) as SupabaseStoryRow[];
            const byId = new Map(storyRows.map((r) => [r.id, mapStoryRow(r)]));
            const orderedStories = latest.story_ids
              .map((id) => byId.get(id))
              .filter((s): s is StorySummary => Boolean(s));

            if (orderedStories.length > 0) {
              const edition: Edition = {
                updatedAt: latest.updated_at,
                editionDate: latest.edition_date,
                stories: orderedStories,
                sourcesChecked: latest.sources_checked,
                sourcesSucceeded: latest.sources_succeeded,
                activeSourceNames: latest.active_source_names ?? [],
              };
              store.edition = edition;
              persistStore(store);
              return edition;
            }
          }
        }
      }
    } catch {
      // Fall back to local cache if Supabase is temporarily unreachable
    }
  }

  return store.edition;
}

export async function saveEdition(
  edition: Edition,
  rawArticles?: RawArticle[]
): Promise<void> {
  const store = getStore();
  store.edition = edition;
  if (rawArticles) {
    store.rawArticles = rawArticles;
  }
  persistStore(store);

  const cfg = getSupabaseConfig();
  if (cfg && cfg.writeSecret) {
    try {
      await fetch(`${cfg.url}/rest/v1/rpc/save_meridian_edition`, {
        method: 'POST',
        headers: buildSupabaseHeaders(cfg.key, true),
        body: JSON.stringify({
          p_secret: cfg.writeSecret,
          p_edition: {
            id: edition.updatedAt,
            updatedAt: edition.updatedAt,
            editionDate: edition.editionDate,
            sourcesChecked: edition.sourcesChecked,
            sourcesSucceeded: edition.sourcesSucceeded,
            activeSourceNames: edition.activeSourceNames,
            storyIds: edition.stories.map((s) => s.id),
          },
          p_stories: edition.stories,
        }),
        signal: AbortSignal.timeout(8000),
      });
    } catch (err) {
      console.error('Supabase saveEdition warning:', err);
    }
  }
}

export function getCachedRawArticles(): RawArticle[] {
  return getStore().rawArticles;
}

export async function loadStoryById(id: string): Promise<StorySummary | null> {
  const store = getStore();
  const localMatch = store.edition?.stories.find((story) => story.id === id);
  if (localMatch) return localMatch;

  const cfg = getSupabaseConfig();
  if (cfg) {
    try {
      const res = await fetch(
        `${cfg.url}/rest/v1/meridian_stories?select=id,title,summary,section,published_at,primary_source,score,sources,image_url,image_source&id=eq.${encodeURIComponent(
          id
        )}&limit=1`,
        {
          headers: buildSupabaseHeaders(cfg.key),
          signal: AbortSignal.timeout(5000),
          cache: 'no-store',
        }
      );
      if (res.ok) {
        const rows = (await res.json()) as SupabaseStoryRow[];
        if (rows[0]) {
          return mapStoryRow(rows[0]);
        }
      }
    } catch {
      // Fall through to null
    }
  }

  return null;
}

export async function loadDeepDive(
  id: string
): Promise<DeepDiveArticle | null> {
  const store = getStore();
  if (store.deepDives[id]) {
    return store.deepDives[id];
  }

  const cfg = getSupabaseConfig();
  if (cfg) {
    try {
      const res = await fetch(
        `${cfg.url}/rest/v1/meridian_deep_dives?select=id,title,section,standfirst,key_facts,sections,sources,editorial_note,synthesis_mode,search_queries_used,generated_at&id=eq.${encodeURIComponent(
          id
        )}&limit=1`,
        {
          headers: buildSupabaseHeaders(cfg.key),
          signal: AbortSignal.timeout(5000),
          cache: 'no-store',
        }
      );
      if (res.ok) {
        const rows = (await res.json()) as SupabaseDeepDiveRow[];
        if (rows[0]) {
          const mapped = mapDeepDiveRow(rows[0]);
          store.deepDives[id] = mapped;
          persistStore(store);
          return mapped;
        }
      }
    } catch {
      // Fall through to null
    }
  }

  return null;
}

export async function saveDeepDive(article: DeepDiveArticle): Promise<void> {
  const store = getStore();
  store.deepDives[article.id] = article;
  store.deepDives = pruneDeepDives(store.deepDives, 40);
  persistStore(store);

  const cfg = getSupabaseConfig();
  if (cfg && cfg.writeSecret) {
    try {
      await fetch(`${cfg.url}/rest/v1/rpc/save_meridian_deep_dive`, {
        method: 'POST',
        headers: buildSupabaseHeaders(cfg.key, true),
        body: JSON.stringify({
          p_secret: cfg.writeSecret,
          p_article: article,
        }),
        signal: AbortSignal.timeout(8000),
      });
    } catch (err) {
      console.error('Supabase saveDeepDive warning:', err);
    }
  }
}
