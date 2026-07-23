'use client';

import { useState } from 'react';
import { SegmentedControl } from '@/components/ui/SegmentedControl';

export function SegmentedControlDemo() {
  const [view, setView] = useState<'grid' | 'list'>('grid');
  return (
    <div className="flex items-center gap-4">
      <SegmentedControl
        ariaLabel="View"
        value={view}
        onChange={setView}
        options={[
          { value: 'grid', label: 'Grid' },
          { value: 'list', label: 'List' },
        ]}
      />
      <span className="text-sm text-ivory-400">Selected: {view}</span>
    </div>
  );
}
