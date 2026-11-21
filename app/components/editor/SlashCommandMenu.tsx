"use client";

import type { SlashCommandOption } from "./editor-constants";

interface SlashCommandMenuProps {
  options: SlashCommandOption[];
  selectedIndex: number;
  onSelect: (option: SlashCommandOption) => void;
}

/** Floating `/` slash command palette for converting or inserting Notion blocks. */
export function SlashCommandMenu({
  options,
  selectedIndex,
  onSelect,
}: SlashCommandMenuProps) {
  return (
    <div
      role="listbox"
      aria-label="Block commands"
      className="absolute start-0 top-full z-20 mt-1 max-h-72 w-72 overflow-y-auto rounded-lg border border-border bg-surface p-1 shadow-lg"
    >
      {options.map((opt, optIndex) => {
        const selected = optIndex === selectedIndex;
        return (
          <button
            key={opt.id}
            type="button"
            role="option"
            aria-selected={selected}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onSelect(opt)}
            className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-start text-sm transition-colors ${
              selected
                ? "bg-secondary text-foreground"
                : "text-foreground hover:bg-secondary/70"
            }`}
          >
            <span className="font-medium">{opt.label}</span>
            <span className="text-xs text-muted">{opt.hint}</span>
          </button>
        );
      })}
    </div>
  );
}
