import * as cheerio from 'cheerio';
import { getReputableMeta } from './sources';
import { cleanPromoText } from './text-utils';

export interface ExtractedArticle {
  paragraphs: string[];
  wordCount: number;
  author?: string;
}

const BOILERPLATE_PATTERNS = [
  /^sign up/i,
  /^subscribe/i,
  /^follow us/i,
  /^read more/i,
  /^related topics/i,
  /^more on this story/i,
  /^copyright\s+©/i,
  /^all rights reserved/i,
  /^this video can/i,
  /^javascript must be enabled/i,
  /^cookies?/i,
  /^advertisement/i,
  /^skip to/i,
  /^share this/i,
  /^image source/i,
  /^image caption/i,
  /^getty images/i,
  /^watch:/i,
  /^listen:/i,
  /^click here/i,
  /^if you have a story/i,
  /^do you have information/i,
  /^send your story/i,
  /newsletter/i,
  /guardian journalism is funded/i,
  /support the guardian/i,
  /bbc is not responsible for the content of external sites/i,
  /advertisement tracking/i,
  /audience measurement/i,
  /browser extensions? seems to be blocking/i,
  /video player from loading/i,
  /content you requested does not exist/i,
  /enable javascript/i,
  /\bDW has more\b/i,
  /^reporting by\b/i,
  /^additional reporting by\b/i,
  /^editing by\b/i,
  /^writing by\b/i,
  /^with files from\b/i,
];

function isCleanParagraph(text: string): boolean {
  if (text.length < 48) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 8) return false;
  // Require proper sentence-ending punctuation so embedded link teasers/headers are excluded
  if (!/[.!?]["”'’)]?$/.test(text)) return false;
  for (const pattern of BOILERPLATE_PATTERNS) {
    if (pattern.test(text)) return false;
  }
  return true;
}

export async function extractArticleText(
  rawUrl: string
): Promise<ExtractedArticle | null> {
  // Enforce reputable domain allowlist before making any outbound fetch
  const meta = getReputableMeta(rawUrl);
  if (!meta) return null;

  try {
    const res = await fetch(rawUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
      },
      signal: AbortSignal.timeout(5500),
      redirect: 'follow',
      cache: 'no-store',
    });

    if (!res.ok) return null;

    const finalMeta = getReputableMeta(res.url || rawUrl);
    if (!finalMeta) return null;

    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      return null;
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    // Remove non-article structural chrome and promo widgets
    $(
      [
        'script',
        'style',
        'noscript',
        'nav',
        'header',
        'footer',
        'aside',
        'form',
        'figure',
        'figcaption',
        'iframe',
        'svg',
        'button',
        '[role="navigation"]',
        '[role="banner"]',
        '[role="contentinfo"]',
        '.visually-hidden',
        '.sr-only',
        '[aria-hidden="true"]',
        '[data-component="links-block"]',
        '[data-component="topic-list"]',
        '[data-component="include-block"]',
        '[data-testid*="promo"]',
        '[data-testid*="related"]',
        '[class*="newsletter"]',
        '[class*="subscribe"]',
        '[class*="cookie"]',
        '[class*="related"]',
        '[class*="most-read"]',
      ].join(', ')
    ).remove();

    const author =
      $('meta[name="author"]').attr('content')?.trim() ||
      $('meta[property="article:author"]').attr('content')?.trim() ||
      undefined;

    const selectors = [
      'article [data-component="text-block"] p',
      'article .article-body p',
      'article .story-body p',
      'article .wysiwyg p',
      'article p',
      'main [role="main"] p',
      'main p',
      '[data-component="text-block"] p',
    ];

    const seen = new Set<string>();
    const paragraphs: string[] = [];

    for (const selector of selectors) {
      const nodes = $(selector);
      if (nodes.length === 0) continue;

      nodes.each((_, el) => {
        const cleaned = cleanPromoText($(el).text());
        if (!isCleanParagraph(cleaned)) return;
        const normalized = cleaned.toLowerCase();
        if (seen.has(normalized)) return;
        seen.add(normalized);
        paragraphs.push(cleaned);
      });

      if (paragraphs.length >= 5) break;
    }

    // Fallback to body paragraphs if semantic containers yielded very few
    if (paragraphs.length < 3) {
      $('body p').each((_, el) => {
        const cleaned = cleanPromoText($(el).text());
        if (!isCleanParagraph(cleaned)) return;
        const normalized = cleaned.toLowerCase();
        if (seen.has(normalized)) return;
        seen.add(normalized);
        paragraphs.push(cleaned);
      });
    }

    if (paragraphs.length === 0) return null;

    const limited = paragraphs.slice(0, 18);
    const wordCount = limited.reduce(
      (sum, p) => sum + p.split(/\s+/).filter(Boolean).length,
      0
    );

    return {
      paragraphs: limited,
      wordCount,
      author,
    };
  } catch {
    return null;
  }
}
