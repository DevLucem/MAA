import type { BlockColor, NotionColor, PropertyValue } from "./database-types";

export type TodoEmbedRange = "all" | "day" | "week" | "month";
export type TodoEmbedLayout = "list" | "board";

export interface TodoEmbedConfig {
  projectId: string;
  sectionId?: string;
  range?: TodoEmbedRange;
  layout?: TodoEmbedLayout;
  fullWidth?: boolean;
}

export type BlockType =
  | "paragraph"
  | "h1"
  | "h2"
  | "h3"
  | "bullet"
  | "numbered"
  | "todo"
  | "quote"
  | "callout"
  | "code"
  | "divider"
  | "database"
  | "page-link"
  | "columns"
  | "bookmark"
  | "todo-embed";

export interface DocBlock {
  id: string;
  type: BlockType;
  content: string;
  checked?: boolean;
  indent?: number;
  color?: BlockColor;
  calloutIcon?: string;
  databaseId?: string;
  linkedDocId?: string;
  columns?: DocBlock[][];
  url?: string;
  syncGroupId?: string;
  todoEmbed?: TodoEmbedConfig;
}

export interface Doc {
  id: string;
  title: string;
  blocks: DocBlock[];
  createdAt: string;
  updatedAt: string;
  parentId?: string;
  databaseId?: string;
  properties?: Record<string, PropertyValue>;
  favorite?: boolean;
  icon?: string;
  cover?: string;
  fullWidth?: boolean;
  trashedAt?: string;
}

export const PAGE_ICONS: readonly string[] = [
  "📄",
  "📝",
  "📘",
  "📚",
  "💡",
  "🚀",
  "🎯",
  "✅",
  "🔥",
  "⚡",
  "🧭",
  "📌",
  "🗂️",
  "📊",
  "🛠️",
  "🧪",
  "🎨",
  "🧩",
  "🌱",
  "⭐",
  "🔒",
  "💬",
  "📅",
  "🏠",
  "📻",
  "💰",
  "🛡️",
  "💵",
  "💱",
  "👤",
  "🧑🏾‍🌾",
  "🖥️",
  "✔️",
  "🎬",
  "🌅",
  "🌽",
  "🫘",
  "🌲",
  "🧘🏾‍♂️",
  "💼",
  "🏨",
];

export interface PageCoverPreset {
  id: string;
  label: string;
  background: string;
}

export const PAGE_COVERS: readonly PageCoverPreset[] = [
  {
    id: "cosmos",
    label: "Cosmos",
    background:
      "radial-gradient(circle at 20% 25%, #3b82f6 0%, transparent 45%), radial-gradient(circle at 80% 35%, #a855f7 0%, transparent 50%), linear-gradient(135deg, #090d16 0%, #1e1b4b 55%, #0f172a 100%)",
  },
  {
    id: "meadow",
    label: "Meadow",
    background:
      "radial-gradient(circle at 75% 25%, #fde047 0%, transparent 40%), linear-gradient(135deg, #14532d 0%, #15803d 48%, #4d7c0f 100%)",
  },
  {
    id: "aurora",
    label: "Aurora",
    background:
      "linear-gradient(135deg, #0f172a 0%, #0e7490 45%, #10b981 75%, #8b5cf6 100%)",
  },
  {
    id: "terracotta",
    label: "Terracotta",
    background:
      "linear-gradient(135deg, #7c2d12 0%, #c2410c 45%, #ea580c 75%, #f59e0b 100%)",
  },
  {
    id: "slate",
    label: "Slate",
    background:
      "linear-gradient(135deg, #18181b 0%, #3f3f46 50%, #71717a 100%)",
  },
  {
    id: "sunset",
    label: "Sunset",
    background:
      "linear-gradient(135deg, #be123c 0%, #f43f5e 45%, #fb923c 100%)",
  },
  {
    id: "forest",
    label: "Forest",
    background:
      "radial-gradient(circle at 80% 20%, #86efac 0%, transparent 45%), linear-gradient(135deg, #064e3b 0%, #047857 55%, #166534 100%)",
  },
  {
    id: "sand",
    label: "Sand",
    background:
      "linear-gradient(135deg, #fef3c7 0%, #fde68a 50%, #f59e0b 100%)",
  },
  {
    id: "ocean",
    label: "Ocean",
    background:
      "linear-gradient(135deg, #1e3a8a 0%, #2563eb 50%, #38bdf8 100%)",
  },
  {
    id: "rose",
    label: "Rose",
    background:
      "linear-gradient(135deg, #831843 0%, #db2777 55%, #f472b6 100%)",
  },
];

