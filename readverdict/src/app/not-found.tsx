import Link from 'next/link';
import { SearchBar } from '@/components/SearchBar';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <h1 className="font-serif text-3xl font-bold text-paper-50">
        We couldn’t find that page
      </h1>
      <p className="mt-3 text-paper-200">
        The book or page you’re after isn’t here. Try searching for a title or
        author instead.
      </p>
      <div className="mt-8">
        <SearchBar autoFocus />
      </div>
      <p className="mt-6 text-sm">
        <Link href="/" className="link-quiet">
          ← Back home
        </Link>
      </p>
    </div>
  );
}
