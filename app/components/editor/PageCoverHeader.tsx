"use client";

import { type RefObject, useState } from "react";
import { PAGE_COVERS } from "../../lib/docs-utils";

interface PageCoverBannerProps {
  coverBg: string;
  changeBtnRef?: RefObject<HTMLButtonElement | null>;
  onTogglePicker: () => void;
  onRemove: () => void;
}

/** Top banner displaying the active page cover with Change and Remove actions. */
export function PageCoverBanner({
  coverBg,
  changeBtnRef,
  onTogglePicker,
  onRemove,
}: PageCoverBannerProps) {
  return (
    <div
      className="group relative h-40 w-full sm:h-48"
      style={{ background: coverBg }}
    >
      <div className="mx-auto flex h-full max-w-4xl items-end justify-end px-6 pb-3 sm:px-12">
        <div className="flex items-center gap-1.5 opacity-90 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
          <button
            ref={changeBtnRef}
            type="button"
            onClick={onTogglePicker}
            className="rounded-md border border-border bg-canvas/90 px-2.5 py-1 text-xs font-medium text-foreground shadow-sm backdrop-blur hover:bg-canvas"
          >
            Change cover
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="rounded-md border border-border bg-canvas/90 px-2.5 py-1 text-xs font-medium text-danger shadow-sm backdrop-blur hover:bg-canvas"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

interface CoverPickerPopoverProps {
  coverPickerRef: RefObject<HTMLDivElement | null>;
  currentCover?: string;
  onSelectCover: (cover: string) => void;
}

/** Popover for selecting a gradient preset or custom https:// cover image URL. */
export function CoverPickerPopover({
  coverPickerRef,
  currentCover,
  onSelectCover,
}: CoverPickerPopoverProps) {
  const [customCoverUrl, setCustomCoverUrl] = useState("");

  return (
    <div
      ref={coverPickerRef}
      role="dialog"
      aria-label="Choose page cover"
      className="absolute start-0 top-full z-30 mt-1 w-80 rounded-lg border border-border bg-canvas p-3 shadow-lg"
    >
      <p className="mb-2 text-xs font-semibold text-muted">
        Color &amp; Gradient Covers
      </p>
      <div className="grid grid-cols-5 gap-1.5">
        {PAGE_COVERS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            aria-label={`${preset.label} cover`}
            onClick={() => onSelectCover(preset.id)}
            style={{ background: preset.background }}
            className={`h-9 rounded-md border transition-transform hover:scale-105 ${
              currentCover === preset.id
                ? "border-primary ring-2 ring-primary"
                : "border-border"
            }`}
          />
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = customCoverUrl.trim();
          if (trimmed.startsWith("https://")) {
            onSelectCover(trimmed);
          }
        }}
        className="mt-3 flex items-center gap-1.5"
      >
        <input
          type="url"
          aria-label="Custom cover https URL"
          placeholder="https://… image URL"
          value={customCoverUrl}
          onChange={(e) => setCustomCoverUrl(e.currentTarget.value)}
          className="h-7 min-w-0 flex-1 rounded border border-border bg-surface px-2 text-xs text-foreground"
        />
        <button
          type="submit"
          className="primary inline-flex h-7 items-center rounded px-2.5 text-xs font-medium"
        >
          Apply
        </button>
      </form>
    </div>
  );
}
