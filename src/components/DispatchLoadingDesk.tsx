'use client';

import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  Newspaper,
  Sparkles,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { StorySummary } from '@/lib/types';

interface QuizQuestion {
  category: string;
  question: string;
  options: [string, string, string];
  answerIndex: number;
  fact: string;
}

const BROADSHEET_TRIVIA: QuizQuestion[] = [
  {
    category: 'World Affairs',
    question:
      'Which Swiss city hosts the headquarters of both the World Trade Organization and the World Health Organization?',
    options: ['Zurich', 'Geneva', 'Bern'],
    answerIndex: 1,
    fact: 'Geneva houses the WTO, WHO, and the European headquarters of the United Nations.',
  },
  {
    category: 'Press History',
    question:
      'What does the classic journalism term "inverted pyramid" refer to?',
    options: [
      'Putting key facts first, details later',
      'Printing shorter headlines at the top',
      'Sorting columns strictly by word count',
    ],
    answerIndex: 0,
    fact: 'Editors developed it during the telegraph era so the essential who, what, where, and when survived line drops.',
  },
  {
    category: 'Global Economics',
    question:
      'At which conference in 1944 were the International Monetary Fund and World Bank established?',
    options: ['Yalta Conference', 'Bretton Woods Conference', 'Geneva Summit'],
    answerIndex: 1,
    fact: 'Delegates from 44 Allied nations met at Bretton Woods, New Hampshire, to design postwar monetary rules.',
  },
  {
    category: 'Science & Space',
    question:
      'Roughly how long does light take to travel from the Sun to Earth?',
    options: ['8 minutes', '24 minutes', '90 seconds'],
    answerIndex: 0,
    fact: 'At roughly 150 million kilometres away, sunlight takes about 8 minutes and 20 seconds to reach Earth.',
  },
  {
    category: 'Geography',
    question:
      'Which strait separates Spain on the Iberian Peninsula from Morocco in North Africa?',
    options: ['Strait of Hormuz', 'Strait of Malacca', 'Strait of Gibraltar'],
    answerIndex: 2,
    fact: 'At its narrowest point, the Strait of Gibraltar is only about 14 kilometres (8.9 miles) wide.',
  },
  {
    category: 'Monetary Policy',
    question:
      'In what year was the Bank of England founded to help finance government operations?',
    options: ['1694', '1776', '1848'],
    answerIndex: 0,
    fact: 'Established by Royal Charter in July 1694, it is one of the oldest central banks still operating.',
  },
  {
    category: 'Press Terminology',
    question:
      'In UK newspaper publishing, what does the front-page "masthead" or "titleplate" display?',
    options: [
      'The printer’s serial code',
      'The newspaper’s nameplate & banner',
      'The lead columnist’s biography',
    ],
    answerIndex: 1,
    fact: 'In Fleet Street tradition, the bold front-page title banner at the top of page one is known as the titleplate or masthead.',
  },
  {
    category: 'World Geography',
    question:
      'Which capital city stands at a higher elevation above sea level?',
    options: ['Madrid, Spain', 'Rome, Italy', 'Paris, France'],
    answerIndex: 0,
    fact: 'Sitting on Europe’s Meseta Central plateau at around 650 metres, Madrid is the highest EU national capital.',
  },
  {
    category: 'Trade & Shipping',
    question:
      'Roughly what share of global seaborne crude oil transit passes through the Strait of Hormuz?',
    options: ['Around 5%', 'Around 20%', 'Over 75%'],
    answerIndex: 1,
    fact: 'The narrow Persian Gulf chokepoint routinely handles roughly a fifth of global petroleum liquids trade.',
  },
  {
    category: 'Science & Climate',
    question:
      'Which ocean absorbs the largest share of excess heat trapped by greenhouse gases?',
    options: ['The world’s oceans combined', 'Freshwater lakes', 'The upper stratosphere'],
    answerIndex: 0,
    fact: 'Oceans absorb more than 90% of the excess thermal energy accumulated in Earth’s climate system.',
  },
  {
    category: 'Law & Diplomacy',
    question:
      'In which European city does the International Court of Justice sit?',
    options: ['Brussels', 'Strasbourg', 'The Hague'],
    answerIndex: 2,
    fact: 'The ICJ meets at the Peace Palace in The Hague, the Netherlands—its only principal UN organ outside New York.',
  },
  {
    category: 'Economic Indicators',
    question:
      'What does "core inflation" deliberately exclude from consumer price baskets?',
    options: [
      'Housing and services',
      'Volatile food and energy prices',
      'Imported manufactured goods',
    ],
    answerIndex: 1,
    fact: 'Central banks track core inflation alongside headline CPI to look past temporary fuel or harvest swings.',
  },
  {
    category: 'Journalism Craft',
    question:
      'On a broadsheet page, what is a "standfirst" (or deck)?',
    options: [
      'An introductory summary line under a headline',
      'The final paragraph of an article',
      'A correction published on page two',
    ],
    answerIndex: 0,
    fact: 'Set beneath the main headline, the standfirst bridges into the opening paragraph and signals the dispatch’s angle.',
  },
  {
    category: 'Technology',
    question:
      'In 1969, what was the name of the precursor network that formed the foundation of the modern internet?',
    options: ['ARPANET', 'CERN-Link', 'TELSTAR'],
    answerIndex: 0,
    fact: 'Funded by the US Advanced Research Projects Agency, ARPANET sent its first host-to-host message in October 1969.',
  },
];

