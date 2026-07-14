import { renderIcon } from '@/lib/pwa-icon';

export const runtime = 'nodejs';

export function GET() {
  return renderIcon(180, 0.12);
}
