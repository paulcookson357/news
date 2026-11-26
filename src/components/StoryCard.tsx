'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { SECTION_LABELS } from '@/lib/sources';
import type { StorySummary } from '@/lib/types';

interface StoryCardProps {
  story: StorySummary;
  variant?: 'lead' | 'featured' | 'standard' | 'brief';
}

export function formatStoryTime(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  return (
    new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
      hour12: false,
    }).format(new Date(ms)) + ' GMT'
  );
}

export function persistStoryForDeepDive(story: StorySummary): void {
  try {
    window.localStorage.setItem(
      `meridian_story_${story.id}`,
      JSON.stringify(story)
    );
  } catch {
    // Ignore storage quota errors
  }
}

export function StoryCard({ story, variant = 'standard' }: StoryCardProps) {
  const sourceNames = story.sources.map((s) => s.name);
  const multiSource = story.sources.length > 1;

  const handleClick = () => {
    persistStoryForDeepDive(story);
  };

  if (variant === 'lead') {
    return (
      <article className="group flex flex-col justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2 font-ui text-[11px] uppercase tracking-[0.14em]">
            <span className="font-bold text-[#8B1E24]">
              Lead Dispatch · {SECTION_LABELS[story.section]}
            </span>
            {multiSource && (
              <span className="border border-[#1D3557]/30 bg-[#1D3557]/8 px-1.5 py-0.5 text-[10px] font-semibold text-[#1D3557]">
                {story.sources.length} Sources Corroborated
              </span>
            )}
          </div>

          <Link
            href={`/story/${encodeURIComponent(story.id)}`}
            onClick={handleClick}
            className="mt-2.5 block"
          >
            <h2 className="font-display text-3xl sm:text-4xl lg:text-[2.65rem] font-bold leading-[1.1] tracking-[-0.015em] text-[#141413] group-hover:text-[#8B1E24] transition-colors">
              {story.title}
            </h2>
          </Link>

          <p className="mt-3.5 font-editorial text-base sm:text-[1.125rem] leading-[1.6] text-[#2C2925]">
            {story.summary}
          </p>
        </div>

        <div className="mt-4 pt-3 border-t border-[#D4CCC0] flex flex-wrap items-center justify-between gap-2">
          <div className="font-ui text-[11px] text-[#5C574F]">
            <span className="font-semibold text-[#1D3557]">
              {sourceNames.join(' · ')}
            </span>
            <span className="mx-1.5 text-[#D4CCC0]">|</span>
            <span>{formatStoryTime(story.publishedAt)}</span>
          </div>

          <Link
            href={`/story/${encodeURIComponent(story.id)}`}
            onClick={handleClick}
            className="inline-flex items-center gap-1.5 font-ui text-[11px] font-semibold uppercase tracking-[0.1em] text-[#141413] hover:text-[#8B1E24] transition-colors"
          >
            <span>Read Multi-Source Report</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </article>
    );
  }

  if (variant === 'brief') {
    return (
      <article className="group py-3 first:pt-0 last:pb-0">
        <div className="flex items-center justify-between gap-2 font-ui text-[10px] uppercase tracking-[0.12em] text-[#5C574F]">
          <span className="font-semibold text-[#8B1E24]">
            {SECTION_LABELS[story.section]}
          </span>
          <span>{formatStoryTime(story.publishedAt)}</span>
        </div>

        <Link
          href={`/story/${encodeURIComponent(story.id)}`}
          onClick={handleClick}
          className="mt-1 block"
        >
          <h3 className="font-display text-base sm:text-[1.05rem] font-bold leading-snug text-[#141413] group-hover:text-[#8B1E24] transition-colors">
            {story.title}
          </h3>
        </Link>

        <p className="mt-1.5 font-editorial text-sm leading-relaxed text-[#5C574F] line-clamp-2">
          {story.summary}
        </p>

        <p className="mt-1.5 font-ui text-[10px] uppercase tracking-[0.08em] text-[#1D3557] font-medium">
          {sourceNames.join(' · ')}
        </p>
      </article>
    );
  }

  return (
    <article className="group flex h-full w-full flex-col justify-between">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2 font-ui text-[10px] uppercase tracking-[0.12em]">
          <span className="font-semibold text-[#8B1E24]">
            {SECTION_LABELS[story.section]}
          </span>
          {multiSource && (
            <span className="text-[#1D3557] font-semibold">
              {story.sources.length} Sources
            </span>
          )}
        </div>

        <Link
          href={`/story/${encodeURIComponent(story.id)}`}
          onClick={handleClick}
          className="mt-1.5 block"
        >
          <h3
            className={`font-display font-bold leading-[1.2] text-[#141413] group-hover:text-[#8B1E24] transition-colors ${
              variant === 'featured'
                ? 'text-xl sm:text-[1.3rem]'
                : 'text-lg sm:text-[1.125rem]'
            }`}
          >
            {story.title}
          </h3>
        </Link>

        {story.summary && (
          <p className="mt-2 font-editorial text-[15px] leading-[1.55] text-[#3B3832] line-clamp-3">
            {story.summary}
          </p>
        )}
      </div>

      <div className="mt-3 pt-2.5 border-t border-[#D4CCC0]/70 flex flex-wrap items-center justify-between gap-2 font-ui text-[10px] text-[#5C574F]">
        <span className="font-medium text-[#1D3557]">
          {sourceNames.join(' · ')}
        </span>
        <Link
          href={`/story/${encodeURIComponent(story.id)}`}
          onClick={handleClick}
          className="inline-flex items-center gap-1 uppercase tracking-[0.08em] font-semibold text-[#141413] hover:text-[#8B1E24]"
        >
          <span>Full Report</span>
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
    </article>
  );
}