const COVER_MAP = new Map(PAGE_COVERS.map((preset) => [preset.id, preset.background]));

/** Resolves a cover preset id or validated https:// image URL to CSS background value. */
export function resolveCoverBackground(cover?: string): string | null {
  if (!cover || typeof cover !== "string") return null;
  const trimmed = cover.trim();
  const preset = COVER_MAP.get(trimmed);
  if (preset) return preset;
  if (trimmed.startsWith("https://")) {
    const escaped = trimmed.replace(/["'()\\\n\r]/g, "");
    return `url("${escaped}") center / cover no-repeat`;
  }
  return null;
}

export interface DocStats {
  wordCount: number;
  readingMinutes: number;
  blockCount: number;
  todoTotal: number;
  todoCompleted: number;
  preview: string;
}

export interface BlockGroupCount {
  label: string;
  count: number;
}

export interface OpenTodoItem {
  docId: string;
  docTitle: string;
  blockId: string;
  text: string;
}

export interface WorkspaceInsights {
  totalDocs: number;
  totalWords: number;
  totalReadingMinutes: number;
  totalBlocks: number;
  avgWordsPerDoc: number;
  todoTotal: number;
  todoCompleted: number;
  updatedTodayCount: number;
  blockTypeCounts: BlockGroupCount[];
  openTodos: OpenTodoItem[];
}

const ALLOWED_INLINE_TAGS = new Set([
  "STRONG",
  "B",
  "EM",
  "I",
  "U",
  "S",
  "CODE",
  "BR",
  "A",
  "SPAN",
]);

const ALLOWED_NOTION_COLORS = new Set<NotionColor>([
  "default",
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
]);

/** Validates href attributes for links inside blocks and bookmarks. */
export function isSafeHref(href: string): boolean {
  if (!href || typeof href !== "string") return false;
  const trimmed = href.trim();
  if (trimmed.startsWith("/docs/") || trimmed.startsWith("/todos/")) {
    return true;
  }
  return /^https?:\/\//i.test(trimmed);
}

/** Generates a unique identifier using crypto.randomUUID with a timestamp fallback. */
export function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const INLINE_SANITIZER_CONFIG = {
  elements: [
    "strong",
    "b",
    "em",
    "i",
    "u",
    "s",
    "code",
    "br",
    { name: "a", attributes: ["href"] },
    { name: "span", attributes: ["data-color"] },
  ],
  replaceWithChildrenElements: [
    "p",
    "div",
    "font",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "li",
    "ul",
    "ol",
    "blockquote",
  ],
};

/** Sanitizes inline WYSIWYG HTML using Element.setHTML() (with DOMParser fallback). */
export function sanitizeInlineHtml(html: string): string {
  if (!html) return "";

  if (typeof window === "undefined" || typeof document === "undefined") {
    return html.replace(/<[^>]*>/g, "");
  }

  let sourceRoot: Element | null = null;
  let ownerDoc: Document = document;

  if ("setHTML" in Element.prototype) {
    try {
      const sandbox = document.createElement("div") as HTMLDivElement & {
        setHTML: (input: string, options?: { sanitizer?: unknown }) => void;
      };
      sandbox.setHTML(html, { sanitizer: INLINE_SANITIZER_CONFIG });
      sourceRoot = sandbox;
      ownerDoc = document;
    } catch {
      const fallbackDoc = new DOMParser().parseFromString(html, "text/html");
      sourceRoot = fallbackDoc.body;
      ownerDoc = fallbackDoc;
    }
  } else {
    const fallbackDoc = new DOMParser().parseFromString(html, "text/html");
    sourceRoot = fallbackDoc.body;
    ownerDoc = fallbackDoc;
  }

  if (!sourceRoot) return "";

  const cleanNode = (node: Node, targetDoc: Document): Node | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      return targetDoc.createTextNode(node.textContent ?? "");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    const el = node as Element;
    const tag = el.tagName.toUpperCase();

    if (tag === "SCRIPT" || tag === "STYLE") {
      return null;
    }

    const fragment = targetDoc.createDocumentFragment();
    for (const child of Array.from(el.childNodes)) {
      const cleaned = cleanNode(child, targetDoc);
      if (cleaned) fragment.appendChild(cleaned);
    }

    if (!ALLOWED_INLINE_TAGS.has(tag)) {
      return fragment;
    }

    if (tag === "A") {
      const href = el.getAttribute("href")?.trim() ?? "";
      if (!isSafeHref(href)) {
        return fragment;
      }
      const anchor = targetDoc.createElement("a");
      anchor.setAttribute("href", href);
      if (/^https?:\/\//i.test(href)) {
        anchor.setAttribute("target", "_blank");
        anchor.setAttribute("rel", "noopener noreferrer");
      }
      anchor.appendChild(fragment);
      return anchor;
    }

    if (tag === "SPAN") {
      const color = el.getAttribute("data-color")?.trim() as
        | NotionColor
        | undefined;
      if (!color || !ALLOWED_NOTION_COLORS.has(color)) {
        return fragment;
      }
      const span = targetDoc.createElement("span");
      span.setAttribute("data-color", color);
      span.appendChild(fragment);
      return span;
    }

    const cleanEl = targetDoc.createElement(tag.toLowerCase());
    if (tag !== "BR") {
      cleanEl.appendChild(fragment);
    }
    return cleanEl;
  };

  const container = ownerDoc.createElement("div");
  for (const child of Array.from(sourceRoot.childNodes)) {
    const cleaned = cleanNode(child, ownerDoc);
    if (cleaned) container.appendChild(cleaned);
  }
  return container.innerHTML;
}

/** Converts inline HTML to normalized plain text for word counts and previews. */
export function htmlToPlainText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/** Flattens document blocks recursively (expanding column containers). */
export function flattenDocBlocks(blocks: DocBlock[]): DocBlock[] {
  const result: DocBlock[] = [];
  for (const block of blocks) {
    result.push(block);
    if (block.type === "columns" && Array.isArray(block.columns)) {
      for (const col of block.columns) {
        result.push(...flattenDocBlocks(col));
      }
    }
  }
  return result;
}

/** Computes word count, reading time, task counts, and preview text for a document. */
export function getDocStats(doc: Doc): DocStats {
  let wordCount = countWords(doc.title);
  let todoTotal = 0;
  let todoCompleted = 0;
  let preview = "";

  const flat = flattenDocBlocks(doc.blocks);
  for (const block of flat) {
    if (block.type === "todo") {
      todoTotal += 1;
      if (block.checked) todoCompleted += 1;
    }
    if (
      block.type === "divider" ||
      block.type === "database" ||
      block.type === "columns" ||
      block.type === "todo-embed"
    ) {
      continue;
    }

    const rawText =
      block.type === "bookmark"
        ? htmlToPlainText(block.content) || block.url || ""
        : htmlToPlainText(block.content);

    if (rawText) {
      wordCount += countWords(rawText);
      if (!preview && block.type !== "page-link") {
        preview =
          rawText.length > 140 ? `${rawText.slice(0, 137)}…` : rawText;
      }
    }
  }

  return {
    wordCount,
    readingMinutes: wordCount > 0 ? Math.max(1, Math.ceil(wordCount / 200)) : 0,
    blockCount: flat.length,
    todoTotal,
    todoCompleted,
    preview,
  };
}

/** Aggregates workspace-level metrics, block type distribution, and open to-dos across docs. */
export function getWorkspaceInsights(
  docs: Doc[],
  todayIsoPrefix?: string
): WorkspaceInsights {
  let totalWords = 0;
  let totalReadingMinutes = 0;
  let totalBlocks = 0;
  let todoTotal = 0;
  let todoCompleted = 0;
  let updatedTodayCount = 0;

  let paragraphs = 0;
  let headings = 0;
  let lists = 0;
  let todos = 0;
  let quotesCallouts = 0;
  let codeBlocks = 0;
  let dividers = 0;
  let databasesAndEmbeds = 0;

  const openTodos: OpenTodoItem[] = [];

  for (const doc of docs) {
    const stats = getDocStats(doc);
    totalWords += stats.wordCount;
    totalReadingMinutes += stats.readingMinutes;
    totalBlocks += stats.blockCount;
    todoTotal += stats.todoTotal;
    todoCompleted += stats.todoCompleted;

    if (todayIsoPrefix && doc.updatedAt.slice(0, 10) === todayIsoPrefix) {
      updatedTodayCount += 1;
    }

    const flat = flattenDocBlocks(doc.blocks);
    for (const block of flat) {
      switch (block.type) {
        case "paragraph":
          if (htmlToPlainText(block.content)) paragraphs += 1;
          break;
        case "h1":
        case "h2":
        case "h3":
          headings += 1;
          break;
        case "bullet":
        case "numbered":
          lists += 1;
          break;
        case "todo":
          todos += 1;
          if (!block.checked && openTodos.length < 10) {
            const text = htmlToPlainText(block.content);
            if (text) {
              openTodos.push({
                docId: doc.id,
                docTitle: doc.title.trim() || "Untitled",
                blockId: block.id,
                text,
              });
            }
          }
          break;
        case "quote":
        case "callout":
          quotesCallouts += 1;
          break;
        case "code":
          codeBlocks += 1;
          break;
        case "divider":
          dividers += 1;
          break;
        case "database":
        case "page-link":
        case "bookmark":
        case "columns":
        case "todo-embed":
          databasesAndEmbeds += 1;
          break;
      }
    }
  }

  return {
    totalDocs: docs.length,
    totalWords,
    totalReadingMinutes,
    totalBlocks,
    avgWordsPerDoc: docs.length > 0 ? Math.round(totalWords / docs.length) : 0,
    todoTotal,
    todoCompleted,
    updatedTodayCount,
    blockTypeCounts: [
      { label: "Paragraphs", count: paragraphs },
      { label: "Headings", count: headings },
      { label: "Lists", count: lists },
      { label: "To-dos", count: todos },
      { label: "Quotes & Callouts", count: quotesCallouts },
      { label: "Code", count: codeBlocks },
      { label: "Dividers", count: dividers },
      { label: "Databases & Links", count: databasesAndEmbeds },
    ],
    openTodos,
  };
}

/** Returns the cycle-safe ancestor chain from root doc down to the target doc. */
export function getDocAncestors(docs: Doc[], docId: string): Doc[] {
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  const chain: Doc[] = [];
  const visited = new Set<string>();

  let current = byId.get(docId);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  return chain;
}

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Formats a relative edited timestamp safely across SSR and client updates. */
export function formatEditedTime(iso: string, nowMs: number | null): string {
  if (nowMs === null) return "Edited";
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "Edited";

  const diffSeconds = Math.max(0, Math.floor((nowMs - parsed) / 1000));
  if (diffSeconds < 60) return "Edited just now";

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `Edited ${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Edited ${diffHours}h ago`;

  const date = new Date(parsed);
  return `Edited ${SHORT_MONTHS[date.getMonth()]} ${date.getDate()}`;
}

function formatTodoEmbedHref(embed: TodoEmbedConfig): string {
  const base = `/todos/project/${encodeURIComponent(embed.projectId)}`;
  return embed.sectionId
    ? `${base}?section=${encodeURIComponent(embed.sectionId)}`
    : base;
}

function serializeBlocksToMarkdown(blocks: DocBlock[]): string[] {
  const lines: string[] = [];
  let numbered = 0;

  for (const block of blocks) {
    if (block.type === "numbered") {
      numbered += 1;
    } else {
      numbered = 0;
    }

    const indentPrefix = block.indent && block.indent > 0 ? "  ".repeat(block.indent) : "";
    const text =
      block.type === "code" ? block.content : htmlToPlainText(block.content);

    switch (block.type) {
      case "h1":
        lines.push(`# ${text}`, "");
        break;
      case "h2":
        lines.push(`## ${text}`, "");
        break;
      case "h3":
        lines.push(`### ${text}`, "");
        break;
      case "bullet":
        lines.push(`${indentPrefix}- ${text}`);
        break;
      case "numbered":
        lines.push(`${indentPrefix}${numbered}. ${text}`);
        break;
      case "todo":
        lines.push(`${indentPrefix}- [${block.checked ? "x" : " "}] ${text}`);
        break;
      case "quote":
      case "callout":
        lines.push(`> ${text}`, "");
        break;
      case "code":
        lines.push("```", text, "```", "");
        break;
      case "divider":
        lines.push("---", "");
        break;
      case "database":
        if (text) lines.push(`### ${text} (Inline Database)`, "");
        break;
      case "page-link":
        lines.push(`- [[${text || block.linkedDocId || "Sub-page"}]]`);
        break;
      case "bookmark":
        lines.push(`- [${text || block.url || "Link"}](${block.url ?? ""})`);
        break;
      case "todo-embed": {
        const label = text || "Embedded tasks";
        if (block.todoEmbed?.projectId) {
          lines.push(
            `### [${label}](${formatTodoEmbedHref(block.todoEmbed)}) (Tasks)`,
            ""
          );
        } else {
          lines.push(`### ${label} (Tasks)`, "");
        }
        break;
      }
      case "columns":
        if (Array.isArray(block.columns)) {
          for (const col of block.columns) {
            lines.push(...serializeBlocksToMarkdown(col));
          }
        }
        break;
      case "paragraph":
        if (text) lines.push(text, "");
        break;
    }
  }

  return lines;
}

/** Serializes a document and its blocks to Markdown. */
export function docToMarkdown(doc: Doc): string {
  const lines: string[] = [
    `# ${doc.title.trim() || "Untitled"}`,
    "",
    ...serializeBlocksToMarkdown(doc.blocks),
  ];
  return lines.join("\n").trim();
}

/** Extracts clean copyable plain text for a single block. */
export function blockToText(block: DocBlock): string {
  if (block.type === "divider") return "---";
  if (block.type === "code") return block.content;
  if (block.type === "bookmark") {
    const label = htmlToPlainText(block.content);
    return block.url ? (label ? `${label} (${block.url})` : block.url) : label;
  }
  if (block.type === "todo-embed" && block.todoEmbed?.projectId) {
    const label = htmlToPlainText(block.content).trim();
    const href = formatTodoEmbedHref(block.todoEmbed);
    return label ? `${label} (${href})` : href;
  }
  if (block.type === "columns" && Array.isArray(block.columns)) {
    return block.columns
      .flat()
      .map(blockToText)
      .filter(Boolean)
      .join("\n");
  }
  return htmlToPlainText(block.content);
}

export type MoveDocTarget =
  | { type: "root"; position: "start" | "end" }
  | {
      type: "doc";
      targetId: string;
      placement: "before" | "inside" | "after";
    };

/** Returns true when candidateId equals ancestorId or descends from ancestorId. */
export function isDocDescendant(
  docs: Doc[],
  candidateId: string,
  ancestorId: string
): boolean {
  if (candidateId === ancestorId) return true;
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  const visited = new Set<string>();
  let current = byId.get(candidateId);

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    if (current.parentId === ancestorId) return true;
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }

  return false;
}
