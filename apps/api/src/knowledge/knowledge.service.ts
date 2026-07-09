import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { coerceFieldValue, type FieldDef } from "@aivoiceos/shared";
import { parseCsv } from "./csv";
import { parseUploadedFile, slugKey, supportedExtensions } from "./parse-file";
import { CreateCollectionDto } from "./dto/knowledge.dto";
import {
  contentSearchTokens,
  expandSearchTokens,
  isOverviewIntent,
  isPriceIntent,
  isRoomIntent,
  looksLikePriceField,
} from "../voice/az-speech";

/**
 * Per-project structured data ("knowledge"). Everything is scoped by
 * organizationId + projectId (tenant isolation). The AI agent reads/writes
 * this data via generic tools during calls.
 */
@Injectable()
export class KnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertProject(organizationId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true, name: true, businessTemplate: true, businessLabel: true },
    });
    if (!project) throw new NotFoundException("Project tapılmadı");
    return project;
  }

  private async getCollection(projectId: string, collectionId: string) {
    const collection = await this.prisma.collection.findFirst({
      where: { id: collectionId, projectId },
    });
    if (!collection) throw new NotFoundException("Kolleksiya tapılmadı");
    return collection;
  }

  listCollections(organizationId: string, projectId: string) {
    return this.assertProject(organizationId, projectId).then(() =>
      this.prisma.collection.findMany({
        where: { projectId },
        orderBy: { createdAt: "asc" },
        include: { _count: { select: { records: true } } },
      }),
    );
  }

  listFiles(organizationId: string, projectId: string) {
    return this.assertProject(organizationId, projectId).then(() =>
      this.prisma.dataFile.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        include: { collections: { select: { id: true, name: true, label: true } } },
      }),
    );
  }

  /**
   * Upload & parse Excel/CSV/PDF/TXT/DOCX. Spreadsheet sheets → Collections;
   * documents → one text collection. Multiple files per project supported.
   */
  async uploadFile(
    organizationId: string,
    projectId: string,
    filename: string,
    buffer: Buffer,
  ) {
    await this.assertProject(organizationId, projectId);
    if (!buffer || buffer.length === 0) throw new BadRequestException("Boş fayl");

    let parsed;
    try {
      parsed = await parseUploadedFile(buffer, filename);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Fayl oxunmadı";
      const msg =
        /token too long|bad xref|invalid pdf|password/i.test(raw)
          ? "PDF oxunmadı (skan/şəkil və ya zədələnmiş fayl ola bilər). Mətnli PDF və ya Excel/CSV yükləyin"
          : raw;
      throw new BadRequestException(
        `${msg}. Dəstəklənən: ${supportedExtensions().join(", ")}`,
      );
    }
    if (parsed.sheets.length === 0) {
      throw new BadRequestException("Faylda oxunacaq cədvəl/mətn tapılmadı");
    }

    const existing = await this.prisma.collection.findMany({
      where: { projectId },
      select: { name: true },
    });
    const usedNames = new Set(existing.map((c) => c.name));

    const file = await this.prisma.dataFile.create({
      data: {
        projectId,
        filename,
        kind: parsed.kind,
        sheetCount: parsed.sheets.length,
        rowCount: parsed.sheets.reduce((sum, s) => sum + s.rows.length, 0),
      },
    });

    for (const sheet of parsed.sheets) {
      let name = slugKey(sheet.sheetName);
      let n = 2;
      while (usedNames.has(name)) name = `${slugKey(sheet.sheetName)}_${n++}`;
      usedNames.add(name);

      const collection = await this.prisma.collection.create({
        data: {
          projectId,
          fileId: file.id,
          name,
          label: sheet.sheetName,
          fields: sheet.fields as object,
        },
      });

      if (sheet.rows.length > 0) {
        await this.prisma.collectionRecord.createMany({
          data: sheet.rows.map((data) => ({
            collectionId: collection.id,
            projectId,
            data: data as object,
          })),
        });
      }
    }

    return this.listFiles(organizationId, projectId);
  }

  async deleteFile(organizationId: string, projectId: string, fileId: string) {
    await this.assertProject(organizationId, projectId);
    const file = await this.prisma.dataFile.findFirst({ where: { id: fileId, projectId } });
    if (!file) throw new NotFoundException("Fayl tapılmadı");
    await this.prisma.dataFile.delete({ where: { id: fileId } }); // cascades collections + records
    return { ok: true };
  }

  async createCollection(organizationId: string, projectId: string, dto: CreateCollectionDto) {
    await this.assertProject(organizationId, projectId);
    const exists = await this.prisma.collection.findFirst({
      where: { projectId, name: dto.name },
    });
    if (exists) throw new BadRequestException("Bu adda kolleksiya artıq var");
    return this.prisma.collection.create({
      data: { projectId, name: dto.name, label: dto.label, fields: dto.fields as object },
    });
  }

  async deleteCollection(organizationId: string, projectId: string, collectionId: string) {
    await this.assertProject(organizationId, projectId);
    await this.getCollection(projectId, collectionId);
    await this.prisma.collection.delete({ where: { id: collectionId } });
    return { ok: true };
  }

  async listRecords(organizationId: string, projectId: string, collectionId: string) {
    await this.assertProject(organizationId, projectId);
    const collection = await this.getCollection(projectId, collectionId);
    const records = await this.prisma.collectionRecord.findMany({
      where: { collectionId },
      orderBy: { createdAt: "desc" },
    });
    return { collection, records };
  }

  /** Add telefon / gelis_saati columns when missing (Excel uploads often omit them). */
  private async ensureContactFields(collectionId: string, fields: FieldDef[]): Promise<FieldDef[]> {
    const keys = new Set(fields.map((f) => this.normalize(f.key)));
    const labels = new Set(fields.map((f) => this.normalize(f.label || "")));
    const next = [...fields];
    const add = (key: string, label: string, type: FieldDef["type"] = "text") => {
      if (keys.has(this.normalize(key)) || labels.has(this.normalize(label))) return;
      next.push({ key, label, type });
      keys.add(this.normalize(key));
      labels.add(this.normalize(label));
    };
    add("telefon", "Telefon", "text");
    add("gelis_saati", "Gəliş saati", "text");
    add("qeyd", "Qeyd", "text");
    if (next.length === fields.length) return fields;
    await this.prisma.collection.update({
      where: { id: collectionId },
      data: { fields: next as object },
    });
    return next;
  }

  /**
   * Map agent/LLM payload keys onto collection field keys.
   * Agents often send «ad», «telefon», «otaq tipi» while the sheet uses
   * «qonaq», «telefon», «otaq_novu» — without aliases those values were dropped.
   */
  private mapAgentData(fields: FieldDef[], data: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...(data || {}) };
    const byNorm = new Map<string, FieldDef>();
    for (const f of fields) {
      byNorm.set(this.normalize(f.key), f);
      if (f.label) byNorm.set(this.normalize(f.label), f);
    }

    const ALIAS_GROUPS: string[][] = [
      ["qonaq", "guest", "ad", "ad soyad", "ad_soyad", "musteri", "müştəri", "customer", "name", "full_name"],
      ["telefon", "phone", "tel", "nomre", "nömrə", "elaqe", "əlaqə", "mobile", "cellphone"],
      ["otaq_novu", "otaq novu", "otaq tipi", "room_type", "roomtype", "room type", "type"],
      ["otaq", "otaq no", "otaq №", "room", "room_no", "room number", "nomre otaq"],
      ["giris", "giriş", "check_in", "checkin", "check in", "gelis", "gəliş", "arrival"],
      ["cixis", "çıxış", "check_out", "checkout", "check out", "gedis", "gediş", "departure"],
      ["gece", "gecə", "nights", "night", "geceler"],
      ["gecelik_qiymet_azn", "gecelik qiymet", "gecəlik qiymət", "price", "qiymet", "qiymət", "nightly"],
      ["cemi_azn", "cemi", "cəmi", "total", "mebleg", "məbləğ"],
      ["gelis_saati", "gəliş saati", "arrival_time", "arrival time", "saat", "time", "gelis saat"],
      ["rezerv_id", "rezerv id", "reservation_id", "id"],
      ["status", "veziyyet", "vəziyyət"],
      ["qeyd", "note", "notes", "comment", "serh", "şərh"],
    ];

    for (const [rawKey, rawVal] of Object.entries(data || {})) {
      if (rawVal === undefined || rawVal === null || rawVal === "") continue;
      const nk = this.normalize(rawKey);
      // Exact key/label already present
      const direct = byNorm.get(nk);
      if (direct) {
        out[direct.key] = rawVal;
        continue;
      }
      for (const group of ALIAS_GROUPS) {
        if (!group.some((a) => this.normalize(a) === nk)) continue;
        const target = group.map((a) => byNorm.get(this.normalize(a))).find(Boolean);
        if (target && !(target.key in out && out[target.key] != null && out[target.key] !== "")) {
          out[target.key] = rawVal;
        }
        break;
      }
    }

    // Merge ad + soyad → guest/qonaq (always prefer full name when both given)
    const guestField =
      byNorm.get("qonaq") || byNorm.get("guest") || byNorm.get("musteri") || byNorm.get("customer");
    if (guestField) {
      const ad = data.ad ?? data.name ?? data.first_name ?? data.Ad;
      const soyad = data.soyad ?? data.surname ?? data.last_name ?? data.Soyad;
      if (ad || soyad) {
        const full = [ad, soyad].filter(Boolean).join(" ").trim();
        const current = out[guestField.key] != null ? String(out[guestField.key]).trim() : "";
        // Prefer full name; upgrade if current is only first name
        if (!current || (soyad && current === String(ad || "").trim())) {
          out[guestField.key] = full;
        }
      }
    }

    // Pack unknown extras into qeyd when available (skip ad/soyad — already merged)
    const noteField = byNorm.get("qeyd") || byNorm.get("note");
    const skipExtra = new Set(
      ["ad", "soyad", "name", "first_name", "last_name", "surname", "Ad", "Soyad"].map((s) =>
        this.normalize(s),
      ),
    );
    if (noteField) {
      const known = new Set(fields.map((f) => f.key));
      const extras: string[] = [];
      for (const [k, v] of Object.entries(data || {})) {
        if (v == null || v === "") continue;
        if (skipExtra.has(this.normalize(k))) continue;
        const mapped = byNorm.get(this.normalize(k));
        if (mapped || known.has(k)) continue;
        const isAlias = ALIAS_GROUPS.some((g) =>
          g.some((a) => this.normalize(a) === this.normalize(k)),
        );
        if (isAlias) continue;
        extras.push(`${k}: ${v}`);
      }
      if (extras.length) {
        const prev = out[noteField.key] ? String(out[noteField.key]) + " | " : "";
        out[noteField.key] = prev + extras.join("; ");
      }
    }

    return out;
  }

  private coerce(fields: FieldDef[], data: Record<string, unknown>) {
    const mapped = this.mapAgentData(fields, data || {});
    const out: Record<string, unknown> = {};
    for (const field of fields) {
      if (field.key in mapped) out[field.key] = coerceFieldValue(field.type, mapped[field.key]);
    }
    return out;
  }

  async createRecord(
    organizationId: string,
    projectId: string,
    collectionId: string,
    data: Record<string, unknown>,
  ) {
    await this.assertProject(organizationId, projectId);
    const collection = await this.getCollection(projectId, collectionId);
    const clean = this.coerce(collection.fields as unknown as FieldDef[], data);
    return this.prisma.collectionRecord.create({
      data: { collectionId, projectId, data: clean as object },
    });
  }

  async updateRecord(
    organizationId: string,
    projectId: string,
    collectionId: string,
    recordId: string,
    data: Record<string, unknown>,
  ) {
    await this.assertProject(organizationId, projectId);
    const collection = await this.getCollection(projectId, collectionId);
    const record = await this.prisma.collectionRecord.findFirst({
      where: { id: recordId, collectionId },
    });
    if (!record) throw new NotFoundException("Sətir tapılmadı");
    const merged = { ...(record.data as object), ...this.coerce(collection.fields as unknown as FieldDef[], data) };
    return this.prisma.collectionRecord.update({
      where: { id: recordId },
      data: { data: merged as object },
    });
  }

  async deleteRecord(
    organizationId: string,
    projectId: string,
    collectionId: string,
    recordId: string,
  ) {
    await this.assertProject(organizationId, projectId);
    await this.getCollection(projectId, collectionId);
    await this.prisma.collectionRecord.deleteMany({ where: { id: recordId, collectionId } });
    return { ok: true };
  }

  /** Import CSV rows into a collection. Header names match field key or label. */
  async importCsv(
    organizationId: string,
    projectId: string,
    collectionId: string,
    csv: string,
    delimiter = ",",
  ) {
    await this.assertProject(organizationId, projectId);
    const collection = await this.getCollection(projectId, collectionId);
    const fields = collection.fields as unknown as FieldDef[];
    const { headers, rows } = parseCsv(csv, delimiter);
    if (headers.length === 0) throw new BadRequestException("CSV boşdur");

    // Map each CSV column index → field key (by key or label, case-insensitive).
    const norm = (s: string) => s.trim().toLowerCase();
    const columnField: (string | null)[] = headers.map((h) => {
      const match = fields.find((f) => norm(f.key) === norm(h) || norm(f.label) === norm(h));
      return match ? match.key : null;
    });

    const toCreate = rows.map((row) => {
      const data: Record<string, unknown> = {};
      row.forEach((value, i) => {
        const key = columnField[i];
        if (!key) return;
        const field = fields.find((f) => f.key === key)!;
        data[key] = coerceFieldValue(field.type, value);
      });
      return { collectionId, projectId, data: data as object };
    });

    if (toCreate.length === 0) throw new BadRequestException("İdxal ediləcək sətir yoxdur");
    await this.prisma.collectionRecord.createMany({ data: toCreate });
    return { ok: true, imported: toCreate.length, mappedColumns: columnField.filter(Boolean).length };
  }

  // ─── Agent tools (voice runtime) ─────────────────────────────────────────

  private normalize(text = ""): string {
    return String(text)
      .toLowerCase()
      .replace(/ə/g, "e")
      .replace(/ı/g, "i")
      .replace(/ö/g, "o")
      .replace(/ü/g, "u")
      .replace(/ç/g, "c")
      .replace(/ş/g, "s")
      .replace(/ğ/g, "g")
      .trim();
  }

  /** List all collections (sheets) the agent can read/write for this project. */
  async agentListCollections(organizationId: string, projectId: string) {
    const project = await this.assertProject(organizationId, projectId);
    const collections = await this.prisma.collection.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { records: true } }, file: { select: { filename: true } } },
    });
    return {
      project: project.name,
      business: project.businessLabel || project.businessTemplate,
      collections: collections.map((c) => ({
        id: c.id,
        name: c.name,
        label: c.label,
        file: c.file?.filename || null,
        fields: (c.fields as unknown as FieldDef[]).map((f) => ({ key: f.key, label: f.label, type: f.type })),
        recordCount: c._count.records,
      })),
    };
  }

  /**
   * Search records across one or all collections. Matches query tokens against
   * any stringified field value (AZ-normalized). Optional filters by field key.
   */
  async agentSearch(
    organizationId: string,
    projectId: string,
    opts: {
      query?: string;
      collection?: string; // name, label, or id
      filters?: Record<string, unknown>;
      limit?: number;
    } = {},
  ) {
    await this.assertProject(organizationId, projectId);
    const all = await this.prisma.collection.findMany({
      where: { projectId },
      include: { records: true, file: { select: { filename: true } } },
    });

    const want = opts.collection ? this.normalize(opts.collection) : "";
    const collections = want
      ? all.filter(
          (c) =>
            this.normalize(c.name) === want ||
            this.normalize(c.label) === want ||
            c.id === opts.collection ||
            this.normalize(c.name).includes(want) ||
            this.normalize(c.label).includes(want),
        )
      : all;

    if (want && collections.length === 0) {
      return {
        found: false,
        message: `«${opts.collection}» adlı siyahı tapılmadı. Mövcud: ${all.map((c) => c.label).join(", ") || "yoxdur"}`,
        results: [],
      };
    }

    const q = this.normalize(opts.query || "");
    const rawTokens = q ? q.split(/\s+/).filter(Boolean) : [];
    // Expand ASR mishears: niymet→qiymet, kol→qol, …
    const tokens = expandSearchTokens(rawTokens);
    const contentTokens = contentSearchTokens(tokens);
    const priceIntent = isPriceIntent(tokens);
    const roomIntent = isRoomIntent(tokens);
    const overviewIntent = isOverviewIntent(tokens) || contentTokens.length === 0;
    // Higher default so agent can scan more sheets before answering
    const limit = Math.min(Math.max(Number(opts.limit) || 25, 1), 80);
    type Hit = {
      collection: string;
      collectionLabel: string;
      recordId: string;
      data: Record<string, unknown>;
      score: number;
    };
    const scored: Hit[] = [];
    let scannedCollections = 0;
    let scannedRecords = 0;

    for (const c of collections) {
      scannedCollections += 1;
      const fields = (Array.isArray(c.fields) ? c.fields : []) as unknown as FieldDef[];
      const fieldMeta = fields.map((f) => ({
        key: f.key,
        label: f.label || f.key,
        normKey: this.normalize(f.key),
        normLabel: this.normalize(f.label || f.key),
      }));
      const hasPriceCol = fieldMeta.some((f) => looksLikePriceField(f.key, f.label));
      const hasRoomCol = fieldMeta.some(
        (f) => /otaq|room|nov|tip|type/.test(f.normKey) || /otaq|room|nov|tip/.test(f.normLabel),
      );
      // Include field labels/keys + file name so "otel rezervləri" opens the sheet
      const fileName = (c as { file?: { filename?: string | null } | null }).file?.filename || "";
      const schemaHay = this.normalize(
        fieldMeta.map((f) => `${f.key} ${f.label}`).join(" ") +
          " " +
          c.name +
          " " +
          c.label +
          " " +
          fileName,
      );

      for (const rec of c.records) {
        scannedRecords += 1;
        const data = (rec.data || {}) as Record<string, unknown>;
        if (opts.filters && typeof opts.filters === "object") {
          let ok = true;
          for (const [k, v] of Object.entries(opts.filters)) {
            if (v === undefined || v === null || v === "") continue;
            const cell = data[k];
            if (this.normalize(String(cell ?? "")) !== this.normalize(String(v))) {
              if (!this.normalize(String(cell ?? "")).includes(this.normalize(String(v)))) {
                ok = false;
                break;
              }
            }
          }
          if (!ok) continue;
        }

        let score = 0;
        const valueHay = this.normalize(JSON.stringify(data));
        const hay = `${valueHay} ${schemaHay}`;

        if (overviewIntent) {
          // «Otel haqqında məlumat» → open whole sheet (name may be Rezervlər / Otel_…)
          score = 0.5;
          if (hasPriceCol) score += 0.2;
          if (hasRoomCol) score += 0.15;
          if (contentTokens.some((t) => hay.includes(t))) score += 0.3;
        } else if (contentTokens.length) {
          const matched = contentTokens.filter((t) => hay.includes(t));
          if (matched.length === 0) {
            // Intent fallback: "qiymət nədir?" → rows with price columns
            if (priceIntent && hasPriceCol) {
              score = 0.35;
            } else if (roomIntent && hasRoomCol) {
              score = 0.3;
            } else {
              continue;
            }
          } else {
            score = matched.length / contentTokens.length;
            if (matched.length === contentTokens.length) score += 1;
            if (priceIntent && hasPriceCol) score += 0.25;
            if (roomIntent && hasRoomCol) score += 0.2;
          }
        } else {
          score = 1;
        }

        scored.push({
          collection: c.name,
          collectionLabel: c.label,
          recordId: rec.id,
          data,
          score,
        });
      }
    }

    // Last resort: any rows exist but nothing scored → still return sheet contents
    if (scored.length === 0 && scannedRecords > 0) {
      for (const c of collections) {
        for (const rec of c.records) {
          scored.push({
            collection: c.name,
            collectionLabel: c.label,
            recordId: rec.id,
            data: (rec.data || {}) as Record<string, unknown>,
            score: 0.1,
          });
        }
      }
    }

    scored.sort((a, b) => b.score - a.score);
    const results = scored.slice(0, limit).map(({ score: _s, ...rest }) => rest);
    const searchedLabels = collections.map((c) => c.label).join(", ") || "yoxdur";

    // Compact summary so the agent can speak room types / prices without inventing
    const summaryBits: string[] = [];
    const seenTypes = new Set<string>();
    for (const r of results) {
      const d = r.data || {};
      const typ = String(d.otaq_novu || d.roomType || d.type || "").trim();
      const price = d.gecelik_qiymet_azn ?? d.price ?? d.qiymet;
      if (typ && !seenTypes.has(typ)) {
        seenTypes.add(typ);
        summaryBits.push(price != null && price !== "" ? `${typ}: ${price} AZN` : typ);
      }
    }

    return {
      found: results.length > 0,
      count: results.length,
      searchedCollections: scannedCollections,
      scannedRecords,
      collectionsSearched: searchedLabels,
      queryExpanded: tokens,
      contentTokens,
      overview: overviewIntent,
      summary: summaryBits.length ? summaryBits.join("; ") : null,
      message:
        results.length > 0
          ? `${results.length} nəticə tapıldı (${scannedCollections} siyahı / ${scannedRecords} sətir yoxlanıldı)` +
            (summaryBits.length ? `. Qısa: ${summaryBits.join("; ")}` : "")
          : `Uyğun sətir tapılmadı — yoxlanılan siyahılar: ${searchedLabels}. Digər sözlə axtarın və ya alternativ təklif edin.`,
      results,
    };
  }

  /** Append a row to a collection (reservation / order / appointment). */
  async agentCreateRecord(
    organizationId: string,
    projectId: string,
    opts: { collection?: string; data: Record<string, unknown> },
  ) {
    await this.assertProject(organizationId, projectId);
    const all = await this.prisma.collection.findMany({ where: { projectId } });
    if (all.length === 0) {
      return { ok: false, message: "Layihədə heç bir cədvəl/fayl yoxdur. Əvvəl Excel yükləyin." };
    }

    let collection = null as (typeof all)[number] | null;
    const want = opts.collection ? this.normalize(opts.collection) : "";
    if (want) {
      collection =
        all.find(
          (c) =>
            this.normalize(c.name) === want ||
            this.normalize(c.label) === want ||
            c.id === opts.collection ||
            this.normalize(c.name).includes(want) ||
            this.normalize(c.label).includes(want),
        ) || null;
    }
    // Smart default: Rezervlər / Sifarişlər / first collection
    if (!collection) {
      collection =
        all.find((c) => /rezerv|sifaris|order|appointment|novbe|booking/.test(this.normalize(c.label + " " + c.name))) ||
        all[0];
    }

    // Ensure phone + arrival-time columns exist so agent data is not dropped
    let fields = (Array.isArray(collection.fields) ? collection.fields : []) as unknown as FieldDef[];
    fields = await this.ensureContactFields(collection.id, fields);
    const clean = this.coerce(fields, opts.data || {});

    // Soft-fill status if the collection has it and caller omitted it
    const statusField =
      fields.find((f) => f.key === "status") ||
      fields.find((f) => this.normalize(f.label || "").includes("status"));
    if (statusField && clean[statusField.key] == null) {
      clean[statusField.key] = "təsdiqləndi";
    }

    // Auto rezerv_id when missing (R006, R007, …)
    const idField = fields.find((f) => this.normalize(f.key) === "rezerv_id");
    if (idField && (clean[idField.key] == null || clean[idField.key] === "")) {
      const existing = await this.prisma.collectionRecord.findMany({
        where: { collectionId: collection.id },
        select: { data: true },
      });
      let maxN = 0;
      for (const row of existing) {
        const raw = String((row.data as Record<string, unknown>)?.[idField.key] ?? "");
        const m = raw.match(/(\d+)/);
        if (m) maxN = Math.max(maxN, Number(m[1]));
      }
      clean[idField.key] = `R${String(maxN + 1).padStart(3, "0")}`;
    }

    const guestField =
      fields.find((f) => ["qonaq", "guest", "musteri", "customer", "name"].includes(this.normalize(f.key))) ||
      fields.find((f) => /qonaq|guest|musteri|customer|ad/.test(this.normalize(f.label || "")));
    const phoneField =
      fields.find((f) => ["telefon", "phone", "tel", "nomre"].includes(this.normalize(f.key))) ||
      fields.find((f) => /telefon|phone|nomre/.test(this.normalize(f.label || "")));

    const hasGuest =
      guestField && clean[guestField.key] != null && String(clean[guestField.key]).trim() !== "";
    const hasPhone =
      phoneField && clean[phoneField.key] != null && String(clean[phoneField.key]).trim() !== "";

    // Must have at least a name OR phone — otherwise refuse empty rows
    if (!hasGuest && !hasPhone) {
      return {
        ok: false,
        message:
          "Rezerv yazılmadı: ad və telefon boşdur. Müştəridən ad-soyad və nömrə alın, create_record-u yenidən çağırın.",
        missing: [guestField?.key, phoneField?.key].filter(Boolean),
        receivedKeys: Object.keys(opts.data || {}),
      };
    }

    // Prefer complete rows; still SAVE partial so admin panel always shows what agent captured
    if (statusField && (!hasGuest || !hasPhone)) {
      clean[statusField.key] = "natamam";
    }

    const record = await this.prisma.collectionRecord.create({
      data: { collectionId: collection.id, projectId, data: clean as object },
    });

    const spokenConfirmHint = [
      hasGuest ? `Qonaq: ${clean[guestField!.key]}` : null,
      hasPhone ? `Telefon: ${clean[phoneField!.key]}` : null,
      clean.gelis_saati ? `Gəliş: ${clean.gelis_saati}` : null,
      clean.giris ? `Giriş: ${clean.giris}` : null,
      clean.otaq_novu ? `Otaq: ${clean.otaq_novu}` : null,
    ]
      .filter(Boolean)
      .join(", ");

    const complete = Boolean(hasGuest && hasPhone);
    return {
      ok: true,
      complete,
      message: complete
        ? `«${collection.label}» cədvəlinə yazıldı. Admin paneldə görünür. Müştəriyə yalnız bunları təsdiq et: ${spokenConfirmHint}`
        : `«${collection.label}» cədvəlinə QISMƏN yazıldı (${spokenConfirmHint || "natamam"}). Əksik sahəni alıb update_record ilə tamamla.`,
      collection: collection.label,
      recordId: record.id,
      data: clean,
      spokenConfirmHint,
    };
  }

  /** Update an existing record (e.g. mark room unavailable after booking). */
  async agentUpdateRecord(
    organizationId: string,
    projectId: string,
    opts: { collection?: string; recordId: string; data: Record<string, unknown> },
  ) {
    await this.assertProject(organizationId, projectId);
    if (!opts.recordId) {
      return { ok: false, message: "recordId lazımdır — əvvəl search_records ilə tapın" };
    }
    const record = await this.prisma.collectionRecord.findFirst({
      where: { id: opts.recordId, projectId },
      include: { collection: true },
    });
    if (!record) return { ok: false, message: "Sətir tapılmadı" };
    let fields = record.collection.fields as unknown as FieldDef[];
    fields = await this.ensureContactFields(record.collectionId, fields);
    const merged = {
      ...(record.data as object),
      ...this.coerce(fields, opts.data || {}),
    };
    const updated = await this.prisma.collectionRecord.update({
      where: { id: record.id },
      data: { data: merged as object },
    });
    return {
      ok: true,
      message: `«${record.collection.label}» sətri yeniləndi — admin paneldə görünür`,
      collection: record.collection.label,
      recordId: updated.id,
      data: updated.data,
    };
  }

  /** Delete a record from the project table. */
  async agentDeleteRecord(
    organizationId: string,
    projectId: string,
    opts: { recordId: string; collection?: string },
  ) {
    await this.assertProject(organizationId, projectId);
    if (!opts.recordId) {
      return { ok: false, message: "recordId lazımdır — əvvəl search_records ilə tapın" };
    }
    const record = await this.prisma.collectionRecord.findFirst({
      where: { id: opts.recordId, projectId },
      include: { collection: true },
    });
    if (!record) return { ok: false, message: "Sətir tapılmadı" };
    await this.prisma.collectionRecord.delete({ where: { id: record.id } });
    return {
      ok: true,
      message: `«${record.collection.label}» siyahısından silindi`,
      collection: record.collection.label,
      recordId: opts.recordId,
    };
  }
}