const PIPELINE_STEPS = [
  { label: 'Querying corroborating UK & international news wires', atSecond: 0 },
  { label: 'Extracting full-text reporting from reputable outlets', atSecond: 4 },
  { label: 'Cross-checking figures & reconciling timelines', atSecond: 11 },
  { label: 'Composing broadsheet prose & key reported facts', atSecond: 19 },
];

function seedIndexFromId(id?: string): number {
  if (!id) return 0;
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash % BROADSHEET_TRIVIA.length;
}

function formatElapsed(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function DispatchLoadingDesk({
  story,
}: {
  story: StorySummary | null;
}) {
  const [elapsed, setElapsed] = useState(0);
  const [questionIdx, setQuestionIdx] = useState(() =>
    seedIndexFromId(story?.id)
  );
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [score, setScore] = useState({ correct: 0, answered: 0 });

  useEffect(() => {
    const timer = window.setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const currentQuestion = BROADSHEET_TRIVIA[questionIdx];
  const progressPct = Math.min(
    94,
    Math.max(8, Math.round(100 * (1 - Math.exp(-elapsed / 16))))
  );

  const handleSelectOption = (idx: number) => {
    if (selectedOption !== null) return;
    setSelectedOption(idx);
    setScore((prev) => ({
      correct: prev.correct + (idx === currentQuestion.answerIndex ? 1 : 0),
      answered: prev.answered + 1,
    }));
  };

  const handleNextQuestion = () => {
    setQuestionIdx((prev) => (prev + 1) % BROADSHEET_TRIVIA.length);
    setSelectedOption(null);
  };

  return (
    <section
      aria-label="Compiling multi-source newspaper report"
      className="my-8 border border-[#D4CCC0] bg-[#EFEAE0]/60 p-6 sm:p-8"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-0">
        {/* Left: Live Editorial Desk Progress & Timing Alert */}
        <div className="lg:col-span-7 lg:pr-8">
          <div className="flex flex-wrap items-center justify-between gap-2 font-ui text-[10px] uppercase tracking-[0.14em]">
            <span className="inline-flex items-center gap-1.5 font-bold text-[#8B1E24]">
              <Sparkles className="h-3.5 w-3.5 animate-type-pulse" />
              <span>Newsroom Dispatch Desk · Live Compilation</span>
            </span>
            <span className="inline-flex items-center gap-1 font-semibold text-[#1D3557]">
              <Clock className="h-3 w-3" />
              <span>{formatElapsed(elapsed)} elapsed</span>
            </span>
          </div>

          <h2 className="mt-2.5 font-display text-2xl sm:text-3xl font-bold leading-tight text-[#141413]">
            Setting your full broadsheet dispatch…
          </h2>

          <p className="mt-2.5 font-editorial text-[16px] leading-relaxed text-[#2C2925]">
            <strong className="font-semibold text-[#141413]">
              Generating a multi-source article typically takes 15–35 seconds on
              first open.
            </strong>{' '}
            We are querying corroborating outlets, extracting full source
            reporting, and composing a balanced newspaper article. Once
            finished, it is saved permanently for instant reading on future
            visits.
          </p>

          {/* Animated Press Progress Track */}
          <div className="mt-5">
            <div className="flex items-center justify-between font-ui text-[10px] uppercase tracking-[0.1em] text-[#5C574F] mb-1.5">
              <span>Typesetting in progress</span>
              <span>{progressPct}%</span>
            </div>
            <div className="relative h-2 w-full overflow-hidden border border-[#D4CCC0] bg-[#F7F4EE]">
              <div
                className="h-full bg-[#141413] transition-[width] duration-700 ease-out relative overflow-hidden"
                style={{ width: `${progressPct}%` }}
              >
                <span className="animate-press-sweep absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-[#8B1E24] to-transparent opacity-90" />
              </div>
            </div>
          </div>

          {/* 4-Stage Editorial Pipeline */}
          <ol className="mt-5 space-y-2.5 border-t border-[#D4CCC0] pt-4">
            {PIPELINE_STEPS.map((step, idx) => {
              const nextThreshold = PIPELINE_STEPS[idx + 1]?.atSecond ?? 9999;
              const isDone = elapsed >= nextThreshold;
              const isActive = elapsed >= step.atSecond && elapsed < nextThreshold;

              return (
                <li
                  key={step.label}
                  className={`flex items-center gap-2.5 font-ui text-xs ${
                    isDone
                      ? 'text-[#1D3557]'
                      : isActive
                        ? 'font-semibold text-[#141413]'
                        : 'text-[#5C574F]/70'
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-[#1D3557]" />
                  ) : isActive ? (
                    <span className="h-4 w-4 shrink-0 inline-flex items-center justify-center">
                      <span className="h-2.5 w-2.5 rounded-full bg-[#8B1E24] animate-type-pulse" />
                    </span>
                  ) : (
                    <Circle className="h-4 w-4 shrink-0 text-[#D4CCC0]" />
                  )}
                  <span>{step.label}</span>
                </li>
              );
            })}
          </ol>

          {story && story.sources.length > 0 && (
            <div className="mt-5 border-t border-[#D4CCC0] pt-3.5">
              <p className="font-ui text-[10px] uppercase tracking-[0.12em] text-[#5C574F] mb-2">
                Initial Wire Reporting Queued
              </p>
              <div className="flex flex-wrap gap-1.5">
                {story.sources.map((src, idx) => (
                  <span
                    key={`${src.name}-${idx}`}
                    className="border border-[#D4CCC0] bg-[#F7F4EE] px-2 py-0.5 font-ui text-[11px] font-medium text-[#1D3557]"
                  >
                    {src.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Entertaining Interactive Quick Quiz While Waiting */}
        <div className="lg:col-span-5 lg:border-l lg:border-[#D4CCC0] lg:pl-8 pt-6 lg:pt-0 border-t lg:border-t-0 border-[#D4CCC0] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 border-b border-[#D4CCC0] pb-2">
              <span className="inline-flex items-center gap-1.5 font-ui text-[10px] font-bold uppercase tracking-[0.14em] text-[#141413]">
                <Newspaper className="h-3.5 w-3.5 text-[#8B1E24]" />
                <span>While the Presses Run · Quiz</span>
              </span>
              {score.answered > 0 && (
                <span className="font-ui text-[10px] font-semibold uppercase tracking-[0.1em] text-[#1D3557]">
                  Score: {score.correct}/{score.answered}
                </span>
              )}
            </div>

            <p className="mt-3 font-ui text-[10px] uppercase tracking-[0.12em] text-[#8B1E24] font-semibold">
              {currentQuestion.category}
            </p>
            <h3 className="mt-1 font-display text-lg font-bold leading-snug text-[#141413]">
              {currentQuestion.question}
            </h3>

            <div className="mt-3.5 space-y-2">
              {currentQuestion.options.map((opt, idx) => {
                const answered = selectedOption !== null;
                const isSelected = selectedOption === idx;
                const isCorrect = idx === currentQuestion.answerIndex;

                let btnStyle =
                  'border-[#D4CCC0] bg-[#F7F4EE] text-[#141413] hover:border-[#141413]';
                if (answered) {
                  if (isCorrect) {
                    btnStyle =
                      'border-[#1D3557] bg-[#1D3557] text-[#F7F4EE] font-semibold';
                  } else if (isSelected) {
                    btnStyle =
                      'border-[#8B1E24] bg-[#8B1E24] text-[#F7F4EE]';
                  } else {
                    btnStyle =
                      'border-[#D4CCC0]/70 bg-[#F7F4EE]/50 text-[#5C574F]/70';
                  }
                }

                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => handleSelectOption(idx)}
                    disabled={answered}
                    className={`w-full border px-3 py-2 text-left font-editorial text-[15px] leading-snug transition-colors ${
                      answered ? 'cursor-default' : 'cursor-pointer'
                    } ${btnStyle}`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>

            {selectedOption !== null && (
              <p className="mt-3 border-l-2 border-[#1D3557] pl-3 font-editorial text-sm leading-relaxed text-[#2C2925]">
                <strong className="font-semibold text-[#141413]">
                  {selectedOption === currentQuestion.answerIndex
                    ? 'Correct.'
                    : 'Not quite.'}
                </strong>{' '}
                {currentQuestion.fact}
              </p>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-[#D4CCC0] flex items-center justify-between gap-2">
            <span className="font-ui text-[10px] uppercase tracking-[0.08em] text-[#5C574F]">
              Question {questionIdx + 1} of {BROADSHEET_TRIVIA.length}
            </span>
            <button
              type="button"
              onClick={handleNextQuestion}
              className="inline-flex cursor-pointer items-center gap-1 font-ui text-[11px] font-semibold uppercase tracking-[0.1em] text-[#141413] hover:text-[#8B1E24] transition-colors"
            >
              <span>Next Question</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
