import type { SourceMeta, StoryCategory } from './types';

export interface FeedConfig extends SourceMeta {
  section: StoryCategory;
  url: string;
  isGoogleProxy?: boolean;
}

export const SECTION_LABELS: Record<StoryCategory | 'front', string> = {
  front: 'Front Page',
  uk: 'UK Affairs',
  world: 'World',
  business: 'Business & Economy',
  tech: 'Science & Tech',
  environment: 'Environment',
};

export const REPUTABLE_DOMAINS: Record<string, SourceMeta> = {
  'bbc.co.uk': {
    name: 'BBC News',
    domain: 'bbc.co.uk',
    region: 'United Kingdom',
    type: 'Public Broadcaster',
  },
  'bbc.com': {
    name: 'BBC News',
    domain: 'bbc.com',
    region: 'United Kingdom',
    type: 'Public Broadcaster',
  },
  'theguardian.com': {
    name: 'The Guardian',
    domain: 'theguardian.com',
    region: 'United Kingdom',
    type: 'Broadsheet Newspaper',
  },
  'news.sky.com': {
    name: 'Sky News',
    domain: 'news.sky.com',
    region: 'United Kingdom',
    type: 'Broadcast News',
  },
  'apnews.com': {
    name: 'Associated Press',
    domain: 'apnews.com',
    region: 'International',
    type: 'Wire Agency',
  },
  'reuters.com': {
    name: 'Reuters',
    domain: 'reuters.com',
    region: 'International',
    type: 'Wire Agency',
  },
  'npr.org': {
    name: 'NPR',
    domain: 'npr.org',
    region: 'United States',
    type: 'Public Broadcaster',
  },
  'pbs.org': {
    name: 'PBS NewsHour',
    domain: 'pbs.org',
    region: 'United States',
    type: 'Public Broadcaster',
  },
  'dw.com': {
    name: 'Deutsche Welle',
    domain: 'dw.com',
    region: 'Germany / Europe',
    type: 'Public Broadcaster',
  },
  'france24.com': {
    name: 'France 24',
    domain: 'france24.com',
    region: 'France / Europe',
    type: 'Public Broadcaster',
  },
  'aljazeera.com': {
    name: 'Al Jazeera',
    domain: 'aljazeera.com',
    region: 'Global / Doha',
    type: 'International Broadcaster',
  },
  'abc.net.au': {
    name: 'ABC News (AU)',
    domain: 'abc.net.au',
    region: 'Australia / Asia-Pacific',
    type: 'Public Broadcaster',
  },
  'cbc.ca': {
    name: 'CBC News',
    domain: 'cbc.ca',
    region: 'Canada',
    type: 'Public Broadcaster',
  },
  'euronews.com': {
    name: 'Euronews',
    domain: 'euronews.com',
    region: 'Europe',
    type: 'International Broadcaster',
  },
  'arstechnica.com': {
    name: 'Ars Technica',
    domain: 'arstechnica.com',
    region: 'International',
    type: 'Science & Tech Desk',
  },
  'independent.co.uk': {
    name: 'The Independent',
    domain: 'independent.co.uk',
    region: 'United Kingdom',
    type: 'Digital Broadsheet',
  },
  'irishtimes.com': {
    name: 'The Irish Times',
    domain: 'irishtimes.com',
    region: 'Ireland / Europe',
    type: 'Broadsheet Newspaper',
  },
  'channelnewsasia.com': {
    name: 'CNA',
    domain: 'channelnewsasia.com',
    region: 'Singapore / Asia',
    type: 'Broadcast News',
  },
  'sciencedaily.com': {
    name: 'ScienceDaily',
    domain: 'sciencedaily.com',
    region: 'International',
    type: 'Science Wire',
  },
  'cnbc.com': {
    name: 'CNBC',
    domain: 'cnbc.com',
    region: 'United States / Global',
    type: 'Financial & Markets Desk',
  },
  'fxstreet.com': {
    name: 'FXStreet',
    domain: 'fxstreet.com',
    region: 'International',
    type: 'FX & Macro Desk',
  },
  'straitstimes.com': {
    name: 'The Straits Times',
    domain: 'straitstimes.com',
    region: 'Singapore / International',
    type: 'Broadsheet Newspaper',
  },
  'politico.eu': {
    name: 'Politico',
    domain: 'politico.eu',
    region: 'Europe',
    type: 'Political & Policy Desk',
  },
  'politico.com': {
    name: 'Politico',
    domain: 'politico.com',
    region: 'United States',
    type: 'Political & Policy Desk',
  },
  'rte.ie': {
    name: 'RTÉ News',
    domain: 'rte.ie',
    region: 'Ireland / Europe',
    type: 'Public Broadcaster',
  },
  'rnz.co.nz': {
    name: 'RNZ',
    domain: 'rnz.co.nz',
    region: 'New Zealand / Pacific',
    type: 'Public Broadcaster',
  },
  'globalnews.ca': {
    name: 'Global News',
    domain: 'globalnews.ca',
    region: 'Canada',
    type: 'Broadcast News',
  },
  'cbsnews.com': {
    name: 'CBS News',
    domain: 'cbsnews.com',
    region: 'United States',
    type: 'Broadcast News',
  },
  'nbcnews.com': {
    name: 'NBC News',
    domain: 'nbcnews.com',
    region: 'United States',
    type: 'Broadcast News',
  },
  'abcnews.go.com': {
    name: 'ABC News',
    domain: 'abcnews.go.com',
    region: 'United States',
    type: 'Broadcast News',
  },
  'news.yahoo.com': {
    name: 'Yahoo News',
    domain: 'news.yahoo.com',
    region: 'International',
    type: 'News & Wire Desk',
  },
  'finance.yahoo.com': {
    name: 'Yahoo Finance',
    domain: 'finance.yahoo.com',
    region: 'International',
    type: 'Markets & Wire Desk',
  },
};

