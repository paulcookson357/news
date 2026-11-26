'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  BookOpenCheck,
  ExternalLink,
  RefreshCw,
  Scale,
  SearchCheck,
} from 'lucide-react';
import { SECTION_LABELS } from '@/lib/sources';
import type { DeepDiveArticle, StorySummary } from '@/lib/types';
import { Footer } from './Footer';
import { formatStoryTime } from './StoryCard';

interface StoryDeepDiveClientProps {
  storyId: string;
  initialStory: StorySummary | null;
  initialArticle: DeepDiveArticle | null;
}

export function StoryDeepDiveClient({
  storyId,
  initialStory,
  initialArticle,
}: StoryDeepDiveClientProps) {
  const [story, setStory] = useState<StorySummary | null>(initialStory);
  const [article, setArticle] = useState<DeepDiveArticle | null>(
    initialArticle
  );
  const [loading, setLoading] = useState<boolean>(!initialArticle);
  const [error, setError] = useState<string | null>(null);

  const runDeepDiveSearch = useCallback(
    async (storyPayload: StorySummary | null, forceRefresh = false) => {
      setLoading(true);
      setError(null);
      try {
        const body = storyPayload
          ? {
              id: storyId,
              title: storyPayload.title,
              summary: storyPayload.summary,
              section: storyPayload.section,
              publishedAt: storyPayload.publishedAt,
              sources: storyPayload.sources,
              forceRefresh,
            }
          : { id: storyId, forceRefresh };

        const res = await fetch('/api/news/deep-dive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          cache: 'no-store',
        });

        const data = (await res.json()) as {
          article?: DeepDiveArticle;
          error?: string;
        };

        if (!res.ok || !data.article) {
          throw new Error(
            data.error ||
              'Could not complete the live source search for this dispatch.'
          );
        }

        setArticle(data.article);
        try {
          window.localStorage.setItem(
            `meridian_deepdive_v3_${storyId}`,
            JSON.stringify(data.article)
          );
        } catch {
          // Ignore storage errors
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to compile multi-source report.'
        );
      } finally {
        setLoading(false);
      }
    },
    [storyId]
  );

  useEffect(() => {
    if (initialArticle) return;
    let cancelled = false;

    async function hydrateAndSearch() {
      await Promise.resolve();
      if (cancelled) return;

      let resolvedStory = initialStory;
      try {
        if (!resolvedStory) {
          const storedStory = window.localStorage.getItem(
            `meridian_story_${storyId}`
          );
          if (storedStory) {
            resolvedStory = JSON.parse(storedStory) as StorySummary;
            if (!cancelled) setStory(resolvedStory);
          }
        }

        const storedDive = window.localStorage.getItem(
          `meridian_deepdive_v3_${storyId}`
        );
        if (storedDive) {
          const cachedDive = JSON.parse(storedDive) as DeepDiveArticle;
          if (!cancelled) {
            setArticle(cachedDive);
            setLoading(false);
          }
          return;
        }
      } catch {
        // Ignore storage errors
      }

      if (!cancelled) {
        await runDeepDiveSearch(resolvedStory, false);
      }
    }

    void hydrateAndSearch();
    return () => {
      cancelled = true;
    };
  }, [initialArticle, initialStory, runDeepDiveSearch, storyId]);

  const displayTitle = article?.title || story?.title || 'Dispatch Report';
  const displaySection = article?.section || story?.section || 'world';

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F4EE]">
      {/* Compact Masthead Bar */}
      <header className="border-b border-[#D4CCC0] bg-[#F7F4EE]">
        <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3 py-3">
            <Link
              href="/"
              className="inline-flex items-center gap-2 font-ui text-xs font-semibold uppercase tracking-[0.12em] text-[#141413] hover:text-[#8B1E24] transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Return to Front Page</span>
            </Link>

            <Link
              href="/"
              className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[#141413]"
            >
              THE MERIDIAN
            </Link>

            <button
              type="button"
              onClick={() => void runDeepDiveSearch(story, true)}
              disabled={loading}
              className="inline-flex cursor-pointer items-center gap-1.5 border border-[#141413] bg-[#EFEAE0] px-3 py-1.5 font-ui text-[11px] font-semibold uppercase tracking-[0.1em] text-[#141413] hover:bg-[#141413] hover:text-[#F7F4EE] transition-colors disabled:opacity-60"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
              />
              <span>{loading ? 'Searching Sources…' : 'Re-search Sources'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 sm:px-6 lg:px-8 py-6">
        {/* Story Header */}
        <div className="border-b-[3px] border-double border-[#2C2925] pb-6">
          <div className="flex flex-wrap items-center gap-2.5 font-ui text-[11px] uppercase tracking-[0.14em]">
            <span className="font-bold text-[#8B1E24]">
              {SECTION_LABELS[displaySection]} · Expanded Multi-Source Dispatch
            </span>
            {article && (
              <span className="border border-[#1D3557]/30 bg-[#1D3557]/8 px-2 py-0.5 text-[10px] font-semibold text-[#1D3557]">
                {article.synthesisMode === 'ai'
                  ? 'Gemini AI Balanced Synthesis'
                  : 'Keyless Multi-Source Synthesis'}
              </span>
            )}
          </div>

          <h1 className="mt-3 font-display text-3xl sm:text-4xl lg:text-[2.85rem] font-bold leading-[1.12] tracking-[-0.015em] text-[#141413] max-w-4xl">
            {displayTitle}
          </h1>

          {(article?.standfirst || story?.summary) && (
            <p className="mt-4 font-editorial italic text-lg sm:text-xl leading-relaxed text-[#3B3832] max-w-3xl">
              {article?.standfirst || story?.summary}
            </p>
          )}

          {article && (
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-ui text-xs text-[#5C574F]">
              <span className="inline-flex items-center gap-1.5 font-semibold text-[#1D3557]">
                <SearchCheck className="h-3.5 w-3.5" />
                <span>
                  {article.sources.length}{' '}
                  {article.sources.length === 1
                    ? 'reputable source'
                    : 'reputable sources'}{' '}
                  consulted
                </span>
              </span>
              <span className="text-[#D4CCC0]">|</span>
              <span>Compiled {formatStoryTime(article.generatedAt)}</span>
              {article.searchQueriesUsed.length > 0 && (
                <>
                  <span className="text-[#D4CCC0]">|</span>
                  <span>
                    Search query: &ldquo;{article.searchQueriesUsed[0]}&rdquo;
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Loading State During Live Second Search */}
        {loading && (
          <div className="my-10 border border-[#D4CCC0] bg-[#EFEAE0]/60 p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <RefreshCw className="h-5 w-5 animate-spin text-[#8B1E24] shrink-0 mt-0.5" />
              <div>
                <h2 className="font-display text-xl font-bold text-[#141413]">
                  Searching reputable internet sources for corroborating
                  reporting…
                </h2>
                <p className="mt-2 font-editorial text-base text-[#5C574F]">
                  The Meridian is querying free news indices across BBC News,
                  The Guardian, Associated Press, Sky News, CNBC, Investing.com,
                  FXStreet, Deutsche Welle, France 24, NPR, and Al Jazeera,
                  extracting full article text, and assembling an expanded
                  broadsheet report.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="my-8 border border-[#8B1E24]/40 bg-[#8B1E24]/5 p-6">
            <h2 className="font-display text-xl font-bold text-[#8B1E24]">
              Unable to complete source search
            </h2>
            <p className="mt-2 font-editorial text-base text-[#3B3832]">
              {error}
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void runDeepDiveSearch(story, true)}
                className="cursor-pointer border border-[#141413] bg-[#141413] px-4 py-2 font-ui text-xs font-semibold uppercase tracking-[0.1em] text-[#F7F4EE]"
              >
                Retry Live Search
              </button>
              <Link
                href="/"
                className="border border-[#D4CCC0] bg-[#F7F4EE] px-4 py-2 font-ui text-xs font-semibold uppercase tracking-[0.1em] text-[#141413]"
              >
                Back to Front Page
              </Link>
            </div>
          </div>
        )}

        {/* Expanded Report Body + Key Facts Rail + Sources Referenced Below */}
        {article && !loading && (
          <>
            <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Main Editorial Column */}
              <div className="lg:col-span-8">
                <div className="max-w-[68ch] space-y-8">
                  {article.sections.map((section, secIdx) => (
                    <section key={section.heading}>
                      {secIdx > 0 && (
                        <h2 className="font-display text-2xl font-bold text-[#141413] border-b border-[#D4CCC0] pb-1.5 mb-4">
                          {section.heading}
                        </h2>
                      )}
                      <div className="space-y-4">
                        {section.paragraphs.map((paragraph, pIdx) => (
                          <p
                            key={pIdx}
                            className={`font-editorial text-[1.1rem] leading-[1.75] text-[#1E1D1B] ${
                              secIdx === 0 && pIdx === 0
                                ? 'broadsheet-dropcap'
                                : ''
                            }`}
                          >
                            {paragraph}
                          </p>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>

              {/* Right Rail: Key Facts */}
              <aside className="lg:col-span-4 lg:border-l lg:border-[#D4CCC0] lg:pl-7">
                <div className="border-t-2 border-[#141413] pt-3">
                  <h2 className="font-ui text-[11px] font-bold uppercase tracking-[0.14em] text-[#141413] flex items-center gap-2">
                    <BookOpenCheck className="h-3.5 w-3.5 text-[#8B1E24]" />
                    <span>Key Reported Facts</span>
                  </h2>
                  <ul className="mt-3 space-y-2.5 divide-y divide-[#D4CCC0]/70">
                    {article.keyFacts.map((fact, idx) => (
                      <li
                        key={idx}
                        className="pt-2.5 first:pt-0 font-editorial text-[15px] leading-relaxed text-[#2C2925]"
                      >
                        {fact}
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>
            </div>

            {/* Sources Referenced Below the Article */}
            <section
              aria-label="Sources Referenced"
              className="mt-10 pt-6 double-rule-top"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#D4CCC0] pb-2.5">
                <h2 className="font-display text-2xl font-bold tracking-tight text-[#141413]">
                  Sources Referenced ({article.sources.length})
                </h2>
                <p className="font-ui text-xs text-[#5C574F]">
                  Original reporting consulted for this dispatch:
                </p>
              </div>

              <div className="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {article.sources.map((src, idx) => (
                  <div
                    key={`${src.name}-${idx}`}
                    className="border-t border-[#D4CCC0] pt-3 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-ui text-xs font-bold text-[#1D3557]">
                          {src.name}
                        </span>
                        <span className="font-ui text-[10px] uppercase tracking-[0.08em] text-[#5C574F]">
                          {src.region}
                        </span>
                      </div>

                      <p className="mt-0.5 font-ui text-[10px] uppercase tracking-[0.08em] text-[#8B1E24]">
                        {src.type}
                      </p>

                      <a
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1.5 inline-flex items-start gap-1.5 font-editorial text-[15px] font-semibold leading-snug text-[#141413] hover:text-[#8B1E24] transition-colors"
                      >
                        <span>{src.title}</span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 mt-1" />
                      </a>
                    </div>

                    <p className="mt-2 font-ui text-[11px] text-[#5C574F]">
                      {formatStoryTime(src.publishedAt)}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-6 border-t border-b border-[#D4CCC0] bg-[#EFEAE0]/50 p-4 flex items-start gap-3">
                <Scale className="h-4 w-4 text-[#1D3557] shrink-0 mt-0.5" />
                <p className="font-ui text-xs leading-relaxed text-[#5C574F]">
                  <strong className="text-[#141413]">Editorial Note:</strong>{' '}
                  {article.editorialNote}
                </p>
              </div>
            </section>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
