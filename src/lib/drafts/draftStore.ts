import { DRAFT_KEY_VERSION } from "./draftKey";

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

export type DraftEnvelope<T> = {
  v: number;
  at: number;
  value: T;
};

const SENSITIVE_FIELD_NAMES = new Set([
  "token",
  "password",
  "passwd",
  "pass",
  "secret",
  "authorization",
  "auth",
  "sessiontoken",
  "apitoken",
  "apikey",
  "accesstoken",
  "refreshtoken",
  "credential",
  "credentials",
  "privatekey",
]);

const MAX_SCAN_DEPTH = 8;

export function isSensitiveFieldName(name: string): boolean {
  return SENSITIVE_FIELD_NAMES.has(name.trim().toLowerCase());
}

export function containsSensitiveField(value: unknown, depth = 0): boolean {
  if (depth > MAX_SCAN_DEPTH) return false;
  if (Array.isArray(value)) {
    return value.some((entry) => containsSensitiveField(entry, depth + 1));
  }
  if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveFieldName(key)) return true;
      if (containsSensitiveField(entry, depth + 1)) return true;
    }
  }
  return false;
}

export function stableStringify(value: unknown): string {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string" ? serialized : "null";
  } catch {
    return "null";
  }
}

export type ReadDraftOptions<T> = {
  version?: number;
  maxAgeMs?: number;
  now?: number;
  validate?: (value: unknown) => T | null;
};

export type WriteDraftOptions = {
  version?: number;
  now?: number;
};

function safeRemove(storage: StorageLike, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

function discard(storage: StorageLike, key: string): null {
  safeRemove(storage, key);
  return null;
}

export function readDraft<T>(
  storage: StorageLike | null,
  key: string | null,
  options: ReadDraftOptions<T> = {}
): T | null {
  if (!storage || !key) return null;

  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return discard(storage, key);
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return discard(storage, key);
  }

  const envelope = parsed as Partial<DraftEnvelope<T>>;
  if (typeof envelope.v !== "number" || !("value" in envelope)) {
    return discard(storage, key);
  }
  if (envelope.v !== (options.version ?? DRAFT_KEY_VERSION)) {
    return discard(storage, key);
  }
  if (
    options.maxAgeMs !== undefined &&
    typeof envelope.at === "number" &&
    (options.now ?? Date.now()) - envelope.at > options.maxAgeMs
  ) {
    return discard(storage, key);
  }

  if (!options.validate) return envelope.value as T;

  let validated: T | null = null;
  try {
    validated = options.validate(envelope.value);
  } catch {
    validated = null;
  }
  if (validated === null || validated === undefined) {
    return discard(storage, key);
  }
  return validated;
}

export function writeDraft<T>(
  storage: StorageLike | null,
  key: string | null,
  value: T,
  options: WriteDraftOptions = {}
): boolean {
  if (!storage || !key) return false;
  if (containsSensitiveField(value)) return false;

  const envelope: DraftEnvelope<T> = {
    v: options.version ?? DRAFT_KEY_VERSION,
    at: options.now ?? Date.now(),
    value,
  };

  let raw: string | undefined;
  try {
    raw = JSON.stringify(envelope);
  } catch {
    return false;
  }
  if (typeof raw !== "string") return false;

  try {
    storage.setItem(key, raw);
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(storage: StorageLike | null, key: string | null): void {
  if (!storage || !key) return;
  safeRemove(storage, key);
}
