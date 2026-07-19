import type { InvoiceRecord, Product, ProductExit, ProductReturn } from "./types";

const PRODUCT_KEY = "inventario-ia-products";
const INVOICE_KEY = "inventario-ia-invoices";
const EXIT_KEY = "inventario-ia-exits";
const RETURN_KEY = "inventario-ia-returns";

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

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
