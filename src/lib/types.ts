export type StoryCategory = 'uk' | 'world' | 'business' | 'tech' | 'environment';
export type NewsSection = 'front' | StoryCategory;

export interface SourceMeta {
  name: string;
  domain: string;
  region: string;
  type: string;
}

export interface StorySource extends SourceMeta {
  url: string;
  title: string;
  publishedAt: string;
  snippet?: string;
}

export interface StorySummary {
  id: string;
  title: string;
  summary: string;
  section: StoryCategory;
  publishedAt: string;
  sources: StorySource[];
  primarySource: string;
  score: number;
  imageUrl?: string;
  imageSource?: string;
}

export interface RawArticle extends SourceMeta {
  id: string;
  title: string;
  snippet: string;
  url: string;
  publishedAt: string;
  section: StoryCategory;
  tokens: string[];
  properNouns: string[];
  imageUrl?: string;
  imageWidth?: number;
}

export interface Edition {
  updatedAt: string;
  editionDate: string;
  stories: StorySummary[];
  sourcesChecked: number;
  sourcesSucceeded: number;
  activeSourceNames: string[];
}

export interface UpdateStats {
  newStoriesCount: number;
  totalStoriesCount: number;
  sourcesChecked: number;
  sourcesSucceeded: number;
  durationMs: number;
}

export interface DeepDiveSection {
  heading: string;
  paragraphs: string[];
}

export interface DeepDiveSourceDetail extends SourceMeta {
  title: string;
  url: string;
  publishedAt: string;
  wordCount: number;
  excerpt: string;
  fetchStatus: 'extracted' | 'snippet';
}

export interface DeepDiveArticle {
  id: string;
  title: string;
  section: StoryCategory;
  standfirst: string;
  keyFacts: string[];
  sections: DeepDiveSection[];
  sources: DeepDiveSourceDetail[];
  editorialNote: string;
  synthesisMode: 'ai' | 'algorithmic';
  generatedAt: string;
  searchQueriesUsed: string[];
}
