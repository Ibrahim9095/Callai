/**
 * Normalize ElevenLabs / LLM tool argument shapes.
 * Models often send flat fields (ad, telefon) instead of nested { collection, data }.
 * Nested `data` may also arrive as a JSON string.
 */

function asObject(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  if (typeof v === "string") {
    const t = v.trim();
    if ((t.startsWith("{") && t.endsWith("}")) || (t.startsWith("[") && t.endsWith("]"))) {
      try {
        const parsed = JSON.parse(t);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}

const META_KEYS = new Set([
  "collection",
  "collection_name",
  "collectionName",
  "siyahi",
  "siyahı",
  "recordId",
  "record_id",
  "id",
  "parameters",
  "data",
  "fields",
  "row",
  "payload",
]);

/** Pull nested data bag from common LLM shapes. */
function extractDataBag(args: Record<string, unknown>): Record<string, unknown> {
  for (const key of ["data", "fields", "row", "payload", "record"]) {
    const obj = asObject(args[key]);
    if (obj) return { ...obj };
  }
  return {};
}

/** Flatten top-level guest fields into the data bag. */
function mergeFlatFields(
  bag: Record<string, unknown>,
  args: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...bag };
  for (const [k, v] of Object.entries(args)) {
    if (META_KEYS.has(k)) continue;
    if (v === undefined || v === null || v === "") continue;
    if (typeof v === "object") continue;
    if (!(k in out) || out[k] == null || out[k] === "") out[k] = v;
  }
  return out;
}

export function normalizeCreateArgs(raw: Record<string, unknown> = {}): {
  collection: string;
  data: Record<string, unknown>;
} {
  const root = asObject(raw.parameters) || raw;
  const collection = String(
    root.collection ||
      root.collection_name ||
      root.collectionName ||
      root.siyahi ||
      root["siyahı"] ||
      "",
  ).trim();
  const data = mergeFlatFields(extractDataBag(root), root);
  return { collection, data };
}

export function normalizeUpdateArgs(raw: Record<string, unknown> = {}): {
  recordId: string;
  collection?: string;
  data: Record<string, unknown>;
} {
  const root = asObject(raw.parameters) || raw;
  const recordId = String(root.recordId || root.record_id || root.id || "").trim();
  const collection = String(root.collection || root.collection_name || "").trim() || undefined;
  const data = mergeFlatFields(extractDataBag(root), root);
  // Don't keep id inside data
  delete data.recordId;
  delete data.record_id;
  delete data.id;
  return { recordId, collection, data };
}

export function normalizeDeleteArgs(raw: Record<string, unknown> = {}): {
  recordId: string;
  collection?: string;
} {
  const root = asObject(raw.parameters) || raw;
  return {
    recordId: String(root.recordId || root.record_id || root.id || "").trim(),
    collection: String(root.collection || "").trim() || undefined,
  };
}

export function normalizeSearchArgs(raw: Record<string, unknown> = {}): {
  query?: string;
  collection?: string;
  filters?: Record<string, unknown>;
  limit?: number;
} {
  const root = asObject(raw.parameters) || raw;
  const filters = asObject(root.filters) || undefined;
  const limitRaw = root.limit;
  const limit =
    typeof limitRaw === "number"
      ? limitRaw
      : typeof limitRaw === "string" && limitRaw.trim()
        ? Number(limitRaw)
        : undefined;
  return {
    query: root.query != null ? String(root.query) : undefined,
    collection: root.collection != null ? String(root.collection) : undefined,
    filters,
    limit: Number.isFinite(limit) ? limit : undefined,
  };
}
