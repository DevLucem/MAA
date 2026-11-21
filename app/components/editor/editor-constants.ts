import type { BlockColor, DatabaseViewType } from "../../lib/database-types";
import type { BlockType } from "../../lib/docs-utils";

export interface BasicBlockOption {
  type: BlockType;
  label: string;
  hint: string;
  placeholder: string;
}

export const BASIC_BLOCK_OPTIONS: BasicBlockOption[] = [
  {
    type: "paragraph",
    label: "Paragraph",
    hint: "Plain text",
    placeholder: "Press / to insert blocks",
  },
  {
    type: "h1",
    label: "Heading 1",
    hint: "# Big section heading",
    placeholder: "Heading 1",
  },
  {
    type: "h2",
    label: "Heading 2",
    hint: "## Medium section heading",
    placeholder: "Heading 2",
  },
  {
    type: "h3",
    label: "Heading 3",
    hint: "### Small section heading",
    placeholder: "Heading 3",
  },
  {
    type: "bullet",
    label: "Bulleted list",
    hint: "- Simple bullet item",
    placeholder: "List item",
  },
  {
    type: "numbered",
    label: "Numbered list",
    hint: "1. Ordered list item",
    placeholder: "List item",
  },
  {
    type: "todo",
    label: "To-do",
    hint: "[] Track tasks",
    placeholder: "To-do",
  },
  {
    type: "quote",
    label: "Quote",
    hint: "> Capture a quote",
    placeholder: "Quote",
  },
  {
    type: "callout",
    label: "Callout",
    hint: "Highlight important info",
    placeholder: "Callout text…",
  },
  {
    type: "code",
    label: "Code",
    hint: "``` Monospace snippet",
    placeholder: "Write code…",
  },
  {
    type: "divider",
    label: "Divider",
    hint: "--- Horizontal rule",
    placeholder: "",
  },
];

export interface SlashCommandOption {
  id: string;
  label: string;
  hint: string;
  keywords: string;
  type: BlockType;
  dbViewType?: DatabaseViewType;
}

export const SLASH_COMMANDS: SlashCommandOption[] = [
  ...BASIC_BLOCK_OPTIONS.map((opt) => ({
    id: opt.type,
    label: opt.label,
    hint: opt.hint,
    keywords: `${opt.type} ${opt.label} ${opt.hint}`,
    type: opt.type,
  })),
  {
    id: "database",
    label: "Database - Inline",
    hint: "Inline collection",
    keywords: "database db collection table inline",
    type: "database",
    dbViewType: "table",
  },
  {
    id: "db-table",
    label: "Table view",
    hint: "Structured rows",
    keywords: "table database view",
    type: "database",
    dbViewType: "table",
  },
  {
    id: "db-board",
    label: "Board view",
    hint: "Kanban cards",
    keywords: "board kanban columns database",
    type: "database",
    dbViewType: "board",
  },
  {
    id: "db-timeline",
    label: "Timeline view",
    hint: "Gantt schedule",
    keywords: "timeline gantt roadmap database",
    type: "database",
    dbViewType: "timeline",
  },
  {
    id: "db-gallery",
    label: "Gallery view",
    hint: "Visual cards",
    keywords: "gallery grid cards database",
    type: "database",
    dbViewType: "gallery",
  },
  {
    id: "db-calendar",
    label: "Calendar view",
    hint: "Month schedule",
    keywords: "calendar dates month database",
    type: "database",
    dbViewType: "calendar",
  },
  {
    id: "page-link",
    label: "Sub-page",
    hint: "Embed a new page",
    keywords: "page subpage nested link",
    type: "page-link",
  },
  {
    id: "columns",
    label: "2 Columns",
    hint: "Side-by-side blocks",
    keywords: "columns layout grid split",
    type: "columns",
  },
  {
    id: "bookmark",
    label: "Bookmark",
    hint: "Save a web link",
    keywords: "bookmark link url embed",
    type: "bookmark",
  },
  {
    id: "synced-block",
    label: "Synced block",
    hint: "Sync edits across pages",
    keywords: "sync synced block mirror",
    type: "paragraph",
  },
  {
    id: "link-synced",
    label: "Link existing block",
    hint: "Embed synced block from any page",
    keywords: "link sync synced block embed mirror reuse",
    type: "paragraph",
  },
];

export const BLOCK_COLOR_OPTIONS: Array<{ value: BlockColor; label: string }> = [
  { value: "default", label: "Default" },
  { value: "gray", label: "Gray text" },
  { value: "brown", label: "Brown text" },
  { value: "orange", label: "Orange text" },
  { value: "yellow", label: "Yellow text" },
  { value: "green", label: "Green text" },
  { value: "blue", label: "Blue text" },
  { value: "purple", label: "Purple text" },
  { value: "pink", label: "Pink text" },
  { value: "red", label: "Red text" },
  { value: "gray_bg", label: "Gray background" },
  { value: "brown_bg", label: "Brown background" },
  { value: "orange_bg", label: "Orange background" },
  { value: "yellow_bg", label: "Yellow background" },
  { value: "green_bg", label: "Green background" },
  { value: "blue_bg", label: "Blue background" },
  { value: "purple_bg", label: "Purple background" },
  { value: "pink_bg", label: "Pink background" },
  { value: "red_bg", label: "Red background" },
];

export const BLOCK_PLACEHOLDERS: Partial<Record<BlockType, string>> =
  Object.fromEntries(
    BASIC_BLOCK_OPTIONS.map((opt) => [opt.type, opt.placeholder])
  );

export const MARKDOWN_SHORTCUTS: Array<{ pattern: RegExp; type: BlockType }> = [
  { pattern: /^###\s$/, type: "h3" },
  { pattern: /^##\s$/, type: "h2" },
  { pattern: /^#\s$/, type: "h1" },
  { pattern: /^[-*]\s$/, type: "bullet" },
  { pattern: /^1\.\s$/, type: "numbered" },
  { pattern: /^\[\s?\]\s$/, type: "todo" },
  { pattern: /^>\s$/, type: "quote" },
  { pattern: /^```$/, type: "code" },
  { pattern: /^---$/, type: "divider" },
];

export const BLOCK_STYLE_MAP: Partial<Record<BlockType, string>> = {
  paragraph: "text-base leading-7",
  h1: "pt-3 text-3xl font-bold tracking-tight",
  h2: "pt-2 text-2xl font-semibold tracking-tight",
  h3: "pt-1 text-xl font-semibold",
  bullet: "text-base leading-7",
  numbered: "text-base leading-7",
  todo: "text-base leading-7",
  quote: "border-s-4 ps-4 italic",
  callout: "text-sm leading-6",
  code: "rounded-lg border border-border bg-secondary p-3.5 font-mono text-sm leading-6 whitespace-pre-wrap",
};
