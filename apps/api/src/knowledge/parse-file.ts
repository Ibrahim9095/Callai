import * as XLSX from "xlsx";
import type { FieldDef, FieldType } from "@aivoiceos/shared";

export interface ParsedSheet {
  sheetName: string;
  fields: FieldDef[];
  rows: Record<string, unknown>[];
}

export interface ParsedWorkbook {
  kind: "xlsx" | "xls" | "csv";
  sheets: ParsedSheet[];
}

/** Transliterate AZ letters, lowercase, keep [a-z0-9_]; used for field keys. */
export function slugKey(input: string): string {
  const map: Record<string, string> = {
    ə: "e", ı: "i", ö: "o", ü: "u", ç: "c", ş: "s", ğ: "g",
    Ə: "e", I: "i", İ: "i", Ö: "o", Ü: "u", Ç: "c", Ş: "s", Ğ: "g",
  };
  const t = input
    .split("")
    .map((c) => map[c] ?? c)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return t || "col";
}

function looksNumeric(v: unknown): boolean {
  if (typeof v === "number") return true;
  const s = String(v).trim().replace(",", ".");
  return s !== "" && Number.isFinite(Number(s));
}

const BOOL_TRUE = new Set(["1", "true", "hə", "beli", "bəli", "yes", "var", "mövcud", "boş", "aktiv"]);
const BOOL_FALSE = new Set(["0", "false", "yox", "no", "dolu", "deaktiv"]);

function looksBoolean(v: unknown): boolean {
  const s = String(v).trim().toLowerCase();
  return BOOL_TRUE.has(s) || BOOL_FALSE.has(s);
}

function inferType(values: unknown[]): FieldType {
  const nonEmpty = values.filter((v) => v !== null && v !== undefined && String(v).trim() !== "");
  if (nonEmpty.length === 0) return "text";
  if (nonEmpty.every((v) => v instanceof Date)) return "date";
  if (nonEmpty.every(looksNumeric)) return "number";
  if (nonEmpty.every(looksBoolean)) return "boolean";
  return "text";
}

function coerce(type: FieldType, v: unknown): unknown {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  if (type === "number") {
    const n = Number(String(v).trim().replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  if (type === "boolean") return BOOL_TRUE.has(String(v).trim().toLowerCase());
  if (type === "date") {
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return String(v).trim();
  }
  return String(v).trim();
}

/** Parse an uploaded Excel/CSV buffer into typed sheets + rows. */
export function parseWorkbook(buffer: Buffer, filename: string): ParsedWorkbook {
  const lower = filename.toLowerCase();
  const kind: ParsedWorkbook["kind"] = lower.endsWith(".csv")
    ? "csv"
    : lower.endsWith(".xls")
      ? "xls"
      : "xlsx";

  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheets: ParsedSheet[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", blankrows: false });
    if (!aoa.length) continue;

    const headerRow = (aoa[0] as unknown[]).map((h) => String(h ?? "").trim());
    const colIdx = headerRow
      .map((h, i) => ({ h, i }))
      .filter((c) => c.h !== "");
    if (colIdx.length === 0) continue;

    const dataRows = aoa
      .slice(1)
      .filter((r) => (r as unknown[]).some((c) => String(c ?? "").trim() !== ""));

    const fields: FieldDef[] = colIdx.map(({ h, i }) => {
      const columnValues = dataRows.map((r) => (r as unknown[])[i]);
      return { key: slugKey(h), label: h, type: inferType(columnValues) };
    });

    // Ensure unique keys within the sheet.
    const seen = new Set<string>();
    fields.forEach((f) => {
      let k = f.key;
      let n = 2;
      while (seen.has(k)) k = `${f.key}_${n++}`;
      f.key = k;
      seen.add(k);
    });

    const rows = dataRows.map((r) => {
      const obj: Record<string, unknown> = {};
      colIdx.forEach(({ i }, idx) => {
        const field = fields[idx];
        obj[field.key] = coerce(field.type, (r as unknown[])[i]);
      });
      return obj;
    });

    sheets.push({ sheetName: sheetName.trim() || "Sheet", fields, rows });
  }

  return { kind, sheets };
}
