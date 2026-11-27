'use client';

import { Calendar, ChevronDown, RefreshCw, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { SECTION_LABELS } from '@/lib/sources';
import type {
  EditionArchiveItem,
  EditionSlot,
  NewsSection,
  UpdateStats,
} from '@/lib/types';

interface MastheadProps {
  editionId?: string;
  editionDate: string;
  editionDay?: string;
  editionSlot?: EditionSlot;
  updatedAt: string;
  sourcesSucceeded: number;
  sourcesChecked: number;
  archive: EditionArchiveItem[];
  isViewingArchive: boolean;
  isLoadingEdition: boolean;
  onSelectEdition: (editionId: string) => void;
  onReturnToLatest: () => void;
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

const SLOT_LABELS: Record<EditionSlot, string> = {
  morning: 'Morning Edition',
  midday: 'Midday Edition',
  evening: 'Evening Edition',
};

const SLOT_SHORT_LABELS: Record<EditionSlot, string> = {
  morning: 'Morning',
  midday: 'Midday',
  evening: 'Evening',
};

const SLOT_ORDER: EditionSlot[] = ['morning', 'midday', 'evening'];

function formatUpdatedTime(iso: string): string {
  if (!iso) return 'Just now';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Latest edition';
  return (
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
      hour12: false,
    }).format(date) + ' GMT'
  );
}

function getEditionSlotLabel(iso: string, slot?: EditionSlot): string {
  if (slot) return SLOT_LABELS[slot];
  if (!iso) return 'Edition';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Edition';
  const mins = date.getUTCHours() * 60 + date.getUTCMinutes();
  if (mins >= 4 * 60 && mins < 11 * 60 + 30) return 'Morning Edition';
  if (mins >= 11 * 60 + 30 && mins < 17 * 60) return 'Midday Edition';
  return 'Evening Edition';
}

function formatShortDay(dayStr: string): string {
  const ms = Date.parse(`${dayStr}T12:00:00Z`);
  if (Number.isNaN(ms)) return dayStr;
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(ms));
}

