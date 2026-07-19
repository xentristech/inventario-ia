import type { InvoiceRecord, Product, ProductExit, ProductReturn } from "./types";

const PRODUCT_KEY = "inventario-ia-products";
const INVOICE_KEY = "inventario-ia-invoices";
const EXIT_KEY = "inventario-ia-exits";
const RETURN_KEY = "inventario-ia-returns";

export type InventorySnapshot = {
  products: Product[];
  invoices: InvoiceRecord[];
  exits: ProductExit[];
  productReturns: ProductReturn[];
  updatedAt?: string | null;
};

export function loadProducts(): Product[] {
  return loadJson<Product[]>(PRODUCT_KEY, []);
}

export function saveProducts(products: Product[]) {
  localStorage.setItem(PRODUCT_KEY, JSON.stringify(products));
}

export function loadInvoices(): InvoiceRecord[] {
  return loadJson<InvoiceRecord[]>(INVOICE_KEY, []);
}

export function saveInvoices(invoices: InvoiceRecord[]) {
  localStorage.setItem(INVOICE_KEY, JSON.stringify(invoices));
}

export function loadExits(): ProductExit[] {
  return loadJson<ProductExit[]>(EXIT_KEY, []);
}

export function saveExits(exits: ProductExit[]) {
  localStorage.setItem(EXIT_KEY, JSON.stringify(exits));
}

export function loadReturns(): ProductReturn[] {
  return loadJson<ProductReturn[]>(RETURN_KEY, []);
}

export function saveReturns(returns: ProductReturn[]) {
  localStorage.setItem(RETURN_KEY, JSON.stringify(returns));
}

export function clearLocalInventoryData() {
  [PRODUCT_KEY, INVOICE_KEY, EXIT_KEY, RETURN_KEY].forEach((key) => localStorage.removeItem(key));
}

export async function loadCloudSnapshot(): Promise<InventorySnapshot | null> {
  const response = await fetch("/api/state", { cache: "no-store" });
  if (!response.ok) return null;
  return normalizeSnapshot(await response.json());
}

export async function saveCloudSnapshot(snapshot: InventorySnapshot): Promise<InventorySnapshot> {
  const response = await fetch("/api/state", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(snapshot)
  });

  if (!response.ok) {
    throw new Error("CLOUD_SAVE_FAILED");
  }

  return normalizeSnapshot(await response.json());
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeSnapshot(value: unknown): InventorySnapshot {
  const snapshot = (value || {}) as Partial<InventorySnapshot>;
  return {
    products: Array.isArray(snapshot.products) ? snapshot.products : [],
    invoices: Array.isArray(snapshot.invoices) ? snapshot.invoices : [],
    exits: Array.isArray(snapshot.exits) ? snapshot.exits : [],
    productReturns: Array.isArray(snapshot.productReturns) ? snapshot.productReturns : [],
    updatedAt: typeof snapshot.updatedAt === "string" ? snapshot.updatedAt : null
  };
}