export const RSS_FEEDS: FeedConfig[] = [
  // United Kingdom
  {
    name: 'BBC News',
    domain: 'bbc.co.uk',
    region: 'United Kingdom',
    type: 'Public Broadcaster',
    section: 'uk',
    url: 'https://feeds.bbci.co.uk/news/uk/rss.xml',
  },
  {
    name: 'The Guardian',
    domain: 'theguardian.com',
    region: 'United Kingdom',
    type: 'Broadsheet Newspaper',
    section: 'uk',
    url: 'https://www.theguardian.com/uk-news/rss',
  },
  {
    name: 'Sky News',
    domain: 'news.sky.com',
    region: 'United Kingdom',
    type: 'Broadcast News',
    section: 'uk',
    url: 'https://feeds.skynews.com/feeds/rss/uk.xml',
  },

  // World & International
  {
    name: 'BBC News',
    domain: 'bbc.co.uk',
    region: 'United Kingdom',
    type: 'Public Broadcaster',
    section: 'world',
    url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
  },
  {
    name: 'The Guardian',
    domain: 'theguardian.com',
    region: 'United Kingdom',
    type: 'Broadsheet Newspaper',
    section: 'world',
    url: 'https://www.theguardian.com/world/rss',
  },
  {
    name: 'Sky News',
    domain: 'news.sky.com',
    region: 'United Kingdom',
    type: 'Broadcast News',
    section: 'world',
    url: 'https://feeds.skynews.com/feeds/rss/world.xml',
  },
  {
    name: 'Associated Press',
    domain: 'apnews.com',
    region: 'International',
    type: 'Wire Agency',
    section: 'world',
    url: 'https://news.google.com/rss/search?q=site:apnews.com+when:2d&hl=en-GB&gl=GB&ceid=GB:en',
    isGoogleProxy: true,
  },
  {
    name: 'Deutsche Welle',
    domain: 'dw.com',
    region: 'Germany / Europe',
    type: 'Public Broadcaster',
    section: 'world',
    url: 'https://rss.dw.com/xml/rss-en-all',
  },
  {
    name: 'France 24',
    domain: 'france24.com',
    region: 'France / Europe',
    type: 'Public Broadcaster',
    section: 'world',
    url: 'https://www.france24.com/en/rss',
  },
  {
    name: 'Al Jazeera',
    domain: 'aljazeera.com',
    region: 'Global / Doha',
    type: 'International Broadcaster',
    section: 'world',
    url: 'https://www.aljazeera.com/xml/rss/all.xml',
  },
  {
    name: 'NPR',
    domain: 'npr.org',
    region: 'United States',
    type: 'Public Broadcaster',
    section: 'world',
    url: 'https://feeds.npr.org/1004/rss.xml',
  },
  {
    name: 'PBS NewsHour',
    domain: 'pbs.org',
    region: 'United States',
    type: 'Public Broadcaster',
    section: 'world',
    url: 'https://www.pbs.org/newshour/feeds/rss/headlines',
  },
  {
    name: 'ABC News (AU)',
    domain: 'abc.net.au',
    region: 'Australia / Asia-Pacific',
    type: 'Public Broadcaster',
    section: 'world',
    url: 'https://www.abc.net.au/news/feed/2942460/rss.xml',
  },

  // Business & Economy
  {
    name: 'BBC News',
    domain: 'bbc.co.uk',
    region: 'United Kingdom',
    type: 'Public Broadcaster',
    section: 'business',
    url: 'https://feeds.bbci.co.uk/news/business/rss.xml',
  },
  {
    name: 'The Guardian',
    domain: 'theguardian.com',
    region: 'United Kingdom',
    type: 'Broadsheet Newspaper',
    section: 'business',
    url: 'https://www.theguardian.com/uk/business/rss',
  },
  {
    name: 'Sky News',
    domain: 'news.sky.com',
    region: 'United Kingdom',
    type: 'Broadcast News',
    section: 'business',
    url: 'https://feeds.skynews.com/feeds/rss/business.xml',
  },
  {
    name: 'NPR',
    domain: 'npr.org',
    region: 'United States',
    type: 'Public Broadcaster',
    section: 'business',
    url: 'https://feeds.npr.org/1001/rss.xml',
  },
  {
    name: 'CNBC',
    domain: 'cnbc.com',
    region: 'United States / Global',
    type: 'Financial & Markets Desk',
    section: 'business',
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258',
  },
  {
    name: 'CNBC',
    domain: 'cnbc.com',
    region: 'United States / Global',
    type: 'Financial & Markets Desk',
    section: 'world',
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100727362',
  },
  {
    name: 'FXStreet',
    domain: 'fxstreet.com',
    region: 'International',
    type: 'FX & Macro Desk',
    section: 'business',
    url: 'https://www.fxstreet.com/rss/news',
  },

  // Science & Technology
  {
    name: 'BBC News',
    domain: 'bbc.co.uk',
    region: 'United Kingdom',
    type: 'Public Broadcaster',
    section: 'tech',
    url: 'https://feeds.bbci.co.uk/news/technology/rss.xml',
  },
  {
    name: 'The Guardian',
    domain: 'theguardian.com',
    region: 'United Kingdom',
    type: 'Broadsheet Newspaper',
    section: 'tech',
    url: 'https://www.theguardian.com/uk/technology/rss',
  },
  {
    name: 'Ars Technica',
    domain: 'arstechnica.com',
    region: 'International',
    type: 'Science & Tech Desk',
    section: 'tech',
    url: 'https://feeds.arstechnica.com/arstechnica/index',
  },

  // Environment & Science
  {
    name: 'BBC News',
    domain: 'bbc.co.uk',
    region: 'United Kingdom',
    type: 'Public Broadcaster',
    section: 'environment',
    url: 'https://feeds.bbci.co.uk/news/science_and_environment/rss.xml',
  },
  {
    name: 'The Guardian',
    domain: 'theguardian.com',
    region: 'United Kingdom',
    type: 'Broadsheet Newspaper',
    section: 'environment',
    url: 'https://www.theguardian.com/uk/environment/rss',
  },
];

