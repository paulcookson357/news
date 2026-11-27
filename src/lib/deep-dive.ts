import { findMatchingPoolArticles, parseRssOrAtomXml } from './aggregator';
import { extractArticleText } from './article-extractor';
import {
  extractBingTargetUrl,
  getReputableMeta,
  isFactualNewsUrl,
} from './sources';
import { loadDeepDive, saveDeepDive } from './storage';
import { synthesizeBroadsheetReport, type SourceMaterial } from './synthesizer';
import {
  buildSearchQueries,
  cleanHeadline,
  cleanPromoText,
  computeSimilarity,
  extractKeywords,
} from './text-utils';
import type {
  DeepDiveArticle,
  SourceMeta,
  StoryCategory,
  StorySource,
} from './types';

export interface DeepDiveInput {
  id: string;
  title: string;
  summary: string;
  section: StoryCategory;
  publishedAt: string;
  sources: StorySource[];
}

interface SearchCandidate {
  meta: SourceMeta;
  title: string;
  url: string;
  publishedAt: string;
  snippet: string;
  relevance: number;
}

const SCOPED_SITES =
  'site:bbc.co.uk OR site:theguardian.com OR site:apnews.com OR site:npr.org OR site:aljazeera.com OR site:dw.com OR site:france24.com OR site:news.sky.com OR site:pbs.org OR site:cnbc.com OR site:straitstimes.com OR site:politico.eu';

const inFlightDeepDives = new Map<string, Promise<DeepDiveArticle>>();

function isInternalPlaceholder(text?: string): boolean {
  if (!text) return false;
  return /^Reported by .*Open to search reputable outlets/i.test(text.trim());
}

async function searchRssEndpoint(
  url: string,
  isBing: boolean
): Promise<Array<{ title: string; url: string; publishedAt: string; snippet: string }>> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
      signal: AbortSignal.timeout(5500),
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const entries = parseRssOrAtomXml(xml);

    return entries.slice(0, 14).map((entry) => ({
      title: cleanHeadline(entry.title),
      url: isBing ? extractBingTargetUrl(entry.link) : entry.link,
      publishedAt: entry.publishedAt,
      snippet: cleanPromoText(entry.description),
    }));
  } catch {
    return [];
  }
}

export async function buildDeepDiveReport(
  input: DeepDiveInput,
  forceRefresh = false
): Promise<DeepDiveArticle> {
  if (!forceRefresh) {
    const cached = await loadDeepDive(input.id);
    if (cached) return cached;

    const existingPromise = inFlightDeepDives.get(input.id);
    if (existingPromise) return existingPromise;
  }

  const runPromise = generateAndPersistDeepDive(input).finally(() => {
    inFlightDeepDives.delete(input.id);
  });

  if (!forceRefresh) {
    inFlightDeepDives.set(input.id, runPromise);
  }

  return runPromise;
}

