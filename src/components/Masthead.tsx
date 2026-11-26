'use client';

import { RefreshCw, Search, X } from 'lucide-react';
import { SECTION_LABELS } from '@/lib/sources';
import type { NewsSection, UpdateStats } from '@/lib/types';

interface MastheadProps {
  editionDate: string;
  updatedAt: string;
  sourcesSucceeded: number;
  sourcesChecked: number;
  activeSection: NewsSection;
  onSelectSection: (section: NewsSection) => void;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  isUpdating: boolean;
  onUpdateNews: () => void;
  updateStats: UpdateStats | null;
  updateError: string | null;
}

const NAV_SECTIONS: NewsSection[] = [
  'front',
  'uk',
  'world',
  'business',
  'tech',
  'environment',
];

function formatUpdatedTime(iso: string): string {
  if (!iso) return 'Just now';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Latest edition';
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
    hour12: false,
  }).format(date) + ' GMT';
}

function getEditionSlotLabel(iso: string): string {
  if (!iso) return 'Edition';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Edition';
  const mins = date.getUTCHours() * 60 + date.getUTCMinutes();
  if (mins >= 4 * 60 && mins < 11 * 60 + 30) return 'Morning Edition';
  if (mins >= 11 * 60 + 30 && mins < 17 * 60) return 'Midday Edition';
  return 'Evening Edition';
}

export function Masthead({
  editionDate,
  updatedAt,
  sourcesSucceeded,
  sourcesChecked,
  activeSection,
  onSelectSection,
  searchQuery,
  onSearchChange,
  isUpdating,
  onUpdateNews,
  updateStats,
  updateError,
}: MastheadProps) {
  return (
    <header className="w-full bg-[#F7F4EE]">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
        {/* Top Utility Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D4CCC0] py-2.5 font-ui text-[11px] uppercase tracking-[0.1em] text-[#5C574F]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-semibold text-[#141413]">{editionDate}</span>
            <span className="hidden sm:inline text-[#D4CCC0]">|</span>
            <span>UK &amp; International · {getEditionSlotLabel(updatedAt)}</span>
            <span className="hidden md:inline text-[#D4CCC0]">|</span>
            <span className="hidden md:inline">
              Updated {formatUpdatedTime(updatedAt)} · {sourcesSucceeded}/
              {sourcesChecked} Wires Active
            </span>
          </div>

          <button
            type="button"
            onClick={onUpdateNews}
            disabled={isUpdating}
            aria-label="Update news from internet sources"
            className="inline-flex cursor-pointer items-center gap-2 border border-[#141413] bg-[#141413] px-3.5 py-1.5 font-ui text-[11px] font-semibold uppercase tracking-[0.12em] text-[#F7F4EE] transition-colors hover:bg-[#8B1E24] hover:border-[#8B1E24] disabled:cursor-wait disabled:opacity-70"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isUpdating ? 'animate-spin' : ''}`}
            />
            <span>{isUpdating ? 'Polling Sources…' : 'Update News'}</span>
          </button>
        </div>

        {/* Broadsheet Titleplate */}
        <div className="py-4 sm:py-5 text-center double-rule-bottom">
          <p className="font-ui text-[10px] sm:text-[11px] uppercase tracking-[0.26em] text-[#8B1E24] font-semibold mb-1.5">
            Independent · Balanced · Source-Attributed
          </p>
          <h1 className="font-display text-4xl sm:text-6xl lg:text-[4.25rem] font-extrabold tracking-[-0.02em] leading-none text-[#141413]">
            THE MERIDIAN
          </h1>
          <p className="mt-2 font-editorial italic text-sm sm:text-base text-[#5C574F]">
            Factual multi-source reporting gathered from public broadcasters,
            wires &amp; broadsheets
          </p>
        </div>

        {/* Navigation Strip & Inline Filter */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 py-2.5 border-b border-[#141413]">
          <nav
            aria-label="Newspaper sections"
            className="flex items-center gap-1 sm:gap-2 overflow-x-auto pb-1 md:pb-0"
          >
            {NAV_SECTIONS.map((sec) => {
              const isActive = activeSection === sec;
              return (
                <button
                  key={sec}
                  type="button"
                  onClick={() => onSelectSection(sec)}
                  className={`shrink-0 cursor-pointer px-2.5 py-1 font-ui text-[11px] sm:text-xs uppercase tracking-[0.1em] transition-colors ${
                    isActive
                      ? 'bg-[#141413] text-[#F7F4EE] font-semibold'
                      : 'text-[#5C574F] hover:text-[#141413] hover:bg-[#EFEAE0]'
                  }`}
                >
                  {SECTION_LABELS[sec]}
                </button>
              );
            })}
          </nav>

          <div className="relative w-full md:w-64 shrink-0">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#5C574F]" />
            <input
              id="headline-filter"
              name="headlineFilter"
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Filter headlines…"
              aria-label="Filter headlines"
              className="w-full border border-[#D4CCC0] bg-[#EFEAE0]/60 py-1 pl-8 pr-7 font-ui text-xs text-[#141413] placeholder:text-[#5C574F]/80 focus:border-[#141413] focus:bg-[#F7F4EE] focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                aria-label="Clear filter"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[#5C574F] hover:text-[#141413]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Live Update Feedback Strip */}
        {(updateStats || updateError) && (
          <div
            role="status"
            className={`mt-2 px-3 py-2 border font-ui text-xs flex flex-wrap items-center justify-between gap-2 ${
              updateError
                ? 'border-[#8B1E24]/40 bg-[#8B1E24]/5 text-[#8B1E24]'
                : 'border-[#1D3557]/30 bg-[#EFEAE0] text-[#141413]'
            }`}
          >
            {updateError ? (
              <span>{updateError}</span>
            ) : (
              <span>
                <strong className="font-semibold">Edition refreshed:</strong>{' '}
                Polled {updateStats!.sourcesSucceeded} of{' '}
                {updateStats!.sourcesChecked} free news feeds in{' '}
                {(updateStats!.durationMs / 1000).toFixed(1)}s —{' '}
                {updateStats!.newStoriesCount > 0
                  ? `${updateStats!.newStoriesCount} new stories added`
                  : 'all current dispatches up to date'}{' '}
                ({updateStats!.totalStoriesCount} total stories).
              </span>
            )}
            <span className="text-[11px] text-[#5C574F]">
              Updated {formatUpdatedTime(updatedAt)}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
