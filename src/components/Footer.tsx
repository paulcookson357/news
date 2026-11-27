const REPUTABLE_SOURCE_LIST = [
  'BBC News',
  'The Guardian',
  'Sky News',
  'Associated Press',
  'Deutsche Welle',
  'France 24',
  'Al Jazeera',
  'NPR',
  'PBS NewsHour',
  'ABC News (AU)',
  'Ars Technica',
  'CNBC',
];

export function Footer() {
  return (
    <footer className="mt-10 border-t-[3px] border-double border-[#2C2925] bg-[#EFEAE0]/60 py-8">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          <div className="md:col-span-5">
            <p className="font-display text-2xl font-bold tracking-tight text-[#141413]">
              THE MERIDIAN
            </p>
            <p className="mt-2 font-editorial text-sm leading-relaxed text-[#5C574F]">
              An independent, non-partisan broadsheet news reader. Front-page
              summaries are distilled directly from free, publicly accessible
              news feeds. Opening any headline triggers a second live internet
              search across reputable outlets to assemble an expanded news
              report.
            </p>
          </div>

          <div className="md:col-span-4">
            <h2 className="font-ui text-[11px] font-semibold uppercase tracking-[0.14em] text-[#141413]">
              Active Reputable Sources
            </h2>
            <p className="mt-2 font-ui text-xs leading-relaxed text-[#5C574F]">
              {REPUTABLE_SOURCE_LIST.join(' · ')}
            </p>
          </div>

          <div className="md:col-span-3">
            <h2 className="font-ui text-[11px] font-semibold uppercase tracking-[0.14em] text-[#141413]">
              Editorial Standard
            </h2>
            <p className="mt-2 font-ui text-xs leading-relaxed text-[#5C574F]">
              Opinion columns, commentary blogs, and paywalled tabloids are
              excluded automatically. Every expanded report references and links
              to its original reporting outlets below the article.
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
