export const AGENT_INSTRUCTIONS = `
Sən CallAI Market-in səsli satış və operator agentisən. Adın Leyladır.

DİL VƏ DANIŞIQ STİLİ:
- Yalnız Azərbaycan dilində danış.
- İnsan kimi, təbii, isti və peşəkar danış. Robot kimi səslənmə.
- Qısa cümlələr işlət. Telefon danışığı kimi: 1–3 cümlə, sonra dinlə.
- Lazımsız təkrar və uzun monoloqdan çəkin.
- Müştərinin adını öyrənəndən sonra bəzən adla müraciət et.
- Təsdiq üçün təbii sözlər işlət: "əlbəttə", "baş üstə", "bir saniyə baxım", "tamam".
- Qiymət və nömrələri aydın oxu (məsələn: "min səkkiz yüz doxsan doqquz manat").

ROL:
1) Satış məsləhətçisi — məhsul tap, müqayisə et, tövsiyə ver, sifariş götür.
2) Operator — sifariş statusu, çatdırılma, şikayət, dəstək bileti, canlı operatora ötür.

DAVRANIŞ QAYDALARI:
- Əvvəlcə salamla və necə kömək edə biləcəyini soruş.
- Məhsul/sifariş/dəstək üçün alətlərdən istifadə et. Uydurma qiymət və stok demə.
- Alət cavabını gözlə, sonra danış.
- Sifariş yaratmazdan əvvəl: məhsul, miqdar, rəng/ölçü (lazımdırsa), ad, telefon, ünvan, ödəniş üsulunu təsdiqlə.
- Təsdiqdən sonra create_order çağır və sifariş nömrəsini oxu.
- Stok yoxdursa alternativ təklif et.
- Müştəri qəzəbli və ya mürəkkəb hüquqi/maliyyə məsələsi varsa transfer_to_human istifadə et.
- Heç vaxt kredit kartı tam nömrəsi və ya şifrə istəmə.

SƏS / LATENCY:
- Cavabı tez başla. "Bir saniyə yoxlayım" deyə bilərsən, amma uzun susma.
- Bir anda çox sual vermə — addım-addım irəlilə.
`.trim();

export const REALTIME_TOOLS = [
  {
    type: "function",
    name: "get_store_info",
    description: "Mağaza adı, ünvan, iş saatı, telefon, çatdırılma haqqı və kateqoriyaları qaytarır.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function",
    name: "search_products",
    description: "Kataloqda məhsul axtarır. Ad, kateqoriya və ya ehtiyaca görə filtrə salır.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Axtarış sözü, məsələn telefon, hoodie, qəhvə" },
        category: { type: "string", description: "Kateqoriya adı" },
        maxPrice: { type: "number", description: "Maksimum qiymət AZN" },
        inStockOnly: { type: "boolean", description: "Yalnız stokda olanlar" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_product",
    description: "Bir məhsulun ətraflı məlumatını gətirir.",
    parameters: {
      type: "object",
      properties: {
        productId: { type: "string" },
        name: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "check_availability",
    description: "Stok, rəng və ölçü uyğunluğunu yoxlayır.",
    parameters: {
      type: "object",
      properties: {
        productId: { type: "string" },
        quantity: { type: "number" },
        color: { type: "string" },
        size: { type: "string" },
      },
      required: ["productId"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "calculate_delivery",
    description: "Çatdırılma haqqı və təxmini vaxtı hesablayır.",
    parameters: {
      type: "object",
      properties: {
        subtotal: { type: "number" },
        district: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "create_order",
    description: "Müştəri təsdiqindən sonra sifariş yaradır və stokdan çıxır.",
    parameters: {
      type: "object",
      properties: {
        customerName: { type: "string" },
        phone: { type: "string" },
        address: { type: "string" },
        notes: { type: "string" },
        paymentMethod: { type: "string", description: "nağd, kart və ya online" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              productId: { type: "string" },
              quantity: { type: "number" },
              color: { type: "string" },
              size: { type: "string" },
            },
            required: ["productId", "quantity"],
            additionalProperties: false,
          },
        },
      },
      required: ["customerName", "phone", "address", "items"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_order_status",
    description: "Sifariş statusunu orderId və ya telefonla tapır.",
    parameters: {
      type: "object",
      properties: {
        orderId: { type: "string" },
        phone: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "create_support_ticket",
    description: "Şikayət və ya dəstək bileti yaradır.",
    parameters: {
      type: "object",
      properties: {
        customerName: { type: "string" },
        phone: { type: "string" },
        topic: { type: "string" },
        description: { type: "string" },
        priority: { type: "string", description: "aşağı, normal, yüksək" },
      },
      required: ["topic", "description"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "transfer_to_human",
    description: "Danışığı canlı operatora ötürür.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string" },
        customerName: { type: "string" },
        phone: { type: "string" },
        summary: { type: "string" },
      },
      additionalProperties: false,
    },
  },
];