export function Masthead({
  editionId,
  editionDate,
  editionDay,
  editionSlot,
  updatedAt,
  sourcesSucceeded,
  sourcesChecked,
  archive,
  isViewingArchive,
  isLoadingEdition,
  onSelectEdition,
  onReturnToLatest,
  activeSection,
  onSelectSection,
  searchQuery,
  onSearchChange,
  isUpdating,
  onUpdateNews,
  updateStats,
  updateError,
}: MastheadProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string>(
    editionDay || updatedAt.slice(0, 10)
  );
  const pickerRef = useRef<HTMLDivElement | null>(null);

  const dayGroups = useMemo(() => {
    const map = new Map<
      string,
      { day: string; label: string; slots: Partial<Record<EditionSlot, EditionArchiveItem>> }
    >();

    for (const item of archive) {
      let group = map.get(item.editionDay);
      if (!group) {
        group = {
          day: item.editionDay,
          label: formatShortDay(item.editionDay),
          slots: {},
        };
        map.set(item.editionDay, group);
      }
      if (!group.slots[item.editionSlot]) {
        group.slots[item.editionSlot] = item;
      }
    }

    return Array.from(map.values()).sort((a, b) => b.day.localeCompare(a.day));
  }, [archive]);

  const effectiveSelectedDay = useMemo(() => {
    if (selectedDay && dayGroups.some((g) => g.day === selectedDay)) {
      return selectedDay;
    }
    if (editionDay && dayGroups.some((g) => g.day === editionDay)) {
      return editionDay;
    }
    return dayGroups[0]?.day ?? '';
  }, [selectedDay, editionDay, dayGroups]);

  const activeDayGroup = useMemo(
    () => dayGroups.find((g) => g.day === effectiveSelectedDay) ?? dayGroups[0],
    [dayGroups, effectiveSelectedDay]
  );

  useEffect(() => {
    if (!pickerOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(event.target as Node)
      ) {
        setPickerOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setPickerOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [pickerOpen]);

  const slotLabel = getEditionSlotLabel(updatedAt, editionSlot);
  const hasArchiveOptions = dayGroups.length > 0;

  return (
    <header className="w-full bg-[#F7F4EE]">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
        {/* Top Utility Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#D4CCC0] py-2.5 font-ui text-[11px] uppercase tracking-[0.1em] text-[#5C574F]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <div ref={pickerRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  if (!pickerOpen) {
                    setSelectedDay(
                      editionDay || dayGroups[0]?.day || updatedAt.slice(0, 10)
                    );
                  }
                  setPickerOpen((prev) => !prev);
                }}
                disabled={!hasArchiveOptions || isLoadingEdition}
                aria-expanded={pickerOpen}
                aria-haspopup="dialog"
                aria-label="Select date and edition from archive"
                className="group inline-flex cursor-pointer items-center gap-1.5 text-left transition-colors hover:text-[#8B1E24] disabled:cursor-default disabled:hover:text-[#5C574F]"
              >
                <span className="font-semibold text-[#141413] group-hover:text-[#8B1E24] transition-colors">
                  {editionDate}
                </span>
                <span className="hidden sm:inline text-[#D4CCC0]">|</span>
                <span className="hidden sm:inline">
                  UK &amp; International · {slotLabel}
                </span>
                <span className="sm:hidden">· {slotLabel}</span>
                {isViewingArchive && (
                  <span className="ml-1 border border-[#8B1E24]/35 bg-[#8B1E24]/8 px-1.5 py-0.5 text-[9px] font-semibold text-[#8B1E24]">
                    Archive
                  </span>
                )}
                {hasArchiveOptions && (
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-[#5C574F] group-hover:text-[#8B1E24] transition-transform ${
                      pickerOpen ? 'rotate-180' : ''
                    }`}
                  />
                )}
              </button>

              {pickerOpen && hasArchiveOptions && (
                <div
                  role="dialog"
                  aria-label="Edition Archive Selector"
                  className="absolute left-0 top-full mt-2 z-50 w-[min(92vw,340px)] border border-[#141413] bg-[#F7F4EE] p-4 shadow-[0_8px_24px_rgba(20,20,19,0.14)]"
                >
                  <div className="flex items-center justify-between border-b border-[#D4CCC0] pb-2">
                    <span className="inline-flex items-center gap-1.5 font-ui text-[10px] font-bold uppercase tracking-[0.14em] text-[#141413]">
                      <Calendar className="h-3 w-3 text-[#8B1E24]" />
                      <span>Edition Archive</span>
                    </span>
                    {isViewingArchive && (
                      <button
                        type="button"
                        onClick={() => {
                          onReturnToLatest();
                          setPickerOpen(false);
                        }}
                        className="cursor-pointer font-ui text-[10px] font-semibold uppercase tracking-[0.1em] text-[#8B1E24] hover:underline"
                      >
                        Latest →
                      </button>
                    )}
                  </div>

                  <div className="mt-3">
                    <p className="font-ui text-[10px] uppercase tracking-[0.12em] text-[#5C574F] mb-1.5">
                      Date
                    </p>
                    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                      {dayGroups.map((group, idx) => {
                        const isSelected = group.day === activeDayGroup?.day;
                        return (
                          <button
                            key={group.day}
                            type="button"
                            onClick={() => setSelectedDay(group.day)}
                            className={`cursor-pointer border px-2 py-1 font-ui text-[10px] uppercase tracking-[0.08em] transition-colors ${
                              isSelected
                                ? 'border-[#141413] bg-[#141413] text-[#F7F4EE] font-semibold'
                                : 'border-[#D4CCC0] bg-[#EFEAE0]/70 text-[#141413] hover:border-[#141413]'
                            }`}
                          >
                            {idx === 0 ? `Latest · ${group.label}` : group.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {activeDayGroup && (
                    <div className="mt-3.5 pt-3 border-t border-[#D4CCC0]">
                      <p className="font-ui text-[10px] uppercase tracking-[0.12em] text-[#5C574F] mb-1.5">
                        Edition ({activeDayGroup.label})
                      </p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {SLOT_ORDER.map((slotKey) => {
                          const item = activeDayGroup.slots[slotKey];
                          const isCurrent =
                            Boolean(item) &&
                            (item!.id === editionId ||
                              (editionDay === activeDayGroup.day &&
                                editionSlot === slotKey));

                          if (!item) {
                            return (
                              <button
                                key={slotKey}
                                type="button"
                                disabled
                                className="border border-[#D4CCC0]/60 bg-[#EFEAE0]/30 px-2 py-2 text-center font-ui text-[10px] uppercase tracking-[0.08em] text-[#5C574F]/50 cursor-not-allowed"
                              >
                                <span className="block font-semibold">
                                  {SLOT_SHORT_LABELS[slotKey]}
                                </span>
                                <span className="mt-0.5 block text-[9px]">
                                  —
                                </span>
                              </button>
                            );
                          }

                          return (
                            <button
                              key={slotKey}
                              type="button"
                              onClick={() => {
                                onSelectEdition(item.id);
                                setPickerOpen(false);
                              }}
                              className={`cursor-pointer border px-2 py-2 text-center font-ui text-[10px] uppercase tracking-[0.08em] transition-colors ${
                                isCurrent
                                  ? 'border-[#8B1E24] bg-[#8B1E24] text-[#F7F4EE] font-semibold'
                                  : 'border-[#D4CCC0] bg-[#EFEAE0]/70 text-[#141413] hover:border-[#141413] hover:bg-[#EFEAE0]'
                              }`}
                            >
                              <span className="block font-semibold">
                                {SLOT_SHORT_LABELS[slotKey]}
                              </span>
                              <span
                                className={`mt-0.5 block text-[9px] ${
                                  isCurrent
                                    ? 'text-[#F7F4EE]/90'
                                    : 'text-[#5C574F]'
                                }`}
                              >
                                {formatUpdatedTime(item.updatedAt)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <span className="hidden lg:inline text-[#D4CCC0]">|</span>
            <span className="hidden lg:inline">
              Updated {formatUpdatedTime(updatedAt)} · {sourcesSucceeded}/
              {sourcesChecked} Wires Active
            </span>
          </div>

          <button
            type="button"
            onClick={onUpdateNews}
            disabled={isUpdating || isLoadingEdition}
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
          </div>
        )}
      </div>
    </header>
  );
}
