/**
 * Business templates (PRD §7). Extensible registry — new verticals are added
 * here without core changes. Each template seeds a starter persona/prompt and
 * suggested knowledge fields for a Project's AI agent.
 */
export const BUSINESS_TEMPLATES = [
  "hotel",
  "clinic",
  "restaurant",
  "electronics",
  "clothing_store",
  "pharmacy",
  "beauty_salon",
  "education",
  "auto_service",
] as const;

export type BusinessTemplateId = (typeof BUSINESS_TEMPLATES)[number];

export interface BusinessTemplate {
  id: BusinessTemplateId;
  label: string;
  /** Short description shown in the admin panel. */
  description: string;
  /** Starter system prompt (Azerbaijani) for the agent persona. */
  starterPrompt: string;
  /** Suggested knowledge fields the operator should fill for this vertical. */
  suggestedKnowledge: string[];
}

const AZ_BASE_STYLE = `Yalnız Azərbaycan dilində, səmimi və peşəkar danış. Türk dili işlətmə.
Real insan kimi danış, bot/süni intellekt olduğunu heç vaxt demə.

DANIŞIQ (çox vacib):
- İki insan danışırmış kimi ol. Müştəri sözünü bitirən kimi DƏRHAL cavab ver.
- Cavablar QISA olsun — 1-2 cümlə. Uzun-uzadı izah vermə.
- Eyni cümləni təkrarlama; təbii ol.

MƏLUMAT (çox vacib):
- Heç vaxt uydurma. Qiymət, stok, boş otaq, mövcudluq kimi məlumatları YALNIZ layihənin
  yüklənmiş data fayllarından (Excel/CSV/PDF) alət vasitəsilə yoxla.
- Faylı/datanı yoxlamazdan əvvəl qısaca de: "Bir saniyə, zəhmət olmasa" — sonra yoxla və cavab ver.
- Lazım olsa bütün faylları/vərəqləri araşdır və müştəriyə aydın, dəqiq məlumat ver.
- Sifariş/rezerv/növbə kimi yeni qeydləri müvafiq siyahıya (alətlə) əlavə et.
- Bilmədiyini və ya bazada olmayanı dürüst de; lazım olanda canlı operatora ötür.`;

