import fs from "node:fs/promises";
import path from "node:path";
import {
  createEmptyWorkspaceState,
  normalizeServerWorkspaceState,
  type ServerWorkspaceState,
} from "./workspace-store-types";

const DATA_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(DATA_DIR, "store.json");
const SEED_FILE = path.join(process.cwd(), "app", "data.json");

const RETRYABLE_RENAME_CODES = new Set(["EPERM", "EACCES", "EBUSY"]);

function isNodeErrorWithCode(
  error: unknown,
  code: string
): error is NodeJS.ErrnoException {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === code
  );
}

function isRetryableRenameError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  const code = (error as NodeJS.ErrnoException).code;
  return typeof code === "string" && RETRYABLE_RENAME_CODES.has(code);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withStoreWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const globalStore = globalThis as { __maaStoreWriteChain?: Promise<unknown> };
  const previous = globalStore.__maaStoreWriteChain ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(fn);
  globalStore.__maaStoreWriteChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

async function atomicWriteJson(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  const json = `${JSON.stringify(data, null, 2)}\n`;
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.${Math.random()
    .toString(36)
    .slice(2, 8)}.tmp`;

  try {
    await fs.writeFile(tmpPath, json, "utf8");

    const maxAttempts = 6;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await fs.rename(tmpPath, filePath);
        return;
      } catch (error) {
        if (!isRetryableRenameError(error)) {
          throw error;
        }
        if (attempt === maxAttempts) {
          // Final fallback when a file watcher or AV holds an open handle on Windows.
          await fs.writeFile(filePath, json, "utf8");
          await fs.unlink(tmpPath).catch(() => undefined);
          return;
        }
        await sleep(25 * attempt);
      }
    }
  } catch (error) {
    await fs.unlink(tmpPath).catch(() => undefined);
    throw error;
  }
}

async function readSeedState(): Promise<ServerWorkspaceState> {
  const now = new Date().toISOString();
  try {
    const rawSeed = await fs.readFile(SEED_FILE, "utf8");
    const parsedSeed: unknown = JSON.parse(rawSeed);
    return {
      ...normalizeServerWorkspaceState(parsedSeed, { preserveHtml: true }),
      updatedAt: now,
    };
  } catch (error) {
    if (isNodeErrorWithCode(error, "ENOENT")) {
      return createEmptyWorkspaceState(now);
    }
    throw error;
  }
}

/** Reads `data/store.json`, seeding it atomically from `app/data.json` on first run. */
export async function readOrSeedServerStore(): Promise<ServerWorkspaceState> {
  try {
    const raw = await fs.readFile(STORE_FILE, "utf8");
    const parsed: unknown = JSON.parse(raw);
    return normalizeServerWorkspaceState(parsed, { preserveHtml: true });
  } catch (error) {
    if (!isNodeErrorWithCode(error, "ENOENT")) {
      throw error;
    }
  }

  return withStoreWriteLock(async () => {
    try {
      const existingRaw = await fs.readFile(STORE_FILE, "utf8");
      const existingParsed: unknown = JSON.parse(existingRaw);
      return normalizeServerWorkspaceState(existingParsed, {
        preserveHtml: true,
      });
    } catch (error) {
      if (!isNodeErrorWithCode(error, "ENOENT")) {
        throw error;
      }
    }

    const seeded = await readSeedState();
    await atomicWriteJson(STORE_FILE, seeded);
    return seeded;
  });
}

/** Normalizes and atomically persists the workspace payload to `data/store.json`. */
export async function saveServerStore(
  rawPayload: unknown
): Promise<ServerWorkspaceState> {
  const normalized = normalizeServerWorkspaceState(rawPayload, {
    preserveHtml: true,
  });
  const nextState: ServerWorkspaceState = {
    ...normalized,
    updatedAt: new Date().toISOString(),
  };

  await withStoreWriteLock(() => atomicWriteJson(STORE_FILE, nextState));
  return nextState;
}
