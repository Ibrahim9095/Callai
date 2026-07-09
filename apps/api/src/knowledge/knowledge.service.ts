import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { coerceFieldValue, type FieldDef } from "@aivoiceos/shared";
import { parseCsv } from "./csv";
import { parseUploadedFile, slugKey, supportedExtensions } from "./parse-file";
import { CreateCollectionDto } from "./dto/knowledge.dto";

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

  private coerce(fields: FieldDef[], data: Record<string, unknown>) {
    const out: Record<string, unknown> = {};
    for (const field of fields) {
      if (field.key in data) out[field.key] = coerceFieldValue(field.type, data[field.key]);
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
        fields: (c.fields as FieldDef[]).map((f) => ({ key: f.key, label: f.label, type: f.type })),
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
      include: { records: true },
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
    const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
    const limit = Math.min(Math.max(Number(opts.limit) || 12, 1), 40);
    const results: Array<{
      collection: string;
      collectionLabel: string;
      recordId: string;
      data: Record<string, unknown>;
    }> = [];

    for (const c of collections) {
      for (const rec of c.records) {
        const data = (rec.data || {}) as Record<string, unknown>;
        if (opts.filters && typeof opts.filters === "object") {
          let ok = true;
          for (const [k, v] of Object.entries(opts.filters)) {
            if (v === undefined || v === null || v === "") continue;
            const cell = data[k];
            if (this.normalize(String(cell ?? "")) !== this.normalize(String(v))) {
              // also allow partial match for text
              if (!this.normalize(String(cell ?? "")).includes(this.normalize(String(v)))) {
                ok = false;
                break;
              }
            }
          }
          if (!ok) continue;
        }
        if (tokens.length) {
          const hay = this.normalize(JSON.stringify(data));
          if (!tokens.every((t) => hay.includes(t))) continue;
        }
        results.push({
          collection: c.name,
          collectionLabel: c.label,
          recordId: rec.id,
          data,
        });
        if (results.length >= limit) break;
      }
      if (results.length >= limit) break;
    }

    return {
      found: results.length > 0,
      count: results.length,
      message:
        results.length > 0
          ? `${results.length} nəticə tapıldı`
          : "Uyğun sətir tapılmadı — digər sözlə axtarın və ya başqa siyahıya baxın",
      results,
    };
  }

  /** Append a row to a collection (reservation / order / appointment). */
  async agentCreateRecord(
    organizationId: string,
    projectId: string,
    opts: { collection: string; data: Record<string, unknown> },
  ) {
    await this.assertProject(organizationId, projectId);
    if (!opts.collection) {
      return { ok: false, message: "Hansı siyahıya yazılacağını deyin (məs. Rezervlər)" };
    }
    const all = await this.prisma.collection.findMany({ where: { projectId } });
    const want = this.normalize(opts.collection);
    const collection =
      all.find(
        (c) =>
          this.normalize(c.name) === want ||
          this.normalize(c.label) === want ||
          c.id === opts.collection,
      ) ||
      all.find(
        (c) => this.normalize(c.name).includes(want) || this.normalize(c.label).includes(want),
      );

    if (!collection) {
      return {
        ok: false,
        message: `Siyahı tapılmadı. Mövcud: ${all.map((c) => c.label).join(", ") || "yoxdur"}`,
      };
    }

    const fields = collection.fields as unknown as FieldDef[];
    const clean = this.coerce(fields, opts.data || {});
    // Soft-fill status if the collection has it and caller omitted it
    if (fields.some((f) => f.key === "status") && !clean.status) {
      clean.status = "təsdiqləndi";
    }
    const record = await this.prisma.collectionRecord.create({
      data: { collectionId: collection.id, projectId, data: clean as object },
    });
    return {
      ok: true,
      message: `«${collection.label}» siyahısına əlavə olundu`,
      collection: collection.label,
      recordId: record.id,
      data: clean,
    };
  }

  /** Update an existing record (e.g. mark room unavailable after booking). */
  async agentUpdateRecord(
    organizationId: string,
    projectId: string,
    opts: { collection?: string; recordId: string; data: Record<string, unknown> },
  ) {
    await this.assertProject(organizationId, projectId);
    const record = await this.prisma.collectionRecord.findFirst({
      where: { id: opts.recordId, projectId },
      include: { collection: true },
    });
    if (!record) return { ok: false, message: "Sətir tapılmadı" };
    const fields = record.collection.fields as unknown as FieldDef[];
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
      message: "Yeniləndi",
      collection: record.collection.label,
      recordId: updated.id,
      data: updated.data,
    };
  }
}