export const BUSINESS_TEMPLATE_REGISTRY: Record<BusinessTemplateId, BusinessTemplate> = {
  hotel: {
    id: "hotel",
    label: "Otel",
    description: "Otaq rezervasiyası, qiymətlər, boş otaqlar, xidmətlər.",
    starterPrompt: `Sən bir otelin resepşn operatorusan. ${AZ_BASE_STYLE}
Otaq tipləri, qiymətlər, boş tarixlər və xidmətlər barədə kömək et. Rezervasiya götür.`,
    suggestedKnowledge: ["Otaq tipləri və qiymətlər", "Boş tarixlər", "Xidmətlər", "Qaydalar"],
  },
  clinic: {
    id: "clinic",
    label: "Klinika",
    description: "Həkim qəbulu, növbə yazılışı, xidmət qiymətləri.",
    starterPrompt: `Sən bir klinikanın qeydiyyat operatorusan. ${AZ_BASE_STYLE}
Həkimlər, xidmətlər, qiymətlər və növbə barədə kömək et. Qəbula yazılış götür.`,
    suggestedKnowledge: ["Həkimlər və ixtisaslar", "Xidmət qiymətləri", "İş qrafiki"],
  },
  restaurant: {
    id: "restaurant",
    label: "Restoran",
    description: "Menyu, rezervasiya, çatdırılma sifarişi.",
    starterPrompt: `Sən bir restoranın operatorusan. ${AZ_BASE_STYLE}
Menyu, qiymətlər, masa rezervasiyası və çatdırılma sifarişi ilə kömək et.`,
    suggestedKnowledge: ["Menyu və qiymətlər", "İş saatları", "Çatdırılma zonaları"],
  },
  electronics: {
    id: "electronics",
    label: "Elektronika mağazası",
    description: "Məhsul axtarışı, stok, qiymət, sifariş.",
    starterPrompt: `Sən bir elektronika mağazasının satış operatorusan. ${AZ_BASE_STYLE}
Məhsul tap, qiymət/stok de, tövsiyə ver və sifariş götür.`,
    suggestedKnowledge: ["Məhsul kataloqu", "Qiymət və stok", "Zəmanət şərtləri"],
  },
  clothing_store: {
    id: "clothing_store",
    label: "Geyim mağazası",
    description: "Ölçü, rəng, stok, sifariş.",
    starterPrompt: `Sən bir geyim mağazasının satış operatorusan. ${AZ_BASE_STYLE}
Ölçü/rəng/stok yoxla, tövsiyə ver və sifariş götür.`,
    suggestedKnowledge: ["Məhsullar, ölçü və rənglər", "Qiymətlər", "Qaytarma şərtləri"],
  },
  pharmacy: {
    id: "pharmacy",
    label: "Aptek",
    description: "Dərman mövcudluğu, qiymət (reseptsiz məsləhət yox).",
    starterPrompt: `Sən bir aptekin operatorusan. ${AZ_BASE_STYLE}
Dərmanın mövcudluğu və qiyməti ilə kömək et. Tibbi diaqnoz/dozaj məsləhəti vermə — həkimə yönləndir.`,
    suggestedKnowledge: ["Dərman siyahısı və qiymətlər", "Mövcudluq", "İş saatları"],
  },
  beauty_salon: {
    id: "beauty_salon",
    label: "Gözəllik salonu",
    description: "Xidmətlər, qiymətlər, növbə yazılışı.",
    starterPrompt: `Sən bir gözəllik salonunun operatorusan. ${AZ_BASE_STYLE}
Xidmətlər, qiymətlər və növbə ilə kömək et.`,
    suggestedKnowledge: ["Xidmətlər və qiymətlər", "Ustalar", "İş qrafiki"],
  },
  education: {
    id: "education",
    label: "Təhsil mərkəzi",
    description: "Kurslar, qiymətlər, qeydiyyat.",
    starterPrompt: `Sən bir təhsil mərkəzinin operatorusan. ${AZ_BASE_STYLE}
Kurslar, qrafik, qiymətlər və qeydiyyat ilə kömək et.`,
    suggestedKnowledge: ["Kurslar və qiymətlər", "Qrafik", "Müəllimlər"],
  },
  auto_service: {
    id: "auto_service",
    label: "Avto servis",
    description: "Xidmətlər, qiymət, növbə.",
    starterPrompt: `Sən bir avto servisin operatorusan. ${AZ_BASE_STYLE}
Xidmətlər, qiymətlər və növbə ilə kömək et.`,
    suggestedKnowledge: ["Xidmətlər və qiymətlər", "İş saatları", "Ehtiyat hissələri"],
  },
};

export function getBusinessTemplate(id: string): BusinessTemplate | undefined {
  return BUSINESS_TEMPLATE_REGISTRY[id as BusinessTemplateId];
}

export function listBusinessTemplates(): BusinessTemplate[] {
  return BUSINESS_TEMPLATES.map((id) => BUSINESS_TEMPLATE_REGISTRY[id]);
}

/** Sentinel id used when the operator defines a business not in the registry. */
export const CUSTOM_TEMPLATE_ID = "custom";

/** Any registry id OR "custom". */
export function isValidTemplateSelection(id: string): boolean {
  return id === CUSTOM_TEMPLATE_ID || BUSINESS_TEMPLATES.includes(id as BusinessTemplateId);
}

/**
 * Build a starter agent prompt for a custom (free-text) business type, so any
 * business can be onboarded from the panel. The operator can fully edit it after.
 */
export function buildCustomStarterPrompt(businessType: string): string {
  const label = businessType.trim() || "biznes";
  return `Sən "${label}" biznesinin telefon operatorusan. ${AZ_BASE_STYLE}
Müştərilərə "${label}" sahəsində kömək et: sualları cavabla, xidmət və qiymətlər barədə məlumat ver, sifariş və ya növbə götür.`;
}
