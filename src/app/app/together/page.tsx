import type { Metadata } from 'next';
import { CourtIntro } from '@/components/court/CourtIntro';
import { TogetherSecondary } from '@/components/TogetherSecondary';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Tonight, Together · WatchVerd1ct',
};

/**
 * TONIGHT, TOGETHER — one page, one action. It used to describe Live Court
 * twice (intro panel + a second card with near-identical copy) and offer
 * three competing entry cards. Now: heading, ONE Live Court block with the
 * page's single filled button, and the other two modes as text links that
 * disclose their existing panels (TogetherSecondary).
 */
export default async function TogetherPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold text-white sm:text-3xl">Tonight, Together</h1>
      <p className="mt-2 text-sm text-slate-400">
        One pick the whole room will actually agree on — never suggesting something on someone’s
        hard-no list.
      </p>

      <div className="mt-5">
        <CourtIntro big />
      </div>

      <TogetherSecondary />
    </div>
  );
}
