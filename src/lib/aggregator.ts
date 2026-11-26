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
    name === 'category' ||
    name === 'media:content' ||
    name === 'media:thumbnail' ||
    name === 'media:group' ||
    name === 'enclosure',
});

const MAX_AGE_MS = 72 * 60 * 60 * 1000;

interface ParsedFeedEntry {
  title: string;
  link: string;
  description: string;
  publishedAt: string;
  imageUrl?: string;
  imageWidth?: number;
}

function decodeImageEntities(rawUrl: string): string {
  return rawUrl
    .replace(/&amp;/gi, '&')
    .replace(/&#38;/g, '&')
    .trim();
}

export function isValidEditorialImageUrl(rawUrl: string, baseUrl?: string): boolean {
  if (!rawUrl) return false;
  const decoded = decodeImageEntities(rawUrl);
  if (
    /(logo|favicon|avatar|placeholder|default[-_]image|1x1|spacer|pixel|badge|sprite|brandmark)/i.test(
      decoded
    )
  ) {
    return false;
  }
  try {
    const parsed = baseUrl ? new URL(decoded, baseUrl) : new URL(decoded);
    if (parsed.protocol !== 'https:') return false;
    const cleanPath = parsed.pathname.toLowerCase();
    if (
      cleanPath.endsWith('.svg') ||
      cleanPath.endsWith('.ico') ||
      cleanPath.endsWith('.gif')
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function isLowResThumbnailUrl(url: string): boolean {
  return /\/240\/|[?&](?:w|width)=240\b|\/w:240\//i.test(url);
}

interface ImageCandidate {
  url: string;
  width: number;
  isThumbnail: boolean;
}

function normalizeImageUrl(rawUrl: string, baseUrl?: string): string | undefined {
  const decoded = decodeImageEntities(rawUrl);
  if (!isValidEditorialImageUrl(decoded, baseUrl)) return undefined;
  try {
    return (baseUrl ? new URL(decoded, baseUrl) : new URL(decoded)).toString();
  } catch {
    return undefined;
  }
}

function collectMediaNodes(
  nodes: unknown,
  candidates: ImageCandidate[],
  options: { isThumbnail?: boolean; checkImageType?: boolean } = {}
): void {
  const list = Array.isArray(nodes) ? nodes : nodes ? [nodes] : [];
  for (const node of list) {
    if (typeof node !== 'object' || node === null) continue;
    const rec = node as Record<string, unknown>;
    const rawUrl =
      typeof rec['@_url'] === 'string'
        ? rec['@_url']
        : typeof rec['@_href'] === 'string'
          ? rec['@_href']
          : '';
    if (!rawUrl) continue;

    if (options.checkImageType) {
      const mime = typeof rec['@_type'] === 'string' ? rec['@_type'].toLowerCase() : '';
      const cleanPath = rawUrl.split('?')[0].toLowerCase();
      const looksLikeImage =
        mime.startsWith('image/') ||
        cleanPath.endsWith('.jpg') ||
        cleanPath.endsWith('.jpeg') ||
        cleanPath.endsWith('.png') ||
        cleanPath.endsWith('.webp');
      if (!looksLikeImage) continue;
    } else if (typeof rec['@_medium'] === 'string') {
      const medium = rec['@_medium'].toLowerCase();
      if (medium && medium !== 'image') continue;
    }

    const validUrl = normalizeImageUrl(rawUrl);
    if (!validUrl) continue;

    const widthRaw = rec['@_width'];
    const parsedWidth =
      typeof widthRaw === 'number'
        ? widthRaw
        : typeof widthRaw === 'string'
          ? Number.parseInt(widthRaw, 10)
          : 0;
    const width = Number.isFinite(parsedWidth) && parsedWidth > 0 ? parsedWidth : 0;

    candidates.push({
      url: validUrl,
      width,
      isThumbnail: Boolean(options.isThumbnail),
    });
  }
}

function extractImageFromFeedItem(
  rec: Record<string, unknown>,
  htmlFields: string[]
): { url?: string; width?: number } {
  const candidates: ImageCandidate[] = [];

  collectMediaNodes(rec['media:content'], candidates, { isThumbnail: false });

  const mediaGroups = Array.isArray(rec['media:group'])
    ? rec['media:group']
    : rec['media:group']
      ? [rec['media:group']]
      : [];
  for (const grp of mediaGroups) {
    if (typeof grp === 'object' && grp !== null) {
      const grpRec = grp as Record<string, unknown>;
      collectMediaNodes(grpRec['media:content'], candidates, { isThumbnail: false });
      collectMediaNodes(grpRec['media:thumbnail'], candidates, { isThumbnail: true });
    }
  }

  collectMediaNodes(rec['media:thumbnail'], candidates, { isThumbnail: true });
  collectMediaNodes(rec.enclosure, candidates, {
    isThumbnail: false,
    checkImageType: true,
  });

  for (const html of htmlFields) {
    if (!html) continue;
    const matches = html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi);
    for (const m of matches) {
      const validUrl = normalizeImageUrl(m[1]);
      if (validUrl) {
        candidates.push({ url: validUrl, width: 0, isThumbnail: false });
      }
    }
  }

  if (candidates.length === 0) return {};

  candidates.sort((a, b) => {
    const aLow = isLowResThumbnailUrl(a.url) ? 1 : 0;
    const bLow = isLowResThumbnailUrl(b.url) ? 1 : 0;
    if (aLow !== bLow) return aLow - bLow;

    const aHi = a.width >= 600 ? 1 : 0;
    const bHi = b.width >= 600 ? 1 : 0;
    if (aHi !== bHi) return bHi - aHi;

    if (a.width !== b.width) return b.width - a.width;
    if (a.isThumbnail !== b.isThumbnail) return a.isThumbnail ? 1 : -1;
    return 0;
  });

  const best = candidates[0];
  return {
    url: best.url,
    width: best.width > 0 ? best.width : undefined,
  };
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
    const contentEncoded = extractTextField(rec['content:encoded']);
    const rawDescription = extractTextField(rec.description);
    const rawSummary = extractTextField(rec.summary);
    const description = rawDescription || contentEncoded || rawSummary;
    const pubDate =
      extractTextField(rec.pubDate) ||
      extractTextField(rec['dc:date']) ||
      extractTextField(rec.published);

    if (title && link) {
      const img = extractImageFromFeedItem(rec, [
        contentEncoded,
        rawDescription,
        rawSummary,
      ]);
      results.push({
        title,
        link,
        description,
        publishedAt: safeIsoDate(pubDate),
        imageUrl: img.url,
        imageWidth: img.width,
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
      const rawSummary = extractTextField(rec.summary);
      const rawContent = extractTextField(rec.content);
      const description = rawSummary || rawContent;
      const pubDate =
        extractTextField(rec.updated) || extractTextField(rec.published);

      if (title && link) {
        const img = extractImageFromFeedItem(rec, [rawContent, rawSummary]);
        results.push({
          title,
          link,
          description,
          publishedAt: safeIsoDate(pubDate),
          imageUrl: img.url,
          imageWidth: img.width,
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
      imageUrl: entry.imageUrl,
      imageWidth: entry.imageWidth,
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

    const summaryText = primary.snippet
      ? summarizeToConcise(primary.snippet, 250)
      : '';

    const imageMembers = sortedMembers.filter((m) => Boolean(m.imageUrl));
    imageMembers.sort((a, b) => {
      const aLow = a.imageUrl && isLowResThumbnailUrl(a.imageUrl) ? 1 : 0;
      const bLow = b.imageUrl && isLowResThumbnailUrl(b.imageUrl) ? 1 : 0;
      if (aLow !== bLow) return aLow - bLow;
      return (b.imageWidth ?? 0) - (a.imageWidth ?? 0);
    });
    const imageMember = imageMembers[0];

    summaries.push({
      id: makeStoryId(primary.title),
      title: primary.title,
      summary: summaryText,
      section,
      publishedAt: latestPublished,
      sources,
      primarySource: primary.name,
      score,
      imageUrl: imageMember?.imageUrl,
      imageSource: imageMember?.imageUrl ? imageMember.name : undefined,
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
    uk: 12,
    world: 16,
    business: 9,
    tech: 9,
    environment: 8,
  };

  const selected: StorySummary[] = [];
  const usedIds = new Set<string>();

  for (const cat of categories) {
    const pool = allStories
      .filter((s) => s.section === cat)
      .sort((a, b) => b.score - a.score);

    const catPicked: StorySummary[] = [];
    const outletCounts: Record<string, number> = {};
    const maxPerOutlet = targetPerCategory[cat] >= 12 ? 4 : 3;

    // First pass: ensure publisher diversity within each section
    for (const story of pool) {
      if (catPicked.length >= targetPerCategory[cat]) break;
      const count = outletCounts[story.primarySource] ?? 0;
      if (count >= maxPerOutlet && pool.length > targetPerCategory[cat]) continue;
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

const OG_META_KEYS = ['og:image:secure_url', 'og:image', 'twitter:image'];

function extractMetaImageFromHtml(html: string, baseUrl: string): string | undefined {
  for (const metaKey of OG_META_KEYS) {
    const forward = new RegExp(
      `<meta[^>]+(?:property|name)=["']${metaKey}["'][^>]+content=["']([^"']+)["']`,
      'i'
    );
    const reverse = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${metaKey}["']`,
      'i'
    );
    const rawMatch = html.match(forward)?.[1] ?? html.match(reverse)?.[1];
    if (rawMatch) {
      const normalized = normalizeImageUrl(rawMatch, baseUrl);
      if (normalized) return normalized;
    }
  }
  return undefined;
}

async function fetchOgImage(articleUrl: string): Promise<string | undefined> {
  try {
    const res = await fetch(articleUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(3000),
      cache: 'no-store',
    });
    if (!res.ok) return undefined;
    const html = await res.text();
    return extractMetaImageFromHtml(html, res.url || articleUrl);
  } catch {
    return undefined;
  }
}

async function enrichFeaturedStoryImages(stories: StorySummary[]): Promise<void> {
  if (stories.length === 0) return;

  const categories: StoryCategory[] = [
    'uk',
    'world',
    'business',
    'tech',
    'environment',
  ];

  // Mirror FrontPageClient's Option A photo slots so every featured slot gets a sharp image
  const lead =
    stories.find(
      (s) =>
        s.sources.length >= 2 && (s.section === 'uk' || s.section === 'world')
    ) ?? stories[0];

  const aboveFoldUsed = new Set<string>([lead.id]);
  const remaining = stories.filter((s) => !aboveFoldUsed.has(s.id));
  const leftTop = remaining[0];
  remaining.slice(0, 10).forEach((s) => aboveFoldUsed.add(s.id));

  const targetMap = new Map<string, StorySummary>();
  targetMap.set(lead.id, lead);
  if (leftTop) targetMap.set(leftTop.id, leftTop);

  for (const cat of categories) {
    const sectionFolioLead = stories.find(
      (s) => s.section === cat && !aboveFoldUsed.has(s.id)
    );
    if (sectionFolioLead) targetMap.set(sectionFolioLead.id, sectionFolioLead);

    const sectionTabLead = stories.find((s) => s.section === cat);
    if (sectionTabLead) targetMap.set(sectionTabLead.id, sectionTabLead);
  }

  const candidates = Array.from(targetMap.values())
    .filter((s) => !s.imageUrl || isLowResThumbnailUrl(s.imageUrl))
    .slice(0, 10);

  await Promise.allSettled(
    candidates.map(async (story) => {
      const directSources = story.sources.filter(
        (src) => !src.url.includes('news.google.com')
      );
      for (const src of directSources.slice(0, 2)) {
        const ogUrl = await fetchOgImage(src.url);
        if (ogUrl) {
          story.imageUrl = ogUrl;
          story.imageSource = src.name;
          break;
        }
      }
    })
  );
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
  await enrichFeaturedStoryImages(curated);

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
