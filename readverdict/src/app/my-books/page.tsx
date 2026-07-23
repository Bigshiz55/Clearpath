import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/PageHeader';
import { MyBooksView } from '@/components/books/MyBooksView';

export const metadata: Metadata = { title: 'My Books' };

export default function MyBooksPage() {
  return (
    <div className="animate-fade-up space-y-8">
      <PageHeader
        eyebrow="Your shelves, and what they teach"
        title="My Books"
        description="Saved, reading, finished, and DNF — every action teaches your Reader DNA. File a reading appeal when a book starts fighting you."
      />
      <MyBooksView />
    </div>
  );
}
