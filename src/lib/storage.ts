import fs from 'node:fs';
import path from 'node:path';
import type {
  DeepDiveArticle,
  DeepDiveSection,
  DeepDiveSourceDetail,
  Edition,
  EditionArchiveItem,
  EditionSlot,
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
  edition_day?: string | null;
  edition_slot?: EditionSlot | null;
  sources_checked: number;
  sources_succeeded: number;
  active_source_names: string[];
  story_ids: string[];
}

function normalizeEditionSlot(raw: unknown): EditionSlot | null {
  if (raw === 'morning' || raw === 'midday' || raw === 'evening') {
    return raw;
  }
  return null;
}

function deriveDayAndSlot(
  updatedAt: string,
  explicitDay?: string | null,
  explicitSlot?: string | null
): { editionDay: string; editionSlot: EditionSlot } {
  const parsed = new Date(updatedAt);
  const validDate = !Number.isNaN(parsed.getTime());
  const editionDay =
    explicitDay && /^\d{4}-\d{2}-\d{2}$/.test(explicitDay)
      ? explicitDay
      : validDate
        ? parsed.toISOString().slice(0, 10)
        : new Date().toISOString().slice(0, 10);

  const normalizedSlot = normalizeEditionSlot(explicitSlot);
  if (normalizedSlot) {
    return { editionDay, editionSlot: normalizedSlot };
  }

  const mins = validDate ? parsed.getUTCHours() * 60 + parsed.getUTCMinutes() : 12 * 60;
  const editionSlot: EditionSlot =
    mins < 11 * 60 + 30 ? 'morning' : mins < 17 * 60 ? 'midday' : 'evening';
  return { editionDay, editionSlot };
}

async function fetchWithRetry(
  url: string,
  init: RequestInit,
  timeoutMs = 8000
): Promise<Response> {
  try {
    const res = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
    });
    if (res.status < 500) return res;
  } catch {
    // Fall through to single retry
  }
  await new Promise((resolve) => setTimeout(resolve, 300));
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  });
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

export async function loadEdition(editionId?: string): Promise<Edition | null> {
  const store = getStore();
  if (!editionId && store.edition && store.edition.stories.length > 0) {
    const ageMs = Date.now() - Date.parse(store.edition.updatedAt);
    if (!Number.isNaN(ageMs) && ageMs < EDITION_MEMORY_TTL_MS) {
      return store.edition;
    }
  }

  if (editionId && store.edition?.id === editionId && store.edition.stories.length > 0) {
    return store.edition;
  }

  const cfg = getSupabaseConfig();
  if (cfg) {
    try {
      const editionQuery = editionId
        ? `${cfg.url}/rest/v1/meridian_editions?select=id,updated_at,edition_date,edition_day,edition_slot,sources_checked,sources_succeeded,active_source_names,story_ids&id=eq.${encodeURIComponent(
            editionId
          )}&limit=1`
        : `${cfg.url}/rest/v1/meridian_editions?select=id,updated_at,edition_date,edition_day,edition_slot,sources_checked,sources_succeeded,active_source_names,story_ids&order=updated_at.desc&limit=1`;

      const editionRes = await fetchWithRetry(editionQuery, {
        headers: buildSupabaseHeaders(cfg.key),
      });

      if (editionRes.ok) {
        const rows = (await editionRes.json()) as SupabaseEditionRow[];
        const latest = rows[0];
        if (latest && Array.isArray(latest.story_ids) && latest.story_ids.length > 0) {
          const idFilter = latest.story_ids
            .map((id) => `"${id.replace(/"/g, '')}"`)
            .join(',');
          const storiesRes = await fetchWithRetry(
            `${cfg.url}/rest/v1/meridian_stories?select=id,title,summary,section,published_at,primary_source,score,sources,image_url,image_source&id=in.(${encodeURIComponent(
              idFilter
            )})`,
            {
              headers: buildSupabaseHeaders(cfg.key),
            }
          );

          if (storiesRes.ok) {
            const storyRows = (await storiesRes.json()) as SupabaseStoryRow[];
            const byId = new Map(storyRows.map((r) => [r.id, mapStoryRow(r)]));
            const orderedStories = latest.story_ids
              .map((id) => byId.get(id))
              .filter((s): s is StorySummary => Boolean(s));

            if (orderedStories.length > 0) {
              const { editionDay, editionSlot } = deriveDayAndSlot(
                latest.updated_at,
                latest.edition_day,
                latest.edition_slot
              );
              const edition: Edition = {
                id: latest.id,
                updatedAt: latest.updated_at,
                editionDate: latest.edition_date,
                editionDay,
                editionSlot,
                stories: orderedStories,
                sourcesChecked: latest.sources_checked,
                sourcesSucceeded: latest.sources_succeeded,
                activeSourceNames: latest.active_source_names ?? [],
              };
              if (!editionId) {
                store.edition = edition;
                persistStore(store);
              }
              return edition;
            }
          }
        }
      }
    } catch {
      // Fall back to local cache if Supabase is temporarily unreachable
    }
  }

  return editionId ? null : store.edition;
}

