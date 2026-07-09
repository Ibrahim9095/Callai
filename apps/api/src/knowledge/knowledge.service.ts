import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { coerceFieldValue, type FieldDef } from "@aivoiceos/shared";
import { parseCsv } from "./csv";
import { parseWorkbook, slugKey } from "./parse-file";
import { CreateCollectionDto } from "./dto/knowledge.dto";

/**
 * Per-project structured data ("knowledge"). Everything is scoped by
 * organizationId + projectId (tenant isolation). The AI agent reads/writes
 * this data via generic tools during calls (wired in the voice milestone).
 */
@Injectable()
export class KnowledgeService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertProject(organizationId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true },
    });
    if (!project) throw new NotFoundException("Project tapılmadı");
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
   * Upload & parse an Excel/CSV file. Each sheet becomes a Collection; rows
   * become records with inferred field types. Multiple files per project are
   * supported; the agent reads across all of them.
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
      parsed = parseWorkbook(buffer, filename);
    } catch {
      throw new BadRequestException("Fayl oxunmadı. Excel (.xlsx/.xls) və ya CSV yükləyin.");
    }
    if (parsed.sheets.length === 0) {
      throw new BadRequestException("Faylda oxunacaq cədvəl (başlıq + sətir) tapılmadı");
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
}
