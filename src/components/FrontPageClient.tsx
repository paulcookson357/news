'use client';

import { useEffect, useMemo, useState } from 'react';
import { SECTION_LABELS } from '@/lib/sources';
import type {
  Edition,
  NewsSection,
  StoryCategory,
  StorySummary,
  UpdateStats,
} from '@/lib/types';
import { Footer } from './Footer';
import { Masthead } from './Masthead';
import { StoryCard } from './StoryCard';

interface FrontPageClientProps {
  initialEdition: Edition;
}

const EDITION_STORAGE_KEY = 'meridian_edition_v2';
const SECTION_ORDER: StoryCategory[] = [
  'uk',
  'world',
  'business',
  'tech',
  'environment',
];

function chunkIntoThree<T>(items: T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += 3) {
    rows.push(items.slice(i, i + 3));
  }
  return rows;
}

export function FrontPageClient({ initialEdition }: FrontPageClientProps) {
  const [edition, setEdition] = useState<Edition>(initialEdition);
  const [activeSection, setActiveSection] = useState<NewsSection>('front');
  const [searchQuery, setSearchQuery] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateStats, setUpdateStats] = useState<UpdateStats | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(
        EDITION_STORAGE_KEY,
        JSON.stringify(edition)
      );
    } catch {
      // Ignore storage errors
    }
  }, [edition]);

  const handleUpdateNews = async () => {
    setIsUpdating(true);
    setUpdateError(null);
    try {
      const res = await fetch('/api/news/update', {
        method: 'POST',
        cache: 'no-store',
      });
      if (!res.ok) {
        const errPayload = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(
          errPayload.error || 'Unable to update news from live sources.'
        );
      }
      const data = (await res.json()) as {
        edition: Edition;
        stats: UpdateStats;
      };
      setEdition(data.edition);
      setUpdateStats(data.stats);
      try {
        window.localStorage.setItem(
          EDITION_STORAGE_KEY,
          JSON.stringify(data.edition)
        );
      } catch {
        // Ignore storage errors
      }
    } catch (err) {
      setUpdateError(
        err instanceof Error
          ? err.message
          : 'Network error while polling news feeds.'
      );
    } finally {
      setIsUpdating(false);
    }
  };

  const filteredStories = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const base =
      activeSection === 'front'
        ? edition.stories
        : edition.stories.filter((s) => s.section === activeSection);

    if (!q) return base;
    return base.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.summary.toLowerCase().includes(q) ||
        s.sources.some((src) => src.name.toLowerCase().includes(q))
    );
  }, [edition.stories, activeSection, searchQuery]);

  // Above-the-fold Front Page curation (when not actively searching)
  const isDefaultFrontPage =
    activeSection === 'front' && searchQuery.trim().length === 0;

  const {
    leadStory,
    leftColumn,
    centerSubStories,
    rightColumn,
    sectionFolios,
  } = useMemo(() => {
    if (!isDefaultFrontPage || filteredStories.length === 0) {
      return {
        leadStory: null as StorySummary | null,
        leftColumn: [] as StorySummary[],
        centerSubStories: [] as StorySummary[],
        rightColumn: [] as StorySummary[],
        sectionFolios: {} as Record<StoryCategory, StorySummary[]>,
      };
    }

    // Prefer a multi-source UK or World headline as the main front-page lead
    const lead =
      filteredStories.find(
        (s) =>
          s.sources.length >= 2 &&
          (s.section === 'uk' || s.section === 'world')
      ) ?? filteredStories[0];

    const used = new Set<string>([lead.id]);
    const remaining = filteredStories.filter((s) => !used.has(s.id));

    const left = remaining.slice(0, 2);
    left.forEach((s) => used.add(s.id));

    const centerSub = remaining.slice(2, 4);
    centerSub.forEach((s) => used.add(s.id));

    const right = remaining.slice(4, 7);
    right.forEach((s) => used.add(s.id));

    const folios: Record<StoryCategory, StorySummary[]> = {
      uk: [],
      world: [],
      business: [],
      tech: [],
      environment: [],
    };

    for (const cat of SECTION_ORDER) {
      folios[cat] = filteredStories
        .filter((s) => s.section === cat && !used.has(s.id))
        .slice(0, 6);
    }

    return {
      leadStory: lead,
      leftColumn: left,
      centerSubStories: centerSub,
      rightColumn: right,
      sectionFolios: folios,
    };
  }, [filteredStories, isDefaultFrontPage]);

  return (
    <div className="min-h-screen flex flex-col bg-[#F7F4EE]">
      <Masthead
        editionDate={edition.editionDate}
        updatedAt={edition.updatedAt}
        sourcesSucceeded={edition.sourcesSucceeded}
        sourcesChecked={edition.sourcesChecked}
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        isUpdating={isUpdating}
        onUpdateNews={handleUpdateNews}
        updateStats={updateStats}
        updateError={updateError}
      />

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 sm:px-6 lg:px-8 pt-5">
        {filteredStories.length === 0 ? (
          <div className="border border-[#D4CCC0] bg-[#EFEAE0]/50 p-8 text-center my-8">
            <h2 className="font-display text-2xl font-bold text-[#141413]">
              No matching dispatches found
            </h2>
            <p className="mt-2 font-editorial text-base text-[#5C574F]">
              {searchQuery
                ? `No headlines matched "${searchQuery}". Clear the filter or click Update News to poll the latest wires.`
                : 'Click "Update News" above to fetch the latest stories from our free internet sources.'}
            </p>
          </div>
        ) : isDefaultFrontPage && leadStory ? (
          <>
            {/* Above the Fold: Classic 12-Column Broadsheet Grid */}
            <section aria-label="Front Page Lead Stories">
              <div className="grid grid-cols-1 lg:grid-cols-12 lg:divide-x divide-[#D4CCC0]">
                {/* Left Column: Secondary Headlines */}
                <div className="lg:col-span-3 lg:pr-6 flex flex-col divide-y divide-[#D4CCC0] order-2 lg:order-1 pt-5 lg:pt-0 border-t lg:border-t-0 border-[#D4CCC0]">
                  {leftColumn.map((story, idx) => (
                    <div key={story.id} className="py-4 first:pt-0 last:pb-0">
                      <StoryCard
                        story={story}
                        variant="featured"
                        showImage={idx === 0}
                      />
                    </div>
                  ))}
                </div>

                {/* Center Column: Primary Lead Story + 2-Column Sub-Lead Grid */}
                <div className="lg:col-span-6 lg:px-6 order-1 lg:order-2 pb-5 lg:pb-0">
                  <StoryCard story={leadStory} variant="lead" showImage />

                  {centerSubStories.length > 0 && (
                    <div className="mt-5 pt-5 border-t border-[#D4CCC0] grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-[#D4CCC0]">
                      {centerSubStories.map((story, idx) => (
                        <div
                          key={story.id}
                          className={`flex ${idx === 0
                            ? 'pb-4 sm:pb-0 sm:pr-5'
                            : 'pt-4 sm:pt-0 sm:pl-5'
                            }`}
                        >
                          <StoryCard story={story} variant="standard" />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right Column: Latest Wire Dispatches */}
                <div className="lg:col-span-3 lg:pl-6 order-3 pt-5 lg:pt-0 border-t lg:border-t-0 border-[#D4CCC0]">
                  <div className="border-b-2 border-[#141413] pb-1.5 mb-3 flex items-center justify-between">
                    <h2 className="font-ui text-[11px] font-bold uppercase tracking-[0.14em] text-[#141413]">
                      Latest Dispatches
                    </h2>
                    <span className="font-ui text-[10px] uppercase tracking-[0.1em] text-[#8B1E24] font-semibold">
                      Wire
                    </span>
                  </div>
                  <div className="divide-y divide-[#D4CCC0]">
                    {rightColumn.map((story) => (
                      <StoryCard
                        key={story.id}
                        story={story}
                        variant="brief"
                      />
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* Below the Fold: Sectioned Broadsheet Folios */}
            {SECTION_ORDER.map((category) => {
              const items = sectionFolios[category] ?? [];
              if (items.length === 0) return null;
              const rows = chunkIntoThree(items);

              return (
                <section
                  key={category}
                  aria-label={SECTION_LABELS[category]}
                  className="mt-8 pt-4 double-rule-top"
                >
                  <div className="flex items-baseline justify-between border-b border-[#D4CCC0] pb-2 mb-4">
                    <h2 className="font-display text-2xl font-bold tracking-tight text-[#141413]">
                      {SECTION_LABELS[category]}
                    </h2>
                    <button
                      type="button"
                      onClick={() => setActiveSection(category)}
                      className="cursor-pointer font-ui text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8B1E24] hover:underline"
                    >
                      View All {SECTION_LABELS[category]} →
                    </button>
                  </div>

                  <div className="divide-y divide-[#D4CCC0]">
                    {rows.map((row, rowIdx) => (
                      <div
                        key={rowIdx}
                        className="py-5 first:pt-0 last:pb-0 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#D4CCC0]"
                      >
                        {row.map((story, colIdx) => (
                          <div
                            key={story.id}
                            className={`flex py-4 first:pt-0 last:pb-0 md:py-0 ${colIdx === 0
                              ? 'md:pr-6'
                              : colIdx === 1
                                ? 'md:px-6'
                                : 'md:pl-6'
                              }`}
                          >
                            <StoryCard
                              story={story}
                              variant="standard"
                              showImage={rowIdx === 0 && colIdx === 0}
                            />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </>
        ) : (
          /* Filtered or Section-Specific Broadsheet View */
          <section aria-label={SECTION_LABELS[activeSection]}>
            <div className="border-b-2 border-[#141413] pb-2 mb-5 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-3xl font-bold text-[#141413]">
                {searchQuery
                  ? `Search Results: "${searchQuery}"`
                  : SECTION_LABELS[activeSection]}
              </h2>
              <span className="font-ui text-xs uppercase tracking-[0.12em] text-[#5C574F]">
                {filteredStories.length}{' '}
                {filteredStories.length === 1 ? 'dispatch' : 'dispatches'}
              </span>
            </div>

            {!searchQuery && filteredStories.length > 0 && (
              <div className="mb-6 pb-6 border-b border-[#D4CCC0]">
                {filteredStories.length >= 2 ? (
                  <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[#D4CCC0]">
                    <div className="lg:col-span-8 lg:pr-6 pb-6 lg:pb-0">
                      <StoryCard
                        story={filteredStories[0]}
                        variant="lead"
                        showImage
                      />
                    </div>
                    <div className="lg:col-span-4 lg:pl-6 pt-6 lg:pt-0 flex">
                      <StoryCard
                        story={filteredStories[1]}
                        variant="featured"
                      />
                    </div>
                  </div>
                ) : (
                  <StoryCard
                    story={filteredStories[0]}
                    variant="lead"
                    showImage
                  />
                )}
              </div>
            )}

            <div className="divide-y divide-[#D4CCC0]">
              {chunkIntoThree(
                searchQuery
                  ? filteredStories
                  : filteredStories.slice(filteredStories.length >= 2 ? 2 : 1)
              ).map((row, rowIdx) => (
                <div
                  key={rowIdx}
                  className="py-5 first:pt-0 last:pb-0 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#D4CCC0]"
                >
                  {row.map((story, colIdx) => (
                    <div
                      key={story.id}
                      className={`flex py-4 first:pt-0 last:pb-0 md:py-0 ${colIdx === 0
                        ? 'md:pr-6'
                        : colIdx === 1
                          ? 'md:px-6'
                          : 'md:pl-6'
                        }`}
                    >
                      <StoryCard story={story} variant="standard" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
}
