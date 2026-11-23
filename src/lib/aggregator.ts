import { XMLParser } from 'fast-xml-parser';
import {
  RSS_FEEDS,
  type FeedConfig,
  getReputableMeta,
  isFactualNewsUrl,
} from './sources';
import { getCachedRawArticles, saveEdition } from './storage';
import {
  cleanHeadline,
  cleanPromoText,
  computeSimilarity,
  extractKeywords,
  makeStoryId,
  summarizeToConcise,
} from './text-utils';
import type {
  Edition,
  RawArticle,
  StoryCategory,
  StorySource,
  StorySummary,
  UpdateStats,
} from './types';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  trimValues: true,
  isArray: (name) =>
    name === 'item' ||
    name === 'entry' ||
    name === 'link' ||
    name === 'category',
});

const MAX_AGE_MS = 72 * 60 * 60 * 1000;

interface ParsedFeedEntry {
  title: string;
  link: string;
  description: string;
  publishedAt: string;
}

function extractEntryLink(rawLink: unknown): string {
  if (typeof rawLink === 'string') return rawLink.trim();
  if (Array.isArray(rawLink)) {
    const alternate = rawLink.find(
      (item) =>
        typeof item === 'object' &&
        item !== null &&
        (!('@_rel' in item) || (item as Record<string, string>)['@_rel'] === 'alternate')
    );
    const chosen = alternate ?? rawLink[0];
    if (typeof chosen === 'string') return chosen.trim();
    if (typeof chosen === 'object' && chosen !== null) {
      const rec = chosen as Record<string, unknown>;
      if (typeof rec['@_href'] === 'string') return rec['@_href'].trim();
      if (typeof rec['#text'] === 'string') return rec['#text'].trim();
    }
  }
  if (typeof rawLink === 'object' && rawLink !== null) {
    const rec = rawLink as Record<string, unknown>;
    if (typeof rec['@_href'] === 'string') return rec['@_href'].trim();
    if (typeof rec['#text'] === 'string') return rec['#text'].trim();
  }
  return '';
}

function extractTextField(val: unknown): string {
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (typeof val === 'object' && val !== null) {
    const rec = val as Record<string, unknown>;
    if (typeof rec['#text'] === 'string') return rec['#text'];
    if (typeof rec['__cdata'] === 'string') return rec['__cdata'];
  }
  return '';
}

function safeIsoDate(rawDate: string): string {
  if (!rawDate) return new Date().toISOString();
  const parsed = Date.parse(rawDate);
  if (Number.isNaN(parsed)) return new Date().toISOString();
  // Guard against slightly future-skewed clocks
  const now = Date.now();
  const clamped = Math.min(parsed, now + 5 * 60 * 1000);
  return new Date(clamped).toISOString();
}

export function parseRssOrAtomXml(xml: string): ParsedFeedEntry[] {
  const doc = xmlParser.parse(xml) as Record<string, unknown>;
  const results: ParsedFeedEntry[] = [];

  const rss = doc.rss as Record<string, unknown> | undefined;
  const channel = rss?.channel as Record<string, unknown> | undefined;
  const rssItems = (channel?.item as unknown[]) ?? [];

  for (const item of rssItems) {
    if (typeof item !== 'object' || item === null) continue;
    const rec = item as Record<string, unknown>;
    const title = extractTextField(rec.title);
    const link = extractEntryLink(rec.link);
    const description =
      extractTextField(rec.description) ||
      extractTextField(rec['content:encoded']) ||
      extractTextField(rec.summary);
    const pubDate =
      extractTextField(rec.pubDate) ||
      extractTextField(rec['dc:date']) ||
      extractTextField(rec.published);

    if (title && link) {
      results.push({
        title,
        link,
        description,
        publishedAt: safeIsoDate(pubDate),
      });
    }
  }

  if (results.length === 0) {
    const feed = doc.feed as Record<string, unknown> | undefined;
    const entries = (feed?.entry as unknown[]) ?? [];
    for (const entry of entries) {
      if (typeof entry !== 'object' || entry === null) continue;
      const rec = entry as Record<string, unknown>;
      const title = extractTextField(rec.title);
      const link = extractEntryLink(rec.link);
      const description =
        extractTextField(rec.summary) || extractTextField(rec.content);
      const pubDate =
        extractTextField(rec.updated) || extractTextField(rec.published);

      if (title && link) {
        results.push({
          title,
          link,
          description,
          publishedAt: safeIsoDate(pubDate),
        });
      }
    }
  }

  return results;
}

