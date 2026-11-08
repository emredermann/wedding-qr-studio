"use client";

import { MediaThumb } from "@/components/media/MediaThumb";
import type { MediaDto } from "@/types/domain";

export function MediaGrid({
  items,
  onOpen,
  renderOverlay,
  selectable,
  selected,
  onToggleSelect,
}: {
  items: MediaDto[];
  onOpen: (index: number) => void;
  renderOverlay?: (item: MediaDto) => React.ReactNode;
  selectable?: boolean;
  selected?: ReadonlySet<string>;
  onToggleSelect?: (id: string) => void;
}) {
  return (
    <ul className="grid grid-cols-3 gap-1 sm:grid-cols-4 sm:gap-1.5 lg:grid-cols-6">
      {items.map((item, index) => {
        const isSelected = selected?.has(item.id) ?? false;
        return (
          <li key={item.id} className="relative aspect-square overflow-hidden rounded-md">
            <button
              type="button"
              onClick={() => (selectable && onToggleSelect ? onToggleSelect(item.id) : onOpen(index))}
              className={`block h-full w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
                isSelected ? "opacity-80 ring-4 ring-amber-500 ring-inset" : ""
              }`}
              aria-label={item.note ?? item.originalName}
            >
              <MediaThumb item={item} />
            </button>
            {renderOverlay?.(item)}
          </li>
        );
      })}
    </ul>
  );
}
