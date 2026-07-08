import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { nanoid } from "nanoid";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, "..", "data", "store.json");

function readStore() {
  return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
}

function writeStore(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), "utf8");
}

function normalize(text = "") {
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

export function getStoreInfo() {
  const { store, categories } = readStore();
  return { ...store, categories };
}

export function searchProducts({ query = "", category = "", maxPrice, inStockOnly = true } = {}) {
  const data = readStore();
  const q = normalize(query);
  const cat = normalize(category);

  let items = data.products.filter((p) => {
    if (inStockOnly && p.stock <= 0) return false;
    if (typeof maxPrice === "number" && p.price > maxPrice) return false;
    if (cat && normalize(p.category) !== cat) return false;
    if (!q) return true;
    const hay = normalize(`${p.name} ${p.category} ${p.description} ${(p.colors || []).join(" ")}`);
    return hay.includes(q) || q.split(/\s+/).every((token) => hay.includes(token));
  });

  items = items
    .sort((a, b) => a.price - b.price)
    .slice(0, 8)
    .map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      price: p.price,
      stock: p.stock,
      colors: p.colors || [],
      sizes: p.sizes || [],
      description: p.description,
    }));

  return {
    count: items.length,
    currency: data.store.currency,
    products: items,
  };
}

export function getProduct({ productId, name } = {}) {
  const data = readStore();
  let product = null;
  if (productId) {
    product = data.products.find((p) => p.id === productId);
  }
  if (!product && name) {
    const n = normalize(name);
    product = data.products.find((p) => normalize(p.name).includes(n) || n.includes(normalize(p.name)));
  }
  if (!product) {
    return { found: false, message: "Məhsul tapılmadı." };
  }
  return {
    found: true,
    product: {
      id: product.id,
      name: product.name,
      category: product.category,
      price: product.price,
      stock: product.stock,
      colors: product.colors || [],
      sizes: product.sizes || [],
      description: product.description,
      available: product.stock > 0,
    },
    currency: data.store.currency,
  };
}

export function checkAvailability({ productId, quantity = 1, color, size } = {}) {
  const data = readStore();
  const product = data.products.find((p) => p.id === productId);
  if (!product) return { available: false, message: "Məhsul tapılmadı." };

  if (color && product.colors?.length && !product.colors.some((c) => normalize(c) === normalize(color))) {
    return {
      available: false,
      message: `Bu rəng yoxdur. Mövcud rənglər: ${product.colors.join(", ")}`,
      product: { id: product.id, name: product.name },
    };
  }

  if (size && product.sizes?.length && !product.sizes.some((s) => normalize(s) === normalize(size))) {
    return {
      available: false,
      message: `Bu ölçü yoxdur. Mövcud ölçülər: ${product.sizes.join(", ")}`,
      product: { id: product.id, name: product.name },
    };
  }

  const qty = Math.max(1, Number(quantity) || 1);
  if (product.stock < qty) {
    return {
      available: false,
      message: `Stokda yalnız ${product.stock} ədəd var.`,
      stock: product.stock,
      product: { id: product.id, name: product.name, price: product.price },
    };
  }

  return {
    available: true,
    stock: product.stock,
    unitPrice: product.price,
    lineTotal: product.price * qty,
    currency: data.store.currency,
    product: {
      id: product.id,
      name: product.name,
      color: color || null,
      size: size || null,
      quantity: qty,
    },
  };
}

export function calculateDelivery({ subtotal = 0, district = "" } = {}) {
  const { store } = readStore();
  const amount = Number(subtotal) || 0;
  const fee = amount >= store.freeDeliveryFrom ? 0 : store.deliveryFee;
  const [minEta, maxEta] = store.deliveryEtaMinutes;
  return {
    district: district || "Bakı",
    deliveryFee: fee,
    freeDeliveryFrom: store.freeDeliveryFrom,
    etaMinutes: { min: minEta, max: maxEta },
    currency: store.currency,
    note:
      fee === 0
        ? "Çatdırılma pulsuzdur."
        : `${store.freeDeliveryFrom} ${store.currency}-dən yuxarı sifarişlərdə çatdırılma pulsuzdur.`,
  };
}