export function getReputableMeta(rawUrl: string): SourceMeta | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return null;
    }
    const hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (REPUTABLE_DOMAINS[hostname]) {
      return REPUTABLE_DOMAINS[hostname];
    }
    for (const [domain, meta] of Object.entries(REPUTABLE_DOMAINS)) {
      if (hostname.endsWith(`.${domain}`)) {
        return meta;
      }
    }
    return null;
  } catch {
    return null;
  }
}

const EXCLUDED_URL_PATTERNS = [
  /\/opinion\//i,
  /\/commentisfree\//i,
  /\/editorial\//i,
  /\/letters\//i,
  /\/podcasts?\//i,
  /\/videos?\//i,
  /\/audio\//i,
  /\/crosswords?\//i,
  /\/games?\//i,
  /\/quizzes?\//i,
  /\/cartoon/i,
  /\/pictures\//i,
  /\/in-pictures/i,
];

const EXCLUDED_TITLE_PATTERNS = [
  /^opinion[:\s|]/i,
  /^editorial[:\s|]/i,
  /^comment[:\s|]/i,
  /\bpodcast\b/i,
  /\bcrossword\b/i,
  /\bquiz:\b/i,
  /\bin pictures\b/i,
  /\bwatch:\s/i,
  /\blisten:\s/i,
];

export function isFactualNewsUrl(rawUrl: string, title = ''): boolean {
  if (!rawUrl) return false;
  for (const pattern of EXCLUDED_URL_PATTERNS) {
    if (pattern.test(rawUrl)) return false;
  }
  for (const pattern of EXCLUDED_TITLE_PATTERNS) {
    if (pattern.test(title)) return false;
  }
  return true;
}

export function extractBingTargetUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (
      parsed.hostname.endsWith('bing.com') &&
      parsed.pathname.includes('apiclick.aspx')
    ) {
      const target = parsed.searchParams.get('url');
      if (target) return target;
    }
    return rawUrl;
  } catch {
    return rawUrl;
  }
}
