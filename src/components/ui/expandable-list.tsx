'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface ExpandableListProps {
  items: React.ReactNode[];
  limit?: number;
}

export function ExpandableList({ items, limit = 3 }: ExpandableListProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!items || items.length === 0) return null;

  // Slice the array based on the current state (expanded/collapsed)
  const visibleItems = isExpanded ? items : items.slice(0, limit);
  const hasMore = items.length > limit;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3">
        {visibleItems}
      </div>

      {hasMore && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="inline-flex items-center justify-center gap-2 text-sm font-medium text-brand hover:text-brand/80 transition-colors py-2 mt-2"
        >
          {isExpanded ? (
            <>
              Show less <ChevronUp className="w-4 h-4" />
            </>
          ) : (
            <>
              Show more <ChevronDown className="w-4 h-4" />
            </>
          )}
        </button>
      )}
    </div>
  );
}