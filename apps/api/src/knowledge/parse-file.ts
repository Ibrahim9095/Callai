import * as XLSX from "xlsx";
import type { FieldDef, FieldType } from "@aivoiceos/shared";

export type FileKind = "xlsx" | "xls" | "csv" | "pdf" | "txt" | "docx";

export interface ParsedSheet {
  sheetName: string;
  fields: FieldDef[];
  rows: Record<string, unknown>[];
}

export interface ParsedWorkbook {
  kind: FileKind;
  sheets: ParsedSheet[];
}

const SUPPORTED_EXT = [".xlsx", ".xls", ".csv", ".pdf", ".txt", ".docx"] as const;

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

function detectKind(filename: string): FileKind | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".xls")) return "xls";
  if (lower.endsWith(".xlsx")) return "xlsx";
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".txt")) return "txt";
  if (lower.endsWith(".docx")) return "docx";
  return null;
}

export function supportedExtensions(): string[] {
  return [...SUPPORTED_EXT];
}

function sheetFromAoa(sheetName: string, aoa: unknown[][]): ParsedSheet | null {
  if (!aoa.length) return null;
  const headerRow = (aoa[0] as unknown[]).map((h) => String(h ?? "").trim());
  const colIdx = headerRow.map((h, i) => ({ h, i })).filter((c) => c.h !== "");
  if (colIdx.length === 0) return null;

  const dataRows = aoa
    .slice(1)
    .filter((r) => (r as unknown[]).some((c) => String(c ?? "").trim() !== ""));

  const fields: FieldDef[] = colIdx.map(({ h, i }) => {
    const columnValues = dataRows.map((r) => (r as unknown[])[i]);
    return { key: slugKey(h), label: h, type: inferType(columnValues) };
  });

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

  return { sheetName: sheetName.trim() || "Sheet", fields, rows };
}

function parseSpreadsheet(buffer: Buffer, kind: FileKind): ParsedWorkbook {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheets: ParsedSheet[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "", blankrows: false });
    const sheet = sheetFromAoa(sheetName, aoa);
    if (sheet) sheets.push(sheet);
  }
  return { kind, sheets };
}

/** Split plain text into paragraphs / lines for a single "Mətn" collection. */
function textToSheet(sheetName: string, text: string): ParsedSheet {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  // Prefer table-like lines: "col1 | col2 | col3" or tab-separated
  const delim = lines.find((l) => l.includes("\t"))
    ? "\t"
    : lines.find((l) => (l.match(/\|/g) || []).length >= 1)
      ? "|"
      : null;

  if (delim && lines.length >= 2) {
    const aoa = lines.map((l) => l.split(delim).map((c) => c.trim()));
    const sheet = sheetFromAoa(sheetName, aoa);
    if (sheet && sheet.rows.length > 0) return sheet;
  }

  // Fallback: one row per non-empty line / paragraph
  const chunks =
    lines.length > 0
      ? lines
      : text
          .split(/\n\s*\n/)
          .map((p) => p.replace(/\s+/g, " ").trim())
          .filter(Boolean);

  return {
    sheetName,
    fields: [
      { key: "content", label: "Mətn", type: "text" },
      { key: "line", label: "Sətir", type: "number" },
    ],
    rows: chunks.map((content, i) => ({ content, line: i + 1 })),
  };
}

async function parsePdf(buffer: Buffer): Promise<ParsedWorkbook> {
  // Use pdfjs-dist (pdf-parse's bundled pdf.js breaks on many modern PDFs).
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(buffer);
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const parts: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = (content.items as Array<{ str?: string }>)
      .map((it) => it.str || "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (line) parts.push(line);
  }
  const text = parts.join("\n").trim();
  if (!text) {
    throw new Error("PDF-də oxuna bilən mətn tapılmadı (skan/şəkil ola bilər)");
  }
  return { kind: "pdf", sheets: [textToSheet("PDF", text)] };
}

async function parseDocx(buffer: Buffer): Promise<ParsedWorkbook> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mammoth = require("mammoth") as {
    extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
  };
  const result = await mammoth.extractRawText({ buffer });
  const text = (result.value || "").trim();
  if (!text) throw new Error("Word faylında mətn tapılmadı");
  return { kind: "docx", sheets: [textToSheet("Word", text)] };
}

function parseTxt(buffer: Buffer): ParsedWorkbook {
  const text = buffer.toString("utf8").trim();
  if (!text) throw new Error("Mətn faylı boşdur");
  return { kind: "txt", sheets: [textToSheet("Mətn", text)] };
}

/**
 * Parse an uploaded Excel/CSV/PDF/TXT/DOCX buffer into typed sheets + rows.
 * Spreadsheets: each sheet → collection. Documents: one text collection.
 */
export async function parseUploadedFile(buffer: Buffer, filename: string): Promise<ParsedWorkbook> {
  const kind = detectKind(filename);
  if (!kind) {
    throw new Error(
      `Dəstəklənməyən fayl tipi. Yükləyin: ${SUPPORTED_EXT.join(", ")}`,
    );
  }

  if (kind === "pdf") return parsePdf(buffer);
  if (kind === "docx") return parseDocx(buffer);
  if (kind === "txt") return parseTxt(buffer);
  return parseSpreadsheet(buffer, kind);
}

/** @deprecated use parseUploadedFile — kept for sync spreadsheet callers */
export function parseWorkbook(buffer: Buffer, filename: string): ParsedWorkbook {
  const kind = detectKind(filename);
  if (!kind || kind === "pdf" || kind === "docx" || kind === "txt") {
    throw new Error("Bu funksiya yalnız Excel/CSV üçündür — parseUploadedFile istifadə edin");
  }
  return parseSpreadsheet(buffer, kind);
}
