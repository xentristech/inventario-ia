export type Product = {
  id: string;
  sku: string;
  name: string;
  category: string;
  brand?: string;
  motor?: string;
  crossRef?: string;
  customerRef?: string;
  location?: string;
  initialStock?: number;
  entries?: number;
  exits?: number;
  stock: number;
  minStock: number;
  unitCost: number;
  price: number;
  supplier: string;
  photo?: string;
  updatedAt: string;
  source?: string;
};

export type InvoiceItem = {
  sku: string | null;
  name: string;
  category: string | null;
  quantity: number;
  unit: string | null;
  unitCost: number | null;
  lineTotal: number | null;
  confidence: number;
};

export type InvoiceExtraction = {
  supplier: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  currency: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  confidence: number;
  items: InvoiceItem[];
};

export type InvoiceRecord = InvoiceExtraction & {
  id: string;
  fileName: string;
  status: "pendiente" | "aplicada" | "manual" | "error";
  createdAt: string;
  notes?: string;
};

export type ProductExit = {
  id: string;
  batchId?: string;
  date: string;
  sku: string;
  productId?: string;
  productName: string;
  brand?: string;
  location?: string;
  quantity: number;
  client: string;
  reference: string;
  notes?: string;
  createdAt: string;
};

export type ReturnType = "devolucion" | "cambio" | "garantia";

export type ReturnCondition = "bueno" | "revision" | "garantia" | "danado";

export type ProductReturn = {
  id: string;
  date: string;
  type: ReturnType;
  originalExitId: string;
  originalExitReference: string;
  client: string;
  returnedSku: string;
  returnedProductName: string;
  returnedQuantity: number;
  condition: ReturnCondition;
  restocked: boolean;
  replacementSku?: string;
  replacementProductName?: string;
  replacementQuantity?: number;
  replacementExitId?: string;
  reason: string;
  notes?: string;
  createdAt: string;
};

export type ImportRow = {
  sku: string;
  name: string;
  category: string;
  brand: string;
  motor: string;
  crossRef: string;
  customerRef: string;
  location: string;
  initialStock: number;
  entries: number;
  exits: number;
  stock: number;
  minStock: number;
  unitCost: number;
  price: number;
  supplier: string;
};