async function generateAndPersistDeepDive(
  input: DeepDiveInput
): Promise<DeepDiveArticle> {

  const queries = buildSearchQueries(input.title);
  const primaryQuery = queries[0] ?? input.title;
  const compactQuery = queries[1] ?? primaryQuery;
  const broadQuery = queries[2] ?? compactQuery;
  const cleanSummary = isInternalPlaceholder(input.summary) ? '' : input.summary;

  const bingPrimaryUrl = `https://www.bing.com/news/search?q=${encodeURIComponent(
    primaryQuery
  )}&format=rss`;
  const bingCompactUrl =
    compactQuery !== primaryQuery
      ? `https://www.bing.com/news/search?q=${encodeURIComponent(
          compactQuery
        )}&format=rss`
      : null;
  const bingScopedUrl = `https://www.bing.com/news/search?q=${encodeURIComponent(
    `(${SCOPED_SITES}) ${compactQuery}`
  )}&format=rss`;
  const googleNewsUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
    `${compactQuery} when:7d`
  )}&hl=en-GB&gl=GB&ceid=GB:en`;

  // Execute live second internet search across multiple free news indices in parallel
  const [bingPrimaryHits, bingCompactHits, bingScopedHits, googleHits] =
    await Promise.all([
      searchRssEndpoint(bingPrimaryUrl, true),
      bingCompactUrl ? searchRssEndpoint(bingCompactUrl, true) : Promise.resolve([]),
      searchRssEndpoint(bingScopedUrl, true),
      searchRssEndpoint(googleNewsUrl, false),
    ]);

  const storyKeywords = extractKeywords(`${cleanHeadline(input.title)} ${cleanSummary}`);
  const candidateMap = new Map<string, SearchCandidate>();

  const MAX_DEEP_DIVE_AGE_MS = 14 * 24 * 60 * 60 * 1000;
  const nowMs = Date.now();

  const registerCandidate = (
    meta: SourceMeta,
    title: string,
    url: string,
    publishedAt: string,
    snippet: string,
    baseBoost = 0
  ) => {
    if (!url || !title || !isFactualNewsUrl(url, title)) return;

    const pubMs = Date.parse(publishedAt);
    if (baseBoost === 0 && !Number.isNaN(pubMs) && nowMs - pubMs > MAX_DEEP_DIVE_AGE_MS) {
      return;
    }

    const itemKw = extractKeywords(`${title} ${snippet.slice(0, 120)}`);
    const sim = computeSimilarity(
      storyKeywords.tokens,
      storyKeywords.properNouns,
      itemKw.tokens,
      itemKw.properNouns
    );

    if (baseBoost === 0 && sim < 0.18) return;

    const existing = candidateMap.get(meta.name);
    const totalScore = sim + baseBoost;
    // Prefer direct reputable URLs over Google News proxy redirects when available
    const isGoogleWrapper = url.includes('news.google.com');
    const existingIsWrapper = existing?.url.includes('news.google.com') ?? false;

    if (
      !existing ||
      (existingIsWrapper && !isGoogleWrapper) ||
      (existingIsWrapper === isGoogleWrapper && totalScore > existing.relevance)
    ) {
      candidateMap.set(meta.name, {
        meta,
        title,
        url,
        publishedAt,
        snippet,
        relevance: totalScore,
      });
    }
  };

  // 1. Seed with the story's original front-page sources
  for (const src of input.sources) {
    const srcSnippet = isInternalPlaceholder(src.snippet) ? '' : src.snippet ?? cleanSummary;
    registerCandidate(
      {
        name: src.name,
        domain: src.domain,
        region: src.region,
        type: src.type,
      },
      src.title,
      src.url,
      src.publishedAt,
      srcSnippet,
      1.0
    );
  }

  // 2. Add cross-matched articles from our live RSS edition pool
  const existingUrls = new Set(input.sources.map((s) => s.url));
  const poolMatches = findMatchingPoolArticles(cleanHeadline(input.title), existingUrls);
  for (const item of poolMatches) {
    registerCandidate(
      {
        name: item.name,
        domain: item.domain,
        region: item.region,
        type: item.type,
      },
      item.title,
      item.url,
      item.publishedAt,
      item.snippet,
      0.35
    );
  }

  // 3. Process live Bing News RSS hits (reputable domains only)
  for (const hit of [...bingScopedHits, ...bingPrimaryHits, ...bingCompactHits]) {
    const meta = getReputableMeta(hit.url);
    if (!meta) continue;
    registerCandidate(meta, hit.title, hit.url, hit.publishedAt, hit.snippet);
  }

  // 4. Process live Google News hits if publisher suffix matches a reputable outlet
  for (const hit of googleHits) {
    const match = hit.snippet.match(
      /(BBC News|BBC|The Guardian|Sky News|Associated Press|AP News|Reuters|NPR|PBS NewsHour|Al Jazeera|Deutsche Welle|DW|France 24|ABC News|Ars Technica|Euronews|CBC News|CNBC|FXStreet|The Straits Times|Politico|CBS News|NBC News|RTÉ)/i
    );
    if (!match) continue;
    const matchedName = match[1];
    // Only add if we don't already have that publisher with a direct URL
    const alreadyPresent = Array.from(candidateMap.keys()).some((k) =>
      k.toLowerCase().includes(matchedName.toLowerCase().replace(/^the\s+/, ''))
    );
    if (alreadyPresent) continue;

    const syntheticMeta: SourceMeta = {
      name: matchedName === 'DW' ? 'Deutsche Welle' : matchedName,
      domain: 'news.google.com',
      region: 'International',
      type: 'Verified Publisher',
    };
    registerCandidate(
      syntheticMeta,
      hit.title,
      hit.url,
      hit.publishedAt,
      hit.snippet
    );
  }

  // Select up to 6 distinct publishers, prioritizing regional & editorial balance
  const selectedCandidates = Array.from(candidateMap.values())
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, 6);

  // Extract full article text in parallel across selected reputable URLs
  const materials: SourceMaterial[] = await Promise.all(
    selectedCandidates.map(async (candidate) => {
      const isDirectReputable =
        candidate.url && !candidate.url.includes('news.google.com');
      const extracted = isDirectReputable
        ? await extractArticleText(candidate.url)
        : null;

      if (extracted && extracted.paragraphs.length > 0) {
        return {
          meta: candidate.meta,
          title: candidate.title,
          url: candidate.url,
          publishedAt: candidate.publishedAt,
          paragraphs: extracted.paragraphs,
          snippet: candidate.snippet,
          wordCount: extracted.wordCount,
          fetchStatus: 'extracted' as const,
        };
      }

      const fallbackWords = candidate.snippet
        ? candidate.snippet.split(/\s+/).filter(Boolean).length
        : 0;

      return {
        meta: candidate.meta,
        title: candidate.title,
        url: candidate.url,
        publishedAt: candidate.publishedAt,
        paragraphs: [],
        snippet: candidate.snippet || cleanSummary,
        wordCount: fallbackWords,
        fetchStatus: 'snippet' as const,
      };
    })
  );

  // If no source allowed full-text extraction (e.g. Cloudflare/paywall blocks),
  // run a broader fallback search across reputable free domains.
  const hasExtractedText = materials.some((m) => m.fetchStatus === 'extracted');
  if (!hasExtractedText && broadQuery) {
    const fallbackUrl = `https://www.bing.com/news/search?q=${encodeURIComponent(
      broadQuery
    )}&format=rss`;
    const fallbackHits = await searchRssEndpoint(fallbackUrl, true);
    const seenUrls = new Set(materials.map((m) => m.url));
    const extraCandidates: SearchCandidate[] = [];

    for (const hit of fallbackHits) {
      if (seenUrls.has(hit.url) || !isFactualNewsUrl(hit.url, hit.title)) continue;
      const meta = getReputableMeta(hit.url);
      if (!meta) continue;
      const itemKw = extractKeywords(`${hit.title} ${hit.snippet.slice(0, 120)}`);
      const sim = computeSimilarity(
        storyKeywords.tokens,
        storyKeywords.properNouns,
        itemKw.tokens,
        itemKw.properNouns
      );
      if (sim < 0.16) continue;
      seenUrls.add(hit.url);
      extraCandidates.push({
        meta,
        title: hit.title,
        url: hit.url,
        publishedAt: hit.publishedAt,
        snippet: hit.snippet,
        relevance: sim,
      });
      if (extraCandidates.length >= 4) break;
    }

    if (extraCandidates.length > 0) {
      const extraMaterials = await Promise.all(
        extraCandidates.map(async (cand) => {
          const extracted = await extractArticleText(cand.url);
          if (extracted && extracted.paragraphs.length > 0) {
            return {
              meta: cand.meta,
              title: cand.title,
              url: cand.url,
              publishedAt: cand.publishedAt,
              paragraphs: extracted.paragraphs,
              snippet: cand.snippet,
              wordCount: extracted.wordCount,
              fetchStatus: 'extracted' as const,
            };
          }
          return null;
        })
      );
      for (const extra of extraMaterials) {
        if (extra && !materials.some((m) => m.meta.name === extra.meta.name)) {
          materials.push(extra);
        }
      }
    }
  }

  const { synthesis, sourceDetails } = await synthesizeBroadsheetReport(
    cleanHeadline(input.title),
    input.section,
    cleanSummary,
    materials
  );

  const article: DeepDiveArticle = {
    id: input.id,
    title: cleanHeadline(input.title),
    section: input.section,
    standfirst: synthesis.standfirst,
    keyFacts: synthesis.keyFacts,
    sections: synthesis.sections,
    sources: sourceDetails,
    editorialNote: synthesis.editorialNote,
    synthesisMode: synthesis.synthesisMode,
    generatedAt: new Date().toISOString(),
    searchQueriesUsed: [primaryQuery, compactQuery, broadQuery].filter(
      (q, i, arr) => Boolean(q) && arr.indexOf(q) === i
    ),
  };

  await saveDeepDive(article);
  return article;
}
