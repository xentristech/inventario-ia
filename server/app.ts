import cors from "cors";
import express from "express";
import fs from "node:fs/promises";
import multer from "multer";
import readXlsxFile from "read-excel-file/node";
import { extractInvoiceFromFile } from "./aiInvoice.js";
import { readCloudState, writeCloudState } from "./cloudState.js";

const currentInventoryPath =
  process.env.CURRENT_INVENTORY_PATH || "C:\\Users\\user\\Downloads\\copia inventario.xlsx";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

export const app = express();

app.use(cors({ origin: ["http://127.0.0.1:5173", "http://localhost:5173"] }));
app.use(express.json({ limit: "10mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    aiConfigured: Boolean(process.env.OPENAI_API_KEY),
    model: process.env.OPENAI_MODEL || "gpt-5-mini"
  });
});

app.get("/api/state", async (_req, res) => {
  try {
    res.json(await readCloudState());
  } catch (error) {
    res.status(503).json({ error: "CLOUD_STATE_UNAVAILABLE", detail: errorMessage(error) });
  }
});

app.put("/api/state", async (req, res) => {
  try {
    res.json(await writeCloudState(req.body));
  } catch (error) {
    res.status(503).json({ error: "CLOUD_STATE_SAVE_FAILED", detail: errorMessage(error) });
  }
});

app.get("/api/sheet", async (req, res) => {
  const rawUrl = String(req.query.url || "");
  if (!rawUrl) {
    res.status(400).json({ error: "SHEET_URL_REQUIRED" });
    return;
  }

  try {
    const csvUrl = toCsvUrl(rawUrl);
    const response = await fetch(csvUrl);
    if (!response.ok) {
      res.status(400).json({ error: "SHEET_FETCH_FAILED", status: response.status });
      return;
    }
    const text = await response.text();
    res.type("text/csv").send(text);
  } catch (error) {
    res.status(400).json({ error: "INVALID_SHEET_URL", detail: String(error) });
  }
});

app.get("/api/inventory/current", async (_req, res) => {
  try {
    await fs.access(currentInventoryPath);
    const rows = await readXlsxFile(currentInventoryPath);
    res.json({
      sourcePath: currentInventoryPath,
      records: rowsToRecords(rows)
    });
  } catch (error) {
    res.status(404).json({ error: "CURRENT_INVENTORY_NOT_FOUND", detail: String(error) });
  }
});

app.post("/api/inventory/parse", upload.single("inventory"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "INVENTORY_FILE_REQUIRED" });
    return;
  }

  const isExcel =
    req.file.mimetype.includes("spreadsheet") ||
    req.file.originalname.toLowerCase().endsWith(".xlsx");

  if (!isExcel) {
    res.status(415).json({ error: "UNSUPPORTED_INVENTORY_FILE" });
    return;
  }

  try {
    const rows = await readXlsxFile(req.file.buffer);
    res.json({
      fileName: req.file.originalname,
      records: rowsToRecords(rows)
    });
  } catch (error) {
    res.status(400).json({ error: "INVENTORY_PARSE_FAILED", detail: String(error) });
  }
});

app.post("/api/invoices/extract", upload.single("invoice"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "INVOICE_FILE_REQUIRED" });
    return;
  }

  const supported =
    req.file.mimetype.startsWith("image/") || req.file.mimetype === "application/pdf";

  if (!supported) {
    res.status(415).json({ error: "UNSUPPORTED_FILE_TYPE" });
    return;
  }

  try {
    const extraction = await extractInvoiceFromFile(req.file);
    res.json(extraction);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === "OPENAI_API_KEY_MISSING") {
      res.status(501).json({ error: "AI_NOT_CONFIGURED" });
      return;
    }
    res.status(500).json({ error: "INVOICE_EXTRACTION_FAILED", detail: message });
  }
});

function toCsvUrl(input: string): string {
  const url = new URL(input);
  if (!url.hostname.includes("docs.google.com")) {
    return url.toString();
  }

  const match = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
  if (!match) {
    return url.toString();
  }

  const gid = url.searchParams.get("gid") || "0";
  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${gid}`;
}

function rowsToRecords(rawRows: unknown) {
  const rows = normalizeWorkbookRows(rawRows);
  const [rawHeaders, ...body] = rows;
  if (!rawHeaders) return [];

  const headers = rawHeaders.map((header, index) => {
    const text = cellToText(header);
    return text || `columna ${index + 1}`;
  });

  return body
    .filter((row) => row.some((cell) => cell !== null && cell !== undefined && cellToText(cell) !== ""))
    .map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, cellToText(row[index])]))
    );
}

function normalizeWorkbookRows(rawRows: unknown): unknown[][] {
  if (
    Array.isArray(rawRows) &&
    rawRows.length === 1 &&
    rawRows[0] &&
    typeof rawRows[0] === "object" &&
    "data" in rawRows[0] &&
    Array.isArray((rawRows[0] as { data?: unknown }).data)
  ) {
    return (rawRows[0] as { data: unknown[][] }).data;
  }

  return Array.isArray(rawRows) ? (rawRows as unknown[][]) : [];
}

function cellToText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(value);
  }
  return String(value).trim();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export default app;
