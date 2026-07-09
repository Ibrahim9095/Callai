import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { coerceFieldValue, type FieldDef } from "@aivoiceos/shared";
import { parseCsv } from "./csv";
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
