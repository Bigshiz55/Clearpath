import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchExperience } from '@/components/search/SearchExperience';

export const metadata: Metadata = { title: 'Search' };

export default function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  return (
    <div className="animate-fade-up space-y-6">
      <PageHeader
        eyebrow="Put a book on trial"
        title="Search"
        description="Find any book and get a fast, personalized verdict. Real data from Open Library."
      />
      <SearchExperience initialQuery={(searchParams.q ?? '').trim()} />
    </div>
  );
}