const SLOT_SORT_WEIGHT: Record<EditionSlot, number> = {
  evening: 3,
  midday: 2,
  morning: 1,
};

export async function listEditionArchive(): Promise<EditionArchiveItem[]> {
  const store = getStore();
  const cfg = getSupabaseConfig();

  if (cfg) {
    try {
      const res = await fetchWithRetry(
        `${cfg.url}/rest/v1/meridian_editions?select=id,updated_at,edition_date,edition_day,edition_slot,sources_checked,sources_succeeded,story_ids&order=updated_at.desc&limit=60`,
        {
          headers: buildSupabaseHeaders(cfg.key),
        }
      );

      if (res.ok) {
        const rows = (await res.json()) as SupabaseEditionRow[];
        const seenDaySlot = new Set<string>();
        const items: EditionArchiveItem[] = [];

        for (const row of rows) {
          if (!Array.isArray(row.story_ids) || row.story_ids.length === 0) {
            continue;
          }
          const { editionDay, editionSlot } = deriveDayAndSlot(
            row.updated_at,
            row.edition_day,
            row.edition_slot
          );
          const key = `${editionDay}_${editionSlot}`;
          if (seenDaySlot.has(key)) continue;
          seenDaySlot.add(key);

          items.push({
            id: row.id,
            editionDay,
            editionDate: row.edition_date,
            editionSlot,
            updatedAt: row.updated_at,
            sourcesChecked: row.sources_checked,
            sourcesSucceeded: row.sources_succeeded,
            storyCount: row.story_ids.length,
          });
        }

        items.sort((a, b) => {
          if (a.editionDay !== b.editionDay) {
            return b.editionDay.localeCompare(a.editionDay);
          }
          return SLOT_SORT_WEIGHT[b.editionSlot] - SLOT_SORT_WEIGHT[a.editionSlot];
        });

        if (items.length > 0) return items;
      }
    } catch {
      // Fall through to local fallback
    }
  }

  if (store.edition) {
    const { editionDay, editionSlot } = deriveDayAndSlot(
      store.edition.updatedAt,
      store.edition.editionDay,
      store.edition.editionSlot
    );
    return [
      {
        id: store.edition.id ?? store.edition.updatedAt,
        editionDay,
        editionDate: store.edition.editionDate,
        editionSlot,
        updatedAt: store.edition.updatedAt,
        sourcesChecked: store.edition.sourcesChecked,
        sourcesSucceeded: store.edition.sourcesSucceeded,
        storyCount: store.edition.stories.length,
      },
    ];
  }

  return [];
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
      const { editionDay, editionSlot } = deriveDayAndSlot(
        edition.updatedAt,
        edition.editionDay,
        edition.editionSlot
      );
      await fetchWithRetry(`${cfg.url}/rest/v1/rpc/save_meridian_edition`, {
        method: 'POST',
        headers: buildSupabaseHeaders(cfg.key, true),
        body: JSON.stringify({
          p_secret: cfg.writeSecret,
          p_edition: {
            id: edition.id ?? edition.updatedAt,
            updatedAt: edition.updatedAt,
            editionDate: edition.editionDate,
            editionDay,
            editionSlot,
            sourcesChecked: edition.sourcesChecked,
            sourcesSucceeded: edition.sourcesSucceeded,
            activeSourceNames: edition.activeSourceNames,
            storyIds: edition.stories.map((s) => s.id),
          },
          p_stories: edition.stories,
        }),
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
      const res = await fetchWithRetry(
        `${cfg.url}/rest/v1/meridian_deep_dives?select=id,title,section,standfirst,key_facts,sections,sources,editorial_note,synthesis_mode,search_queries_used,generated_at&id=eq.${encodeURIComponent(
          id
        )}&limit=1`,
        {
          headers: buildSupabaseHeaders(cfg.key),
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
      const res = await fetchWithRetry(
        `${cfg.url}/rest/v1/rpc/save_meridian_deep_dive`,
        {
          method: 'POST',
          headers: buildSupabaseHeaders(cfg.key, true),
          body: JSON.stringify({
            p_secret: cfg.writeSecret,
            p_article: article,
          }),
        }
      );
      if (!res.ok) {
        console.error(`Supabase saveDeepDive returned HTTP ${res.status}`);
      }
    } catch (err) {
      console.error('Supabase saveDeepDive warning:', err);
    }
  }
}
