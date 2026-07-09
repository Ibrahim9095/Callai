/**
 * Knowledge / data model. Each Project owns Collections (e.g. hotel → "rooms",
 * "reservations"); each Collection has typed Fields; Records are JSON rows.
 * This is generic so ANY business works without code changes. Business
 * templates seed sensible default collections (extensible).
 */
export type FieldType = "text" | "number" | "boolean" | "date";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
}

export interface CollectionSeed {
  name: string; // machine key, e.g. "rooms"
  label: string; // human label, e.g. "Otaqlar"
  fields: FieldDef[];
}

const F = (key: string, label: string, type: FieldType, required = false): FieldDef => ({
  key,
  label,
  type,
  required,
});

/** Generic fallback for any business not explicitly mapped (incl. custom). */
const GENERIC: CollectionSeed[] = [
  {
    name: "items",
    label: "Məhsullar / Xidmətlər",
    fields: [
      F("name", "Ad", "text", true),
      F("price", "Qiymət (AZN)", "number"),
      F("stock", "Say / Stok", "number"),
      F("available", "Mövcuddur", "boolean"),
      F("note", "Qeyd", "text"),
    ],
  },
  {
    name: "orders",
    label: "Sifarişlər / Müraciətlər",
    fields: [
      F("customer", "Müştəri", "text", true),
      F("phone", "Telefon", "text"),
      F("item", "Məhsul / Xidmət", "text"),
      F("quantity", "Say", "number"),
      F("status", "Status", "text"),
      F("note", "Qeyd", "text"),
    ],
  },
];

const APPOINTMENTS = (subjectLabel: string): CollectionSeed => ({
  name: "appointments",
  label: "Növbələr",
  fields: [
    F("customer", "Müştəri", "text", true),
    F("phone", "Telefon", "text"),
    F("subject", subjectLabel, "text"),
    F("date", "Tarix", "date"),
    F("time", "Saat", "text"),
    F("status", "Status", "text"),
  ],
});

export const DEFAULT_COLLECTIONS: Record<string, CollectionSeed[]> = {
  hotel: [
    {
      name: "rooms",
      label: "Otaqlar",
      fields: [
        F("type", "Otaq tipi", "text", true),
        F("price", "Gecəlik qiymət (AZN)", "number"),
        F("capacity", "Tutum", "number"),
        F("available", "Boşdur", "boolean"),
        F("note", "Qeyd", "text"),
      ],
    },
    {
      name: "reservations",
      label: "Rezervlər",
      fields: [
        F("guest", "Qonaq", "text", true),
        F("phone", "Telefon", "text"),
        F("roomType", "Otaq tipi", "text"),
        F("checkIn", "Giriş tarixi", "date"),
        F("checkOut", "Çıxış tarixi", "date"),
        F("status", "Status", "text"),
      ],
    },
  ],
  clinic: [
    {
      name: "services",
      label: "Xidmətlər",
      fields: [
        F("name", "Xidmət", "text", true),
        F("doctor", "Həkim", "text"),
        F("price", "Qiymət (AZN)", "number"),
        F("note", "Qeyd", "text"),
      ],
    },
    APPOINTMENTS("Həkim / Xidmət"),
  ],
  restaurant: [
    {
      name: "menu",
      label: "Menyu",
      fields: [
        F("name", "Yemək", "text", true),
        F("price", "Qiymət (AZN)", "number"),
        F("category", "Kateqoriya", "text"),
        F("available", "Mövcuddur", "boolean"),
      ],
    },
    {
      name: "reservations",
      label: "Rezervlər",
      fields: [
        F("guest", "Qonaq", "text", true),
        F("phone", "Telefon", "text"),
        F("people", "Nəfər", "number"),
        F("date", "Tarix", "date"),
        F("time", "Saat", "text"),
        F("status", "Status", "text"),
      ],
    },
  ],
  electronics: [
    {
      name: "products",
      label: "Məhsullar",
      fields: [
        F("name", "Ad", "text", true),
        F("price", "Qiymət (AZN)", "number"),
        F("stock", "Stok", "number"),
        F("warranty", "Zəmanət", "text"),
        F("available", "Mövcuddur", "boolean"),
      ],
    },
    {
      name: "orders",
      label: "Sifarişlər",
      fields: [
        F("customer", "Müştəri", "text", true),
        F("phone", "Telefon", "text"),
        F("product", "Məhsul", "text"),
        F("quantity", "Say", "number"),
        F("status", "Status", "text"),
      ],
    },
  ],
  clothing_store: [
    {
      name: "products",
      label: "Məhsullar",
      fields: [
        F("name", "Ad", "text", true),
        F("size", "Ölçü", "text"),
        F("color", "Rəng", "text"),
        F("price", "Qiymət (AZN)", "number"),
        F("stock", "Stok", "number"),
      ],
    },
    {
      name: "orders",
      label: "Sifarişlər",
      fields: [
        F("customer", "Müştəri", "text", true),
        F("phone", "Telefon", "text"),
        F("product", "Məhsul", "text"),
        F("size", "Ölçü", "text"),
        F("status", "Status", "text"),
      ],
    },
  ],
  pharmacy: [
    {
      name: "medicines",
      label: "Dərmanlar",
      fields: [
        F("name", "Ad", "text", true),
        F("price", "Qiymət (AZN)", "number"),
        F("stock", "Stok", "number"),
        F("prescription", "Reseptlə", "boolean"),
      ],
    },
  ],
  beauty_salon: [
    {
      name: "services",
      label: "Xidmətlər",
      fields: [
        F("name", "Xidmət", "text", true),
        F("master", "Usta", "text"),
        F("price", "Qiymət (AZN)", "number"),
        F("duration", "Müddət (dəq)", "number"),
      ],
    },
    APPOINTMENTS("Xidmət"),
  ],
  education: [
    {
      name: "courses",
      label: "Kurslar",
      fields: [
        F("name", "Kurs", "text", true),
        F("teacher", "Müəllim", "text"),
        F("price", "Qiymət (AZN)", "number"),
        F("schedule", "Qrafik", "text"),
        F("seats", "Boş yer", "number"),
      ],
    },
    {
      name: "enrollments",
      label: "Qeydiyyatlar",
      fields: [
        F("student", "Tələbə", "text", true),
        F("phone", "Telefon", "text"),
        F("course", "Kurs", "text"),
        F("status", "Status", "text"),
      ],
    },
  ],
  auto_service: [
    {
      name: "services",
      label: "Xidmətlər",
      fields: [
        F("name", "Xidmət", "text", true),
        F("price", "Qiymət (AZN)", "number"),
        F("duration", "Müddət", "text"),
      ],
    },
    APPOINTMENTS("Xidmət / Maşın"),
  ],
};

export function getDefaultCollections(templateId: string): CollectionSeed[] {
  return DEFAULT_COLLECTIONS[templateId] ?? GENERIC;
}

/** Coerce a raw string/value to the field's type (used on record write & import). */
export function coerceFieldValue(type: FieldType, value: unknown): unknown {
  if (value === null || value === undefined || value === "") return null;
  switch (type) {
    case "number": {
      const n = Number(String(value).replace(",", "."));
      return Number.isFinite(n) ? n : null;
    }
    case "boolean": {
      const s = String(value).trim().toLowerCase();
      return ["1", "true", "hə", "beli", "bəli", "yes", "var", "mövcud", "boş"].includes(s);
    }
    case "date":
      return String(value).trim();
    default:
      return String(value);
  }
}