export function createOrder({
  customerName,
  phone,
  address,
  items = [],
  notes = "",
  paymentMethod = "nağd",
} = {}) {
  if (!customerName || !phone || !address) {
    return {
      ok: false,
      message: "Sifariş üçün ad, telefon və ünvan lazımdır.",
    };
  }
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, message: "Səbətdə məhsul yoxdur." };
  }

  const data = readStore();
  const lines = [];
  let subtotal = 0;

  for (const item of items) {
    const product = data.products.find((p) => p.id === item.productId);
    if (!product) {
      return { ok: false, message: `Məhsul tapılmadı: ${item.productId}` };
    }
    const qty = Math.max(1, Number(item.quantity) || 1);
    if (product.stock < qty) {
      return {
        ok: false,
        message: `${product.name} üçün kifayət qədər stok yoxdur (qalıq: ${product.stock}).`,
      };
    }
    const lineTotal = product.price * qty;
    subtotal += lineTotal;
    lines.push({
      productId: product.id,
      name: product.name,
      quantity: qty,
      unitPrice: product.price,
      lineTotal,
      color: item.color || null,
      size: item.size || null,
    });
  }

  const delivery = calculateDelivery({ subtotal, district: address });
  const total = subtotal + delivery.deliveryFee;
  const orderId = `ORD-${nanoid(8).toUpperCase()}`;

  for (const line of lines) {
    const product = data.products.find((p) => p.id === line.productId);
    product.stock -= line.quantity;
  }

  const order = {
    id: orderId,
    status: "qəbul edildi",
    createdAt: new Date().toISOString(),
    customerName,
    phone,
    address,
    notes,
    paymentMethod,
    items: lines,
    subtotal,
    deliveryFee: delivery.deliveryFee,
    total,
    currency: data.store.currency,
    etaMinutes: delivery.etaMinutes,
  };

  data.orders.unshift(order);
  writeStore(data);

  return {
    ok: true,
    message: "Sifariş uğurla yaradıldı.",
    order: {
      id: order.id,
      status: order.status,
      total: order.total,
      deliveryFee: order.deliveryFee,
      currency: order.currency,
      etaMinutes: order.etaMinutes,
      items: order.items.map((i) => `${i.quantity}x ${i.name}`),
      phone: order.phone,
      address: order.address,
    },
  };
}

export function getOrderStatus({ orderId, phone } = {}) {
  const data = readStore();
  let order = null;
  if (orderId) {
    order = data.orders.find((o) => normalize(o.id) === normalize(orderId));
  }
  if (!order && phone) {
    order = data.orders.find((o) => o.phone.replace(/\s+/g, "").includes(String(phone).replace(/\s+/g, "")));
  }
  if (!order) {
    return { found: false, message: "Sifariş tapılmadı." };
  }
  return {
    found: true,
    order: {
      id: order.id,
      status: order.status,
      total: order.total,
      currency: order.currency,
      createdAt: order.createdAt,
      items: order.items.map((i) => `${i.quantity}x ${i.name}`),
      etaMinutes: order.etaMinutes,
      address: order.address,
    },
  };
}

export function createSupportTicket({
  customerName,
  phone,
  topic,
  description,
  priority = "normal",
} = {}) {
  if (!topic || !description) {
    return { ok: false, message: "Mövzu və təsvir lazımdır." };
  }
  const data = readStore();
  const ticket = {
    id: `TKT-${nanoid(7).toUpperCase()}`,
    status: "açıq",
    priority,
    customerName: customerName || "Naməlum",
    phone: phone || "",
    topic,
    description,
    createdAt: new Date().toISOString(),
  };
  data.tickets.unshift(ticket);
  writeStore(data);
  return {
    ok: true,
    message: "Dəstək bileti yaradıldı. Operator komandası tezliklə baxacaq.",
    ticket: {
      id: ticket.id,
      status: ticket.status,
      topic: ticket.topic,
      priority: ticket.priority,
    },
  };
}

export function transferToHuman({ reason, customerName, phone, summary } = {}) {
  const data = readStore();
  const ticket = {
    id: `HND-${nanoid(7).toUpperCase()}`,
    status: "operatora ötürülüb",
    priority: "yüksək",
    customerName: customerName || "Naməlum",
    phone: phone || "",
    topic: "Canlı operatora ötürülmə",
    description: `Səbəb: ${reason || "müştəri istəyi"}\nXülasə: ${summary || "-"}`,
    createdAt: new Date().toISOString(),
  };
  data.tickets.unshift(ticket);
  writeStore(data);
  return {
    ok: true,
    message:
      "Sizi canlı operatora ötürürəm. Növbədəsiniz — bir neçə dəqiqə ərzində əlaqə saxlanılacaq.",
    handoffId: ticket.id,
    storePhone: data.store.phone,
  };
}

export const toolHandlers = {
  get_store_info: () => getStoreInfo(),
  search_products: (args) => searchProducts(args),
  get_product: (args) => getProduct(args),
  check_availability: (args) => checkAvailability(args),
  calculate_delivery: (args) => calculateDelivery(args),
  create_order: (args) => createOrder(args),
  get_order_status: (args) => getOrderStatus(args),
  create_support_ticket: (args) => createSupportTicket(args),
  transfer_to_human: (args) => transferToHuman(args),
};
