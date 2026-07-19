import type { Metadata } from 'next';
import { PhotoAdd } from '@/components/PhotoAdd';
import { ConnectPhone } from '@/components/ConnectPhone';

export const metadata: Metadata = { title: 'Add from your phone · WatchVrdIQt' };

export default function ConnectPage() {
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-bold text-white sm:text-3xl">📱 Add from your phone</h1>
      <p className="mt-2 text-sm text-slate-400">
        The easy way: snap a photo and I’ll read the title. Or set up Siri / share-sheet below.
      </p>

      <div className="mt-5">
        <PhotoAdd />
      </div>

      <div className="mt-6">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Hands-free (optional setup)
        </div>
        <ConnectPhone />
      </div>
    </div>
  );
}
