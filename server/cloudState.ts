import { get, put } from "@vercel/blob";

export type CloudInventoryState = {
  products: unknown[];
  invoices: unknown[];
  exits: unknown[];
  productReturns: unknown[];
  updatedAt: string | null;
};

const STATE_PATH = "inventory/state.json";

export const emptyCloudState: CloudInventoryState = {
  products: [],
  invoices: [],
  exits: [],
  productReturns: [],
  updatedAt: null
};

export async function readCloudState(): Promise<CloudInventoryState> {
  assertCloudConfigured();

  const result = await get(STATE_PATH, { access: "private", useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return cloneEmptyState();
  }

  const text = await new Response(result.stream).text();
  if (!text.trim()) return cloneEmptyState();

  return normalizeCloudState(JSON.parse(text));
}

export async function writeCloudState(input: unknown): Promise<CloudInventoryState> {
  assertCloudConfigured();

  const state = {
    ...normalizeCloudState(input),
    updatedAt: new Date().toISOString()
  };

  await put(STATE_PATH, JSON.stringify(state), {
    access: "private",
    allowOverwrite: true,
    contentType: "application/json",
    cacheControlMaxAge: 60
  });

  return state;
}

function assertCloudConfigured() {
  if (process.env.BLOB_READ_WRITE_TOKEN) return;
  if (process.env.VERCEL_OIDC_TOKEN && process.env.BLOB_STORE_ID) return;
  throw new Error("BLOB_NOT_CONFIGURED");
}

function normalizeCloudState(value: unknown): CloudInventoryState {
  const state = (value || {}) as Partial<CloudInventoryState>;
  return {
    products: normalizeArray(state.products),
    invoices: normalizeArray(state.invoices),
    exits: normalizeArray(state.exits),
    productReturns: normalizeArray(state.productReturns),
    updatedAt: typeof state.updatedAt === "string" ? state.updatedAt : null
  };
}

function normalizeArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function cloneEmptyState(): CloudInventoryState {
  return {
    ...emptyCloudState,
    products: [],
    invoices: [],
    exits: [],
    productReturns: []
  };
}