async function fetchSingleFeed(feed: FeedConfig): Promise<RawArticle[]> {
  const res = await fetch(feed.url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; TheMeridianPress/1.0)',
      Accept: 'application/rss+xml, application/xml, text/xml, */*',
    },
    signal: AbortSignal.timeout(6500),
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${feed.name}`);
  }

  const xml = await res.text();
  const entries = parseRssOrAtomXml(xml);
  const now = Date.now();
  const articles: RawArticle[] = [];

  for (const entry of entries.slice(0, 22)) {
    const title = cleanHeadline(entry.title);
    if (!title || title.length < 18) continue;
    if (!isFactualNewsUrl(entry.link, title)) continue;

    const ageMs = now - Date.parse(entry.publishedAt);
    if (ageMs > MAX_AGE_MS) continue;

    // For non-Google-proxy feeds, keep only matching reputable domains if redirected
    const meta = feed.isGoogleProxy
      ? {
          name: feed.name,
          domain: feed.domain,
          region: feed.region,
          type: feed.type,
        }
      : getReputableMeta(entry.link) ?? {
          name: feed.name,
          domain: feed.domain,
          region: feed.region,
          type: feed.type,
        };

    const rawSnippet = cleanPromoText(entry.description);
    // Google News RSS descriptions often just echo "<headline> <Outlet>"
    const echoesHeadline =
      rawSnippet.toLowerCase().startsWith(title.toLowerCase().slice(0, 32)) &&
      rawSnippet.length < title.length + 35;
    const snippet =
      (feed.isGoogleProxy && (rawSnippet.length < 40 || echoesHeadline)) ||
      echoesHeadline
        ? ''
        : rawSnippet;

    const { tokens, properNouns } = extractKeywords(`${title} ${snippet.slice(0, 140)}`);
    if (tokens.length < 2) continue;

    articles.push({
      id: makeStoryId(title),
      title,
      snippet,
      url: entry.link,
      publishedAt: entry.publishedAt,
      section: feed.section,
      name: meta.name,
      domain: meta.domain,
      region: meta.region,
      type: meta.type,
      tokens,
      properNouns,
    });
  }

  return articles;
}

interface StoryCluster {
  lead: RawArticle;
  members: RawArticle[];
  sectionCounts: Record<StoryCategory, number>;
}

function clusterArticles(articles: RawArticle[]): StorySummary[] {
  // Deduplicate identical URLs or identical titles from the same outlet
  const seenKeys = new Set<string>();
  const uniqueArticles: RawArticle[] = [];

  const sorted = [...articles].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt)
  );

  for (const article of sorted) {
    const key = `${article.name}::${article.title.toLowerCase()}`;
    if (seenKeys.has(key) || seenKeys.has(article.url)) continue;
    seenKeys.add(key);
    seenKeys.add(article.url);
    uniqueArticles.push(article);
  }

  const clusters: StoryCluster[] = [];

  for (const article of uniqueArticles) {
    let matchedCluster: StoryCluster | null = null;
    let bestSim = 0;

    for (const cluster of clusters) {
      const sim = computeSimilarity(
        article.tokens,
        article.properNouns,
        cluster.lead.tokens,
        cluster.lead.properNouns
      );
      if (sim >= 0.42 && sim > bestSim) {
        bestSim = sim;
        matchedCluster = cluster;
      }
    }

    if (matchedCluster) {
      const alreadyHasOutlet = matchedCluster.members.some(
        (m) => m.name === article.name
      );
      if (!alreadyHasOutlet) {
        matchedCluster.members.push(article);
        matchedCluster.sectionCounts[article.section] =
          (matchedCluster.sectionCounts[article.section] ?? 0) + 1;
      }
    } else {
      clusters.push({
        lead: article,
        members: [article],
        sectionCounts: {
          uk: article.section === 'uk' ? 1 : 0,
          world: article.section === 'world' ? 1 : 0,
          business: article.section === 'business' ? 1 : 0,
          tech: article.section === 'tech' ? 1 : 0,
          environment: article.section === 'environment' ? 1 : 0,
        },
      });
    }
  }

  const now = Date.now();
  const summaries: StorySummary[] = [];

  for (const cluster of clusters) {
    // Prefer a member with a clean substantive snippet as display lead
    const sortedMembers = [...cluster.members].sort((a, b) => {
      const aHasSnippet = a.snippet.length >= 60 ? 1 : 0;
      const bHasSnippet = b.snippet.length >= 60 ? 1 : 0;
      if (aHasSnippet !== bHasSnippet) return bHasSnippet - aHasSnippet;
      return b.publishedAt.localeCompare(a.publishedAt);
    });

    const primary = sortedMembers[0];
    // Pick the section most represented in the cluster (with UK priority for ties)
    const sectionEntries = Object.entries(cluster.sectionCounts) as [
      StoryCategory,
      number,
    ][];
    sectionEntries.sort((a, b) => b[1] - a[1]);
    const section = sectionEntries[0][1] > 0 ? sectionEntries[0][0] : primary.section;

    const latestPublished = sortedMembers.reduce(
      (acc, m) => (m.publishedAt > acc ? m.publishedAt : acc),
      primary.publishedAt
    );

    const hoursOld = Math.max(
      0.2,
      (now - Date.parse(latestPublished)) / (1000 * 60 * 60)
    );
    const sourceCount = sortedMembers.length;
    const ukBonus = section === 'uk' ? 1.4 : 0;
    const snippetQuality = primary.snippet.length >= 80 ? 1.0 : 0.2;
    const recencyScore = Math.max(0, 12 - hoursOld * 0.45);
    const score = sourceCount * 6 + recencyScore + ukBonus + snippetQuality;

    const sources: StorySource[] = sortedMembers.map((m) => ({
      name: m.name,
      domain: m.domain,
      region: m.region,
      type: m.type,
      url: m.url,
      title: m.title,
      publishedAt: m.publishedAt,
      snippet: m.snippet,
    }));

    const summaryText =
      (primary.snippet && summarizeToConcise(primary.snippet, 250)) ||
      `Reported by ${sortedMembers.map((m) => m.name).join(' and ')}. Open to search reputable outlets for the full multi-source dispatch.`;

    summaries.push({
      id: makeStoryId(primary.title),
      title: primary.title,
      summary: summaryText,
      section,
      publishedAt: latestPublished,
      sources,
      primarySource: primary.name,
      score,
    });
  }

  return summaries;
}

function curateBalancedEdition(allStories: StorySummary[]): StorySummary[] {
  const categories: StoryCategory[] = [
    'uk',
    'world',
    'business',
    'tech',
    'environment',
  ];
  const targetPerCategory: Record<StoryCategory, number> = {
    uk: 10,
    world: 12,
    business: 8,
    tech: 8,
    environment: 7,
  };

  const selected: StorySummary[] = [];
  const usedIds = new Set<string>();

  for (const cat of categories) {
    const pool = allStories
      .filter((s) => s.section === cat)
      .sort((a, b) => b.score - a.score);

    const catPicked: StorySummary[] = [];
    const outletCounts: Record<string, number> = {};

    // First pass: ensure publisher diversity within each section
    for (const story of pool) {
      if (catPicked.length >= targetPerCategory[cat]) break;
      const count = outletCounts[story.primarySource] ?? 0;
      if (count >= 3 && pool.length > targetPerCategory[cat]) continue;
      catPicked.push(story);
      usedIds.add(story.id);
      outletCounts[story.primarySource] = count + 1;
    }

    // Second pass: fill remaining slots if needed
    for (const story of pool) {
      if (catPicked.length >= targetPerCategory[cat]) break;
      if (!usedIds.has(story.id)) {
        catPicked.push(story);
        usedIds.add(story.id);
      }
    }

    selected.push(...catPicked);
  }

  // Sort overall by score descending so lead story selection is crisp
  return selected.sort((a, b) => b.score - a.score);
}

export function formatEditionDate(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export async function fetchLatestEdition(
  previousIds?: Set<string>
): Promise<{ edition: Edition; stats: UpdateStats }> {
  const start = Date.now();
  const settled = await Promise.allSettled(
    RSS_FEEDS.map((feed) => fetchSingleFeed(feed))
  );

  const rawArticles: RawArticle[] = [];
  let sourcesSucceeded = 0;
  const activeSourceSet = new Set<string>();

  settled.forEach((result, idx) => {
    if (result.status === 'fulfilled') {
      sourcesSucceeded++;
      if (result.value.length > 0) {
        activeSourceSet.add(RSS_FEEDS[idx].name);
      }
      rawArticles.push(...result.value);
    }
  });

  const clustered = clusterArticles(rawArticles);
  const curated = curateBalancedEdition(clustered);

  const now = new Date();
  const edition: Edition = {
    updatedAt: now.toISOString(),
    editionDate: formatEditionDate(now),
    stories: curated,
    sourcesChecked: RSS_FEEDS.length,
    sourcesSucceeded,
    activeSourceNames: Array.from(activeSourceSet).sort(),
  };

  let newStoriesCount = curated.length;
  if (previousIds && previousIds.size > 0) {
    newStoriesCount = curated.filter((s) => !previousIds.has(s.id)).length;
  }

  await saveEdition(edition, rawArticles);

  return {
    edition,
    stats: {
      newStoriesCount,
      totalStoriesCount: curated.length,
      sourcesChecked: RSS_FEEDS.length,
      sourcesSucceeded,
      durationMs: Date.now() - start,
    },
  };
}

export function findMatchingPoolArticles(
  title: string,
  excludeUrls: Set<string>
): RawArticle[] {
  const pool = getCachedRawArticles();
  if (pool.length === 0) return [];

  const { tokens, properNouns } = extractKeywords(title);
  const scored = pool
    .filter((item) => !excludeUrls.has(item.url))
    .map((item) => ({
      item,
      sim: computeSimilarity(tokens, properNouns, item.tokens, item.properNouns),
    }))
    .filter((entry) => entry.sim >= 0.36)
    .sort((a, b) => b.sim - a.sim);

  return scored.slice(0, 6).map((s) => s.item);
}
