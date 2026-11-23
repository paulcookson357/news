import { connection } from 'next/server';
import { Suspense } from 'react';
import { FrontPageClient } from '@/components/FrontPageClient';
import { fetchLatestEdition } from '@/lib/aggregator';
import { loadEdition } from '@/lib/storage';

async function LiveFrontPage() {
  await connection();
  let edition = await loadEdition();
  if (!edition || edition.stories.length === 0) {
    const result = await fetchLatestEdition();
    edition = result.edition;
  }
  return <FrontPageClient initialEdition={edition} />;
}

function FrontPageLoadingShell() {
  return (
    <div className="min-h-screen bg-[#F7F4EE] px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1440px] py-8 text-center">
        <div className="border-b-2 border-[#141413] pb-6">
          <p className="font-ui text-[11px] uppercase tracking-[0.26em] text-[#8B1E24] font-semibold">
            Independent · Balanced · Source-Attributed
          </p>
          <h1 className="mt-2 font-display text-5xl sm:text-6xl font-extrabold tracking-tight text-[#141413]">
            THE MERIDIAN
          </h1>
          <p className="mt-3 font-editorial italic text-base text-[#5C574F]">
            Assembling the latest dispatches from free UK &amp; international
            news wires…
          </p>
        </div>
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
          {[1, 2, 3].map((col) => (
            <div
              key={col}
              className="border-t border-[#D4CCC0] pt-4 space-y-3 animate-pulse"
            >
              <div className="h-3 w-24 bg-[#D4CCC0]" />
              <div className="h-6 w-full bg-[#EFEAE0]" />
              <div className="h-4 w-5/6 bg-[#EFEAE0]" />
              <div className="h-4 w-2/3 bg-[#EFEAE0]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={<FrontPageLoadingShell />}>
      <LiveFrontPage />
    </Suspense>
  );
}
