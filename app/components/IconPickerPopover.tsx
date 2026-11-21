"use client";

import { PAGE_ICONS } from "../lib/docs-utils";

interface IconPickerPopoverProps {
  selectedIcon?: string;
  label?: string;
  className?: string;
  onSelect: (emoji: string | undefined) => void;
}

/** Shared Notion-style emoji icon picker popover with Random and Remove actions. */
export function IconPickerPopover({
  selectedIcon,
  label = "Choose icon",
  className = "mt-1",
  onSelect,
}: IconPickerPopoverProps) {
  return (
    <div
      role="dialog"
      aria-label={label}
      className={`absolute start-0 top-full z-30 w-72 rounded-lg border border-border bg-canvas p-2.5 shadow-lg ${className}`}
    >
      <div className="flex items-center justify-between gap-2 pb-2">
        <span className="text-xs font-semibold text-muted">Icons</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => {
              const pool = PAGE_ICONS.filter((emoji) => emoji !== selectedIcon);
              const picked =
                pool[Math.floor(Math.random() * pool.length)] ?? PAGE_ICONS[0];
              onSelect(picked);
            }}
            className="rounded px-2 py-1 text-xs font-medium text-muted hover:bg-secondary hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
          >
            Random
          </button>
          {selectedIcon && (
            <button
              type="button"
              onClick={() => onSelect(undefined)}
              className="rounded px-2 py-1 text-xs font-medium text-muted hover:bg-secondary hover:text-danger focus-visible:outline-2 focus-visible:outline-primary"
            >
              Remove
            </button>
          )}
        </div>
      </div>

      <div className="grid max-h-56 grid-cols-6 gap-1 overflow-y-auto">
        {PAGE_ICONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={`Use ${emoji} icon`}
            onClick={() => onSelect(emoji)}
            className={`inline-flex size-9 items-center justify-center rounded-md text-xl transition-colors hover:bg-secondary focus-visible:outline-2 focus-visible:outline-primary ${
              selectedIcon === emoji ? "bg-secondary" : ""
            }`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
