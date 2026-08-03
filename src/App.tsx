import {
  AlertTriangle,
  Archive,
  Boxes,
  Camera,
  Check,
  ClipboardList,
  Download,
  FileDown,
  FileSpreadsheet,
  FileText,
  ImagePlus,
  Lock,
  PackagePlus,
  Pencil,
  Plus,
  Printer,
  RotateCcw,
  Search,
  Sparkles,
  TrendingUp,
  Trash2,
  Upload,
  X
} from "lucide-react";
import Papa from "papaparse";
import writeXlsxFile from "write-excel-file/browser";
import { ChangeEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import { sampleProducts } from "./sampleData";
import {
  clearLocalInventoryData,
  loadCloudSnapshot,
  loadEntries,
  loadExits,
  loadInvoices,
  loadProducts,
  loadReturns,
  saveCloudSnapshot,
  saveEntries,
  saveExits,
  saveInvoices,
  saveProducts,
  saveReturns
} from "./storage";
import type { InventorySnapshot } from "./storage";
import type {
  ImportRow,
  InvoiceExtraction,
  InvoiceItem,
  InvoiceRecord,
  Product,
  ProductEntry,
  ProductExit,
  ProductReturn,
  ReturnCondition,
  ReturnType
} from "./types";

type View = "dashboard" | "products" | "entries" | "exits" | "returns" | "invoices" | "import";

type ProductForm = {
  id: string | null;
  sku: string;
  name: string;
  category: string;
  brand: string;
  motor: string;
  crossRef: string;
  customerRef: string;
  location: string;
  initialStock: string;
  entries: string;
  exits: string;
  stock: string;
  minStock: string;
  unitCost: string;
  price: string;
  supplier: string;
  photo?: string;
};

type ExitForm = {
  date: string;
  sku: string;
  quantity: string;
  client: string;
  reference: string;
  notes: string;
};

type ExitLineDraft = {
  id: string;
  sku: string;
  quantity: number;
};

type EntryForm = {
  date: string;
  sku: string;
  quantity: string;
  supplier: string;
  reference: string;
  notes: string;
};

type EntryLineDraft = {
  id: string;
  sku: string;
  quantity: number;
};

type ReturnForm = {
  date: string;
  search: string;
  originalExitId: string;
  type: ReturnType;
  returnedQuantity: string;
  condition: ReturnCondition;
  replacementSku: string;
  replacementQuantity: string;
  reason: string;
  notes: string;
};

type RotationLevel = "alta" | "baja";

type RotationItem = {
  product: Product;
  level: RotationLevel;
  score: number;
  alertThreshold: number;
  alert: boolean;
  suggestedUnits: number;
};

type RotationDashboard = {
  cutoff: number;
  highRotation: RotationItem[];
  lowRotation: RotationItem[];
  alerts: RotationItem[];
  highAlerts: RotationItem[];
  lowAlerts: RotationItem[];
};

type ClientProductHistory = {
  key: string;
  sku: string;
  productId?: string;
  productName: string;
  client: string;
  brand?: string;
  location?: string;
  stock: number | null;
  totalQuantity: number;
  times: number;
  lastDate: string;
  lastReference: string;
  product?: Product;
};

type PrintView = "exit" | "entry" | "no-stock" | "return" | null;

const emptyForm: ProductForm = {
  id: null,
  sku: "",
  name: "",
  category: "Repuestos",
  brand: "",
  motor: "",
  crossRef: "",
  customerRef: "",
  location: "",
  initialStock: "0",
  entries: "0",
  exits: "0",
  stock: "0",
  minStock: "0",
  unitCost: "0",
  price: "0",
  supplier: ""
};

const emptyExitForm = (): ExitForm => ({
  date: new Date().toISOString().slice(0, 10),
  sku: "",
  quantity: "1",
  client: "",
  reference: "",
  notes: ""
});

const emptyEntryForm = (): EntryForm => ({
  date: new Date().toISOString().slice(0, 10),
  sku: "",
  quantity: "1",
  supplier: "",
  reference: "",
  notes: ""
});

const emptyReturnForm = (): ReturnForm => ({
  date: new Date().toISOString().slice(0, 10),
  search: "",
  originalExitId: "",
  type: "devolucion",
  returnedQuantity: "1",
  condition: "bueno",
  replacementSku: "",
  replacementQuantity: "1",
  reason: "Cambio solicitado por cliente",
  notes: ""
});

const navItems: Array<{ id: View; label: string; icon: typeof Boxes }> = [
  { id: "dashboard", label: "Panel", icon: Boxes },
  { id: "products", label: "Repuestos", icon: Archive },
  { id: "entries", label: "Entradas", icon: Download },
  { id: "exits", label: "Salidas", icon: ClipboardList },
  { id: "returns", label: "Cambios", icon: RotateCcw },
  { id: "invoices", label: "Facturas", icon: FileText },
  { id: "import", label: "Sheets/CSV", icon: FileSpreadsheet }
];

function App() {
  const [view, setView] = useState<View>("dashboard");
  const [products, setProducts] = useState<Product[]>(() => loadProducts());
  const [invoices, setInvoices] = useState<InvoiceRecord[]>(() => loadInvoices());
  const [entries, setEntries] = useState<ProductEntry[]>(() => loadEntries());
  const [exits, setExits] = useState<ProductExit[]>(() => loadExits());
  const [productReturns, setProductReturns] = useState<ProductReturn[]>(() => loadReturns());
  const [productForm, setProductForm] = useState<ProductForm>(emptyForm);
  const [exitForm, setExitForm] = useState<ExitForm>(() => emptyExitForm());
  const [exitLines, setExitLines] = useState<ExitLineDraft[]>([]);
  const [exitStatus, setExitStatus] = useState("");
  const [printableExit, setPrintableExit] = useState<ProductExit[]>([]);
  const [entryForm, setEntryForm] = useState<EntryForm>(() => emptyEntryForm());
  const [entryLines, setEntryLines] = useState<EntryLineDraft[]>([]);
  const [entryStatus, setEntryStatus] = useState("");
  const [printableEntry, setPrintableEntry] = useState<ProductEntry[]>([]);
  const [entryHistoryQuery, setEntryHistoryQuery] = useState("");
  const [entryPage, setEntryPage] = useState(0);
  const [entryGrouped, setEntryGrouped] = useState(true);
  const [entryFilters, setEntryFilters] = useState<HistoryFilters>(emptyHistoryFilters());
  const [entrySmartQuery, setEntrySmartQuery] = useState("");
  const [entrySmartStatus, setEntrySmartStatus] = useState("");
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminPromptOpen, setAdminPromptOpen] = useState(false);
  const [adminKeyInput, setAdminKeyInput] = useState("");
  const [adminKeyError, setAdminKeyError] = useState("");
  const [movementEdit, setMovementEdit] = useState<{ kind: "entry" | "exit"; id: string } | null>(null);
  const [movementEditForm, setMovementEditForm] = useState({ date: "", party: "", reference: "", quantity: "1" });
  const [movementDeleteArmed, setMovementDeleteArmed] = useState(false);
  const [rowDeleteArmed, setRowDeleteArmed] = useState<string | null>(null);
  const [returnForm, setReturnForm] = useState<ReturnForm>(() => emptyReturnForm());
  const [returnStatus, setReturnStatus] = useState("");
  const [printableReturn, setPrintableReturn] = useState<ProductReturn | null>(null);
  const [printView, setPrintView] = useState<PrintView>(null);
  const [query, setQuery] = useState("");
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [invoiceDraft, setInvoiceDraft] = useState<InvoiceExtraction | null>(null);
  const [invoiceStatus, setInvoiceStatus] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [manualLines, setManualLines] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importStatus, setImportStatus] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [exitPage, setExitPage] = useState(0);
  const [exitGrouped, setExitGrouped] = useState(true);
  const [productPage, setProductPage] = useState(0);
  const [returnPage, setReturnPage] = useState(0);
  const [exitFilters, setExitFilters] = useState<HistoryFilters>(emptyHistoryFilters());
  const [exitSmartQuery, setExitSmartQuery] = useState("");
  const [exitSmartStatus, setExitSmartStatus] = useState("");
  const [smartSearching, setSmartSearching] = useState(false);
  const [cloudReady, setCloudReady] = useState(false);
  const [cloudStatus, setCloudStatus] = useState("Sincronizando nube...");
  const localInventoryAvailable = isLocalRuntime();

  useEffect(() => saveProducts(products), [products]);
  useEffect(() => saveInvoices(invoices), [invoices]);
  useEffect(() => saveEntries(entries), [entries]);
  useEffect(() => saveExits(exits), [exits]);
  useEffect(() => saveReturns(productReturns), [productReturns]);

  useEffect(() => {
    let cancelled = false;

    loadCloudSnapshot()
      .then((snapshot) => {
        if (cancelled) return;
        if (!snapshot) {
          setCloudStatus("Nube no disponible. Se guarda en este navegador.");
          return;
        }

        if (hasSnapshotData(snapshot)) {
          applySnapshot(snapshot);
          setImportStatus(`Inventario sincronizado en nube${formatCloudDate(snapshot.updatedAt)}.`);
          setCloudStatus(`Sincronizado en nube${formatCloudDate(snapshot.updatedAt)}.`);
        } else {
          setCloudStatus("Nube lista. Al importar, quedara disponible para todos.");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCloudStatus("Sin conexion con nube. Se guarda en este navegador.");
        }
      })
      .finally(() => {
        if (!cancelled) setCloudReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!cloudReady) return;

    const snapshot = createSnapshot(products, invoices, entries, exits, productReturns);
    const handle = window.setTimeout(() => {
      setCloudStatus("Guardando en nube...");
      saveCloudSnapshot(snapshot)
        .then((savedSnapshot) => setCloudStatus(`Sincronizado en nube${formatCloudDate(savedSnapshot.updatedAt)}.`))
        .catch(() => setCloudStatus("No se pudo guardar en nube. Queda en este navegador."));
    }, 900);

    return () => window.clearTimeout(handle);
  }, [cloudReady, products, invoices, entries, exits, productReturns]);
  useEffect(() => {
    if (loadProducts().length > 0) return;

    let cancelled = false;
    fetch("/api/inventory/current")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (cancelled || !payload?.records) return;
        const rows = payload.records
          .map(normalizeImportRow)
          .filter((row: ImportRow | null): row is ImportRow => Boolean(row));
        if (rows.length) {
          const importedProducts = rows.map(importRowToProduct);
          setProducts((current) => (current.length ? current : importedProducts));
          setImportStatus(`${rows.length} referencias cargadas desde copia inventario.xlsx.`);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const units = products.reduce((sum, product) => sum + product.stock, 0);
    const entries = products.reduce((sum, product) => sum + (product.entries || 0), 0);
    const exits = products.reduce((sum, product) => sum + (product.exits || 0), 0);
    const lowStock = products.filter((product) => product.stock <= 0);
    const withoutLocation = products.filter((product) => !product.location);
    const rotation = buildRotationDashboard(products);
    return { units, entries, exits, lowStock, withoutLocation, rotation };
  }, [products]);

  const filteredProducts = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) return products;
    return products.filter((product) =>
      [
        product.sku,
        product.name,
        product.brand,
        product.motor,
        product.crossRef,
        product.customerRef,
        product.location
      ]
        .join(" ")
        .toLowerCase()
        .includes(cleanQuery)
    );
  }, [products, query]);

  const pagedProducts = useMemo(
    () => pageSlice(filteredProducts, productPage, PRODUCT_PAGE_SIZE),
    [filteredProducts, productPage]
  );

  useEffect(() => setProductPage(0), [query]);
  useEffect(() => setEntryPage(0), [entryHistoryQuery, entryFilters, entryGrouped]);
  useEffect(() => setExitPage(0), [historyQuery, exitFilters, exitGrouped]);

  const selectedExitProduct = useMemo(
    () => matchProductForExit(products, exitForm.sku).product,
    [products, exitForm.sku]
  );
  const resolvedExitLines = useMemo(
    () =>
      exitLines.map((line) => ({
        ...line,
        product: findProductForSku(products, line.sku)
      })),
    [exitLines, products]
  );
  const stagedExitQuantity = resolvedExitLines.reduce((sum, line) => sum + line.quantity, 0);
  const knownClients = useMemo(() => buildClientOptions(exits), [exits]);
  const selectedEntryProduct = useMemo(
    () => matchProductForExit(products, entryForm.sku).product,
    [products, entryForm.sku]
  );
  const resolvedEntryLines = useMemo(
    () =>
      entryLines.map((line) => ({
        ...line,
        product: findProductForSku(products, line.sku)
      })),
    [entryLines, products]
  );
  const stagedEntryQuantity = resolvedEntryLines.reduce((sum, line) => sum + line.quantity, 0);
  const knownSuppliers = useMemo(() => buildSupplierOptions(entries), [entries]);
  const filteredEntriesAll = useMemo(
    () => filterEntryHistory(entries, entryHistoryQuery, entryFilters),
    [entries, entryHistoryQuery, entryFilters]
  );
  const filteredHistoryEntries = useMemo(
    () => pageSlice(filteredEntriesAll, entryPage, HISTORY_PAGE_SIZE),
    [filteredEntriesAll, entryPage]
  );
  const entryGroups = useMemo(
    () => groupMovements(filteredEntriesAll, (entry) => entry.supplier),
    [filteredEntriesAll]
  );
  const pagedEntryGroups = useMemo(
    () => pageSlice(entryGroups, entryPage, GROUP_PAGE_SIZE),
    [entryGroups, entryPage]
  );
  const entryHistoryUnits = useMemo(
    () => filteredEntriesAll.reduce((sum, entry) => sum + entry.quantity, 0),
    [filteredEntriesAll]
  );
  const filteredExitsAll = useMemo(
    () => filterExitHistory(exits, historyQuery, exitFilters),
    [exits, historyQuery, exitFilters]
  );
  const filteredHistoryExits = useMemo(
    () => pageSlice(filteredExitsAll, exitPage, HISTORY_PAGE_SIZE),
    [filteredExitsAll, exitPage]
  );
  const exitGroups = useMemo(
    () => groupMovements(filteredExitsAll, (exit) => exit.client),
    [filteredExitsAll]
  );
  const pagedExitGroups = useMemo(
    () => pageSlice(exitGroups, exitPage, GROUP_PAGE_SIZE),
    [exitGroups, exitPage]
  );
  const exitHistoryUnits = useMemo(
    () => filteredExitsAll.reduce((sum, exit) => sum + exit.quantity, 0),
    [filteredExitsAll]
  );
  const clientProductHistory = useMemo(
    () => buildClientProductHistory(exits, products, historyQuery),
    [exits, products, historyQuery]
  );
  const selectedReturnExit = useMemo(
    () => exits.find((exit) => exit.id === returnForm.originalExitId),
    [exits, returnForm.originalExitId]
  );
  const returnExitMatches = useMemo(() => {
    const cleanSearch = normalizeHeader(returnForm.search);
    return exits
      .filter((exit) => {
        const remaining = remainingReturnQuantity(productReturns, exit);
        if (remaining <= 0) return false;
        if (!cleanSearch) return true;
        return normalizeHeader(
          [exit.date, exit.reference, exit.client, exit.sku, exit.productName, exit.location].join(" ")
        ).includes(cleanSearch);
      })
      .slice(0, 18);
  }, [exits, productReturns, returnForm.search]);
  const selectedReturnRemaining = selectedReturnExit
    ? remainingReturnQuantity(productReturns, selectedReturnExit)
    : 0;
  const selectedReplacementProduct = useMemo(
    () => matchProductForExit(products, returnForm.replacementSku).product,
    [products, returnForm.replacementSku]
  );

  function loadDemo() {
    setProducts((current) => mergeProducts(current, sampleProducts));
    setView("dashboard");
  }

  function applySnapshot(snapshot: InventorySnapshot) {
    setProducts(snapshot.products);
    setInvoices(snapshot.invoices);
    setEntries(snapshot.entries);
    setExits(snapshot.exits);
    setProductReturns(snapshot.productReturns);
  }

  async function resetAll() {
    clearLocalInventoryData();
    setInvoiceDraft(null);
    setImportRows([]);
    setExitForm(emptyExitForm());
    setExitLines([]);
    setExitStatus("");
    setPrintableExit([]);
    setEntryForm(emptyEntryForm());
    setEntryLines([]);
    setEntryStatus("");
    setPrintableEntry([]);
    setReturnForm(emptyReturnForm());
    setReturnStatus("");
    setPrintableReturn(null);
    setPrintView(null);
    setCloudStatus("Recargando inventario de la nube...");

    try {
      const snapshot = await loadCloudSnapshot();
      if (snapshot && hasSnapshotData(snapshot)) {
        applySnapshot(snapshot);
        setImportStatus("Datos de este navegador limpiados. Inventario de nube recargado.");
        setCloudStatus(`Sincronizado en nube${formatCloudDate(snapshot.updatedAt)}.`);
      } else {
        applySnapshot(createSnapshot([], [], [], [], []));
        setImportStatus("Datos de este navegador limpiados.");
        setCloudStatus("Nube lista. Al importar, quedara disponible para todos.");
      }
    } catch {
      setImportStatus("Datos de este navegador limpiados. No pude recargar la nube.");
      setCloudStatus("No se pudo conectar con la nube.");
    }
  }

  function submitProduct(event: FormEvent) {
    event.preventDefault();
    const now = new Date().toISOString();
    const product: Product = {
      id: productForm.id || createId("prd"),
      sku: normalizeSku(productForm.sku) || createSku(productForm.name),
      name: productForm.name.trim(),
      category: productForm.category.trim() || "Sin categoria",
      brand: productForm.brand.trim(),
      motor: productForm.motor.trim(),
      crossRef: productForm.crossRef.trim(),
      customerRef: productForm.customerRef.trim(),
      location: productForm.location.trim().toUpperCase(),
      initialStock: toNumber(productForm.initialStock),
      entries: toNumber(productForm.entries),
      exits: toNumber(productForm.exits),
      stock: toNumber(productForm.stock),
      minStock: toNumber(productForm.minStock),
      unitCost: toNumber(productForm.unitCost),
      price: toNumber(productForm.price),
      supplier: productForm.supplier.trim(),
      photo: productForm.photo,
      updatedAt: now,
      source: productForm.id ? "editado" : "manual"
    };

    if (!product.name) return;

    if (productForm.id) {
      const previous = products.find((item) => item.id === product.id);
      const delta = previous ? product.stock - previous.stock : 0;
      if (previous && delta !== 0) {
        const date = now.slice(0, 10);
        if (delta > 0) {
          product.entries = (product.entries || 0) + delta;
          const record: ProductEntry = {
            id: createId("ent"),
            batchId: createId("entrada"),
            date,
            sku: product.sku,
            productId: product.id,
            productName: product.name,
            brand: product.brand,
            location: product.location,
            quantity: delta,
            supplier: "AJUSTE",
            reference: `Ajuste manual ${date}`,
            notes: `Stock corregido de ${previous.stock} a ${product.stock}`,
            createdAt: now
          };
          setEntries((current) => [record, ...current]);
        } else {
          product.exits = (product.exits || 0) - delta;
          const record: ProductExit = {
            id: createId("sal"),
            batchId: createId("salida"),
            date,
            sku: product.sku,
            productId: product.id,
            productName: product.name,
            brand: product.brand,
            location: product.location,
            quantity: -delta,
            client: "AJUSTE",
            reference: `Ajuste manual ${date}`,
            notes: `Stock corregido de ${previous.stock} a ${product.stock}`,
            createdAt: now
          };
          setExits((current) => [record, ...current]);
        }
      }
    }

    setProducts((current) =>
      productForm.id
        ? current.map((item) => (item.id === product.id ? product : item))
        : [product, ...current]
    );
    setProductForm(emptyForm);
  }

  async function exportInventoryExcel() {
    const bold = { fontWeight: "bold" as const };
    const cell = (value: string) => ({ value, type: String });
    const numCell = (value: number) => ({ value, type: Number });
    const headerRow = (labels: string[]) => labels.map((label) => ({ ...cell(label), ...bold }));

    const byDate = <T extends { date: string; createdAt: string }>(a: T, b: T) =>
      a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt);

    const inventorySheet = [
      headerRow([
        "CODIGO DE REFERENCIA",
        "NOMBRE DEL PRODUCTO",
        "MARCA",
        "MOTOR",
        "CRUZA",
        "REF. CLIENTE",
        "UBICACION",
        "CANTIDAD INICIAL",
        "TOTAL ENTRADAS",
        "TOTAL SALIDAS",
        "STOCK ACTUAL"
      ]),
      ...products.map((product) => [
        cell(product.sku),
        cell(product.name),
        cell(product.brand || ""),
        cell(product.motor || ""),
        cell(product.crossRef || ""),
        cell(product.customerRef || ""),
        cell(product.location || ""),
        numCell(product.initialStock || 0),
        numCell(product.entries || 0),
        numCell(product.exits || 0),
        numCell(product.stock)
      ])
    ];

    const entriesSheet = [
      headerRow(["Fecha", "Proveedor", "Codigo de Referencia", "Descripcion", "Cantidad", "Referencia"]),
      ...[...entries].sort(byDate).map((entry) => [
        cell(entry.date),
        cell(entry.supplier),
        cell(entry.sku),
        cell(entry.productName),
        numCell(entry.quantity),
        cell(entry.reference)
      ])
    ];

    const exitsSheet = [
      headerRow(["Fecha", "Codigo de Referencia", "Cliente", "Descripcion", "Cantidad", "Referencia"]),
      ...[...exits].sort(byDate).map((exit) => [
        cell(exit.date),
        cell(exit.sku),
        cell(exit.client),
        cell(exit.productName),
        numCell(exit.quantity),
        cell(exit.reference)
      ])
    ];

    await writeXlsxFile([
      { sheet: "Inventario", data: inventorySheet },
      { sheet: "Entradas", data: entriesSheet },
      { sheet: "Salidas", data: exitsSheet }
    ]).toFile(`Inventario_YOTA_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function runSmartHistorySearch(kind: "entries" | "exits") {
    const query = (kind === "entries" ? entrySmartQuery : exitSmartQuery).trim();
    const setStatus = kind === "entries" ? setEntrySmartStatus : setExitSmartStatus;
    if (!query) {
      setStatus("Escribe que quieres buscar, por ejemplo: salidas a Sertemap en julio.");
      return;
    }

    setSmartSearching(true);
    setStatus("Analizando con IA...");
    try {
      const response = await fetch("/api/history/parse-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          kind,
          parties: kind === "entries" ? knownSuppliers : knownClients
        })
      });
      if (response.status === 501) {
        setStatus("La IA no esta configurada en el servidor.");
        return;
      }
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const result = (await response.json()) as {
        from: string | null;
        to: string | null;
        party: string | null;
        text: string | null;
        summary: string;
      };
      const filters: HistoryFilters = {
        from: result.from || "",
        to: result.to || "",
        party: result.party || ""
      };
      if (kind === "entries") {
        setEntryFilters(filters);
        setEntryHistoryQuery(result.text || "");
      } else {
        setExitFilters(filters);
        setHistoryQuery(result.text || "");
      }
      setStatus(result.summary || "Filtros aplicados.");
    } catch {
      setStatus("No pude interpretar la busqueda. Intenta de nuevo o usa los filtros manuales.");
    } finally {
      setSmartSearching(false);
    }
  }

  function startMovementEdit(
    kind: "entry" | "exit",
    record: { id: string; date: string; reference: string; quantity: number },
    party: string
  ) {
    setMovementEdit({ kind, id: record.id });
    setMovementEditForm({
      date: record.date,
      party,
      reference: record.reference,
      quantity: String(record.quantity)
    });
    setMovementDeleteArmed(false);
    setAdminKeyError("");
  }

  function cancelMovementEdit() {
    setMovementEdit(null);
    setMovementDeleteArmed(false);
    setAdminKeyError("");
  }

  function unlockAdmin(event: FormEvent) {
    event.preventDefault();
    if (adminKeyInput === ADMIN_KEY) {
      setAdminUnlocked(true);
      setAdminPromptOpen(false);
      setAdminKeyInput("");
      setAdminKeyError("");
    } else {
      setAdminKeyError("Clave incorrecta.");
    }
  }

  function toggleAdminMode() {
    if (adminUnlocked) {
      setAdminUnlocked(false);
      setAdminPromptOpen(false);
      cancelMovementEdit();
    } else {
      setAdminPromptOpen((current) => !current);
      setAdminKeyInput("");
      setAdminKeyError("");
    }
  }

  function applyProductDelta(
    sku: string,
    productId: string | undefined,
    stockDelta: number,
    entriesDelta: number,
    exitsDelta: number
  ) {
    const cleanSku = normalizeSku(sku);
    setProducts((current) =>
      current.map((item) => {
        const match = productId ? item.id === productId : Boolean(cleanSku) && normalizeSku(item.sku) === cleanSku;
        if (!match) return item;
        return {
          ...item,
          stock: Math.max(0, item.stock + stockDelta),
          entries: Math.max(0, (item.entries || 0) + entriesDelta),
          exits: Math.max(0, (item.exits || 0) + exitsDelta),
          updatedAt: new Date().toISOString()
        };
      })
    );
  }

  function saveMovementEdit(event: FormEvent) {
    event.preventDefault();
    if (!movementEdit) return;
    const quantity = toNumber(movementEditForm.quantity);
    if (!(quantity > 0)) return;
    const date = movementEditForm.date || new Date().toISOString().slice(0, 10);
    const party = movementEditForm.party.trim();
    const reference = movementEditForm.reference.trim();

    if (movementEdit.kind === "entry") {
      const record = entries.find((item) => item.id === movementEdit.id);
      if (!record) {
        cancelMovementEdit();
        return;
      }
      const delta = quantity - record.quantity;
      setEntries((current) =>
        current.map((item) =>
          item.id === record.id
            ? { ...item, date, supplier: party || item.supplier, reference: reference || item.reference, quantity }
            : item
        )
      );
      if (delta !== 0) applyProductDelta(record.sku, record.productId, delta, delta, 0);
    } else {
      const record = exits.find((item) => item.id === movementEdit.id);
      if (!record) {
        cancelMovementEdit();
        return;
      }
      const delta = quantity - record.quantity;
      setExits((current) =>
        current.map((item) =>
          item.id === record.id
            ? { ...item, date, client: party || item.client, reference: reference || item.reference, quantity }
            : item
        )
      );
      if (delta !== 0) applyProductDelta(record.sku, record.productId, -delta, 0, delta);
    }
    cancelMovementEdit();
  }

  function performMovementDelete(kind: "entry" | "exit", id: string) {
    if (kind === "entry") {
      const record = entries.find((item) => item.id === id);
      if (record) {
        setEntries((current) => current.filter((item) => item.id !== record.id));
        applyProductDelta(record.sku, record.productId, -record.quantity, -record.quantity, 0);
      }
    } else {
      const record = exits.find((item) => item.id === id);
      if (record) {
        setExits((current) => current.filter((item) => item.id !== record.id));
        applyProductDelta(record.sku, record.productId, record.quantity, 0, -record.quantity);
      }
    }
  }

  function deleteMovement() {
    if (!movementEdit) return;
    if (!movementDeleteArmed) {
      setMovementDeleteArmed(true);
      return;
    }
    performMovementDelete(movementEdit.kind, movementEdit.id);
    cancelMovementEdit();
  }

  function requestRowDelete(kind: "entry" | "exit", id: string) {
    if (rowDeleteArmed !== id) {
      setRowDeleteArmed(id);
      return;
    }
    setRowDeleteArmed(null);
    performMovementDelete(kind, id);
    if (movementEdit?.id === id) cancelMovementEdit();
  }

  function clearHistoryFilters(kind: "entries" | "exits") {
    if (kind === "entries") {
      setEntryFilters(emptyHistoryFilters());
      setEntryHistoryQuery("");
      setEntrySmartQuery("");
      setEntrySmartStatus("");
    } else {
      setExitFilters(emptyHistoryFilters());
      setHistoryQuery("");
      setExitSmartQuery("");
      setExitSmartStatus("");
    }
  }

  function editProduct(product: Product) {
    setProductForm({
      id: product.id,
      sku: product.sku,
      name: product.name,
      category: product.category,
      brand: product.brand || "",
      motor: product.motor || "",
      crossRef: product.crossRef || "",
      customerRef: product.customerRef || "",
      location: product.location || "",
      initialStock: String(product.initialStock || 0),
      entries: String(product.entries || 0),
      exits: String(product.exits || 0),
      stock: String(product.stock),
      minStock: String(product.minStock),
      unitCost: String(product.unitCost),
      price: String(product.price),
      supplier: product.supplier,
      photo: product.photo
    });
    setView("products");
  }

  function deleteProduct(id: string) {
    setProducts((current) => current.filter((product) => product.id !== id));
  }

  function startExit(product: Product) {
    setExitForm({
      ...emptyExitForm(),
      sku: product.sku,
      quantity: "1",
      reference: ""
    });
    setExitLines([{ id: createId("lin"), sku: product.sku, quantity: 1 }]);
    setExitStatus("");
    setView("exits");
  }

  function addExitLine() {
    const match = matchProductForExit(products, exitForm.sku);
    const product = match.product;
    const quantity = toNumber(exitForm.quantity);

    if (!product) {
      setExitStatus(
        match.count > 1
          ? "Hay varias coincidencias. Escribe la referencia completa para agregar el item."
          : "No encontre una referencia con ese codigo."
      );
      return;
    }

    if (!quantity || quantity <= 0) {
      setExitStatus("La cantidad debe ser mayor que cero.");
      return;
    }

    const stagedQuantity = exitLines
      .filter((line) => normalizeSku(line.sku) === normalizeSku(product.sku))
      .reduce((sum, line) => sum + line.quantity, 0);
    if (stagedQuantity + quantity > product.stock) {
      setExitStatus(`No hay stock suficiente para ${product.sku}. Stock actual: ${product.stock}.`);
      return;
    }

    setExitLines((current) => {
      const cleanSku = normalizeSku(product.sku);
      const existing = current.find((line) => normalizeSku(line.sku) === cleanSku);
      if (existing) {
        return current.map((line) =>
          normalizeSku(line.sku) === cleanSku ? { ...line, quantity: line.quantity + quantity } : line
        );
      }
      return [...current, { id: createId("lin"), sku: product.sku, quantity }];
    });
    setExitForm((current) => ({ ...current, sku: "", quantity: "1" }));
    setExitStatus(`Item agregado: ${product.sku} x ${quantity}.`);
  }

  function repeatHistoryProduct(item: ClientProductHistory) {
    const product = item.product || findProductForSku(products, item.sku);
    if (!product) {
      setExitStatus("Ese producto esta en el historial, pero ya no existe en el inventario actual.");
      return;
    }

    const stagedQuantity = exitLines
      .filter((line) => normalizeSku(line.sku) === normalizeSku(product.sku))
      .reduce((sum, line) => sum + line.quantity, 0);

    if (stagedQuantity + 1 > product.stock) {
      setExitStatus(`No hay stock suficiente para ${product.sku}. Stock actual: ${product.stock}.`);
      return;
    }

    setExitForm((current) => ({
      ...current,
      client: current.client.trim() || item.client,
      sku: product.sku,
      quantity: "1"
    }));
    setExitLines((current) => {
      const cleanSku = normalizeSku(product.sku);
      const existing = current.find((line) => normalizeSku(line.sku) === cleanSku);
      if (existing) {
        return current.map((line) =>
          normalizeSku(line.sku) === cleanSku ? { ...line, quantity: line.quantity + 1 } : line
        );
      }
      return [...current, { id: createId("lin"), sku: product.sku, quantity: 1 }];
    });
    setExitStatus(`Agregado desde historial: ${product.sku} x 1 para ${item.client}.`);
  }

  function handleExitItemKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addExitLine();
  }

  function removeExitLine(id: string) {
    setExitLines((current) => current.filter((line) => line.id !== id));
  }

  function registerExit(event: FormEvent) {
    event.preventDefault();
    const draftLines =
      exitLines.length > 0
        ? exitLines
        : exitForm.sku.trim()
          ? [{ id: createId("lin"), sku: exitForm.sku, quantity: toNumber(exitForm.quantity) }]
          : [];

    if (!exitForm.client.trim()) {
      setExitStatus("Escribe el cliente para registrar la salida.");
      return;
    }

    if (!draftLines.length) {
      setExitStatus("Agrega al menos un item a la salida.");
      return;
    }

    const preparedLines = draftLines.map((line) => ({
      ...line,
      quantity: toNumber(line.quantity),
      product: findProductForSku(products, line.sku)
    }));
    const missingLine = preparedLines.find((line) => !line.product);
    if (missingLine) {
      setExitStatus(`No encontre la referencia ${missingLine.sku}.`);
      return;
    }

    const invalidLine = preparedLines.find((line) => !line.quantity || line.quantity <= 0);
    if (invalidLine) {
      setExitStatus("Todas las cantidades deben ser mayores que cero.");
      return;
    }

    const validLines = preparedLines.filter(
      (line): line is (typeof preparedLines)[number] & { product: Product } => Boolean(line.product)
    );
    const totals = new Map<string, { product: Product; quantity: number }>();
    for (const line of validLines) {
      const current = totals.get(line.product.id) || { product: line.product, quantity: 0 };
      current.quantity += line.quantity;
      totals.set(line.product.id, current);
    }

    const outOfStock = Array.from(totals.values()).find((line) => line.quantity > line.product.stock);
    if (outOfStock) {
      setExitStatus(
        `No hay stock suficiente para ${outOfStock.product.sku}. Stock actual: ${outOfStock.product.stock}.`
      );
      return;
    }

    const now = new Date().toISOString();
    const batchId = createId("salida");
    const date = exitForm.date || now.slice(0, 10);
    const reference = exitForm.reference.trim() || `Salida ${date}`;
    const records: ProductExit[] = validLines.map((line) => ({
      id: createId("sal"),
      batchId,
      date,
      sku: line.product.sku,
      productId: line.product.id,
      productName: line.product.name,
      brand: line.product.brand,
      location: line.product.location,
      quantity: line.quantity,
      client: exitForm.client.trim(),
      reference,
      notes: exitForm.notes.trim(),
      createdAt: now
    }));

    setProducts((current) =>
      current.map((item) => {
        const outgoing = totals.get(item.id)?.quantity || 0;
        return outgoing
          ? {
              ...item,
              stock: Math.max(0, item.stock - outgoing),
              exits: (item.exits || 0) + outgoing,
              updatedAt: now
            }
          : item;
      })
    );
    setExits((current) => [...records, ...current]);
    setPrintableExit(records);
    setExitForm(emptyExitForm());
    setExitLines([]);
    setExitStatus(`Salida registrada con ${records.length} item${records.length === 1 ? "" : "s"}. PDF listo para imprimir.`);
  }

  function printExitReceipt(records = printableExit) {
    if (!records.length) {
      setExitStatus("Primero registra una salida para imprimir el PDF.");
      return;
    }
    setPrintableExit(records);
    setPrintView("exit");
    window.setTimeout(() => window.print(), 80);
  }

  function startEntry(product: Product) {
    setEntryForm({
      ...emptyEntryForm(),
      sku: product.sku,
      quantity: "1",
      supplier: product.supplier || "",
      reference: ""
    });
    setEntryLines([{ id: createId("lin"), sku: product.sku, quantity: 1 }]);
    setEntryStatus("");
    setView("entries");
  }

  function addEntryLine() {
    const match = matchProductForExit(products, entryForm.sku);
    const product = match.product;
    const quantity = toNumber(entryForm.quantity);

    if (!product) {
      setEntryStatus(
        match.count > 1
          ? "Hay varias coincidencias. Escribe la referencia completa para agregar el item."
          : "No encontre una referencia con ese codigo."
      );
      return;
    }

    if (!quantity || quantity <= 0) {
      setEntryStatus("La cantidad debe ser mayor que cero.");
      return;
    }

    setEntryLines((current) => {
      const cleanSku = normalizeSku(product.sku);
      const existing = current.find((line) => normalizeSku(line.sku) === cleanSku);
      if (existing) {
        return current.map((line) =>
          normalizeSku(line.sku) === cleanSku ? { ...line, quantity: line.quantity + quantity } : line
        );
      }
      return [...current, { id: createId("lin"), sku: product.sku, quantity }];
    });
    setEntryForm((current) => ({ ...current, sku: "", quantity: "1" }));
    setEntryStatus(`Item agregado: ${product.sku} x ${quantity}.`);
  }

  function handleEntryItemKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addEntryLine();
  }

  function removeEntryLine(id: string) {
    setEntryLines((current) => current.filter((line) => line.id !== id));
  }

  function registerEntry(event: FormEvent) {
    event.preventDefault();
    const draftLines =
      entryLines.length > 0
        ? entryLines
        : entryForm.sku.trim()
          ? [{ id: createId("lin"), sku: entryForm.sku, quantity: toNumber(entryForm.quantity) }]
          : [];

    if (!entryForm.supplier.trim()) {
      setEntryStatus("Escribe el proveedor para registrar la entrada.");
      return;
    }

    if (!draftLines.length) {
      setEntryStatus("Agrega al menos un item a la entrada.");
      return;
    }

    const preparedLines = draftLines.map((line) => ({
      ...line,
      quantity: toNumber(line.quantity),
      product: findProductForSku(products, line.sku)
    }));
    const missingLine = preparedLines.find((line) => !line.product);
    if (missingLine) {
      setEntryStatus(`No encontre la referencia ${missingLine.sku}.`);
      return;
    }

    const invalidLine = preparedLines.find((line) => !line.quantity || line.quantity <= 0);
    if (invalidLine) {
      setEntryStatus("Todas las cantidades deben ser mayores que cero.");
      return;
    }

    const validLines = preparedLines.filter(
      (line): line is (typeof preparedLines)[number] & { product: Product } => Boolean(line.product)
    );
    const totals = new Map<string, { product: Product; quantity: number }>();
    for (const line of validLines) {
      const current = totals.get(line.product.id) || { product: line.product, quantity: 0 };
      current.quantity += line.quantity;
      totals.set(line.product.id, current);
    }

    const now = new Date().toISOString();
    const batchId = createId("entrada");
    const date = entryForm.date || now.slice(0, 10);
    const reference = entryForm.reference.trim() || `Entrada ${date}`;
    const records: ProductEntry[] = validLines.map((line) => ({
      id: createId("ent"),
      batchId,
      date,
      sku: line.product.sku,
      productId: line.product.id,
      productName: line.product.name,
      brand: line.product.brand,
      location: line.product.location,
      quantity: line.quantity,
      supplier: entryForm.supplier.trim(),
      reference,
      unitCost: line.product.unitCost,
      notes: entryForm.notes.trim(),
      createdAt: now
    }));

    setProducts((current) =>
      current.map((item) => {
        const incoming = totals.get(item.id)?.quantity || 0;
        return incoming
          ? {
              ...item,
              stock: item.stock + incoming,
              entries: (item.entries || 0) + incoming,
              supplier: entryForm.supplier.trim() || item.supplier,
              updatedAt: now
            }
          : item;
      })
    );
    setEntries((current) => [...records, ...current]);
    setPrintableEntry(records);
    setEntryForm(emptyEntryForm());
    setEntryLines([]);
    setEntryStatus(`Entrada registrada con ${records.length} item${records.length === 1 ? "" : "s"}. PDF listo para imprimir.`);
  }

  function printEntryReceipt(records = printableEntry) {
    if (!records.length) {
      setEntryStatus("Primero registra una entrada para imprimir el PDF.");
      return;
    }
    setPrintableEntry(records);
    setPrintView("entry");
    window.setTimeout(() => window.print(), 80);
  }

  function printNoStockReport() {
    if (!stats.lowStock.length) {
      setImportStatus("No hay productos sin stock para imprimir.");
      return;
    }
    setPrintView("no-stock");
    window.setTimeout(() => window.print(), 80);
  }

  function selectReturnExit(exit: ProductExit) {
    const remaining = remainingReturnQuantity(productReturns, exit);
    setReturnForm((current) => ({
      ...current,
      search: `${exit.reference} - ${exit.client}`,
      originalExitId: exit.id,
      returnedQuantity: String(Math.max(1, Math.min(exit.quantity, remaining)))
    }));
    setReturnStatus("");
  }

  function registerReturnCase(event: FormEvent) {
    event.preventDefault();

    if (!selectedReturnExit) {
      setReturnStatus("Selecciona la salida original.");
      return;
    }

    const returnedQuantity = toNumber(returnForm.returnedQuantity);
    if (!returnedQuantity || returnedQuantity <= 0) {
      setReturnStatus("La cantidad devuelta debe ser mayor que cero.");
      return;
    }

    if (returnedQuantity > selectedReturnRemaining) {
      setReturnStatus(`Solo quedan ${selectedReturnRemaining} unidades disponibles para devolver de esa salida.`);
      return;
    }

    const returnedProduct = findProductForSku(products, selectedReturnExit.sku);
    if (!returnedProduct) {
      setReturnStatus("No encontre el producto devuelto en el inventario.");
      return;
    }

    const needsReplacement = returnForm.type === "cambio";
    const replacementQuantity = needsReplacement ? toNumber(returnForm.replacementQuantity) : 0;
    const replacementMatch = needsReplacement ? matchProductForExit(products, returnForm.replacementSku) : null;
    const replacementProduct = replacementMatch?.product;

    if (needsReplacement && !replacementProduct) {
      setReturnStatus(
        replacementMatch && replacementMatch.count > 1
          ? "Hay varias coincidencias para el repuesto de cambio. Escribe la referencia completa."
          : "Escribe la referencia del repuesto que se entrega en el cambio."
      );
      return;
    }

    if (needsReplacement && (!replacementQuantity || replacementQuantity <= 0)) {
      setReturnStatus("La cantidad del repuesto de cambio debe ser mayor que cero.");
      return;
    }

    const availableReplacementStock =
      replacementProduct?.id === returnedProduct.id && returnForm.condition === "bueno"
        ? replacementProduct.stock + returnedQuantity
        : replacementProduct?.stock || 0;

    if (replacementProduct && replacementQuantity > availableReplacementStock) {
      setReturnStatus(
        `No hay stock suficiente para entregar ${replacementProduct.sku}. Stock actual: ${availableReplacementStock}.`
      );
      return;
    }

    const now = new Date().toISOString();
    const date = returnForm.date || now.slice(0, 10);
    const caseId = createId("caso");
    const restocked = returnForm.condition === "bueno";
    const replacementExitId = replacementProduct ? createId("sal") : undefined;
    const replacementExit: ProductExit | null =
      replacementProduct && replacementExitId
        ? {
            id: replacementExitId,
            batchId: caseId,
            date,
            sku: replacementProduct.sku,
            productId: replacementProduct.id,
            productName: replacementProduct.name,
            brand: replacementProduct.brand,
            location: replacementProduct.location,
            quantity: replacementQuantity,
            client: selectedReturnExit.client,
            reference: `Cambio ${selectedReturnExit.reference}`,
            notes: returnForm.notes.trim(),
            createdAt: now
          }
        : null;

    const record: ProductReturn = {
      id: caseId,
      date,
      type: returnForm.type,
      originalExitId: selectedReturnExit.id,
      originalExitReference: selectedReturnExit.reference,
      client: selectedReturnExit.client,
      returnedSku: selectedReturnExit.sku,
      returnedProductName: selectedReturnExit.productName,
      returnedQuantity,
      condition: returnForm.condition,
      restocked,
      replacementSku: replacementProduct?.sku,
      replacementProductName: replacementProduct?.name,
      replacementQuantity: replacementProduct ? replacementQuantity : undefined,
      replacementExitId,
      reason: returnForm.reason.trim() || "Sin motivo especifico",
      notes: returnForm.notes.trim(),
      createdAt: now
    };

    const updates = new Map<string, { stockDelta: number; entriesDelta: number; exitsDelta: number }>();
    if (restocked) {
      updates.set(returnedProduct.id, {
        stockDelta: returnedQuantity,
        entriesDelta: returnedQuantity,
        exitsDelta: 0
      });
    }
    if (replacementProduct) {
      const current = updates.get(replacementProduct.id) || { stockDelta: 0, entriesDelta: 0, exitsDelta: 0 };
      current.stockDelta -= replacementQuantity;
      current.exitsDelta += replacementQuantity;
      updates.set(replacementProduct.id, current);
    }

    setProducts((current) =>
      current.map((product) => {
        const update = updates.get(product.id);
        if (!update) return product;
        return {
          ...product,
          stock: Math.max(0, product.stock + update.stockDelta),
          entries: (product.entries || 0) + update.entriesDelta,
          exits: (product.exits || 0) + update.exitsDelta,
          updatedAt: now
        };
      })
    );
    if (replacementExit) {
      setExits((current) => [replacementExit, ...current]);
    }
    setProductReturns((current) => [record, ...current]);
    setPrintableReturn(record);
    setReturnForm(emptyReturnForm());
    setReturnStatus("Caso registrado. Acta lista para imprimir.");
  }

  function printReturnAct(record = printableReturn) {
    if (!record) {
      setReturnStatus("Primero registra un cambio o devolucion para imprimir el acta.");
      return;
    }
    setPrintableReturn(record);
    setPrintView("return");
    window.setTimeout(() => window.print(), 80);
  }

  async function handleProductPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const photo = await fileToDataUrl(file);
    setProductForm((current) => ({ ...current, photo }));
  }

  async function extractInvoice() {
    if (!invoiceFile) {
      setInvoiceStatus("Selecciona una factura primero.");
      return;
    }

    setExtracting(true);
    setInvoiceStatus("Procesando factura...");
    const form = new FormData();
    form.append("invoice", invoiceFile);

    try {
      const response = await fetch("/api/invoices/extract", {
        method: "POST",
        body: form
      });
      const payload = await response.json();
      if (!response.ok) {
        setInvoiceStatus(formatInvoiceError(payload.error));
        return;
      }
      setInvoiceDraft(payload as InvoiceExtraction);
      setInvoiceStatus("Factura lista para revisar.");
    } catch {
      setInvoiceStatus("No se pudo conectar con el servidor local.");
    } finally {
      setExtracting(false);
    }
  }

  function buildManualInvoice() {
    const items = manualLines
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map(parseManualLine)
      .filter((item): item is InvoiceItem => Boolean(item));

    if (!items.length) {
      setInvoiceStatus("No encontre productos en la carga manual.");
      return;
    }

    setInvoiceDraft({
      supplier: "Carga manual",
      invoiceNumber: null,
      invoiceDate: new Date().toISOString().slice(0, 10),
      currency: "COP",
      subtotal: items.reduce((sum, item) => sum + (item.lineTotal || 0), 0),
      tax: null,
      total: items.reduce((sum, item) => sum + (item.lineTotal || 0), 0),
      confidence: 1,
      items
    });
    setInvoiceStatus("Carga manual lista para aplicar.");
  }

  function updateDraftItem(index: number, patch: Partial<InvoiceItem>) {
    setInvoiceDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.map((item, itemIndex) =>
          itemIndex === index ? { ...item, ...patch } : item
        )
      };
    });
  }

  function applyInvoice() {
    if (!invoiceDraft || !invoiceDraft.items.length) return;
    const now = new Date().toISOString();
    const record: InvoiceRecord = {
      ...invoiceDraft,
      id: createId("inv"),
      fileName: invoiceFile?.name || "Carga manual",
      status: "aplicada",
      createdAt: now
    };

    setProducts((current) => applyItemsToInventory(current, invoiceDraft, record.id));
    setInvoices((current) => [record, ...current]);
    setInvoiceDraft(null);
    setInvoiceFile(null);
    setManualLines("");
    setInvoiceStatus("Inventario actualizado.");
    setView("dashboard");
  }

  function parseCsvText(csvText: string) {
    const parsed = Papa.parse<Record<string, unknown>>(csvText, {
      header: true,
      skipEmptyLines: true
    });
    const rows = parsed.data.map(normalizeImportRow).filter((row): row is ImportRow => Boolean(row));
    setImportRows(rows);
    setImportStatus(`${rows.length} productos listos para importar.`);
  }

  async function loadSheet() {
    if (!sheetUrl.trim()) return;
    setImportStatus("Leyendo Google Sheets...");
    try {
      const response = await fetch(`/api/sheet?url=${encodeURIComponent(sheetUrl.trim())}`);
      if (!response.ok) {
        setImportStatus("No pude leer el enlace. Revisa que la hoja sea publica o exportable.");
        return;
      }
      parseCsvText(await response.text());
    } catch {
      setImportStatus("No se pudo conectar con la hoja.");
    }
  }

  async function loadCurrentInventoryFile() {
    setImportStatus("Leyendo copia inventario.xlsx...");
    try {
      const response = await fetch("/api/inventory/current");
      const payload = await response.json();
      if (!response.ok) {
        setImportStatus("No encontre el archivo en Descargas.");
        return;
      }
      const rows = payload.records
        .map(normalizeImportRow)
        .filter((row: ImportRow | null): row is ImportRow => Boolean(row));
      setImportRows(rows);
      setImportStatus(`${rows.length} referencias listas desde copia inventario.xlsx.`);
    } catch {
      setImportStatus("No se pudo leer el inventario actual.");
    }
  }

  async function handleInventoryFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.name.toLowerCase().endsWith(".xlsx")) {
      setImportStatus("Leyendo Excel...");
      const form = new FormData();
      form.append("inventory", file);
      try {
        const response = await fetch("/api/inventory/parse", {
          method: "POST",
          body: form
        });
        const payload = await response.json();
        if (!response.ok) {
          setImportStatus("No pude leer ese Excel.");
          return;
        }
        const rows = payload.records
          .map(normalizeImportRow)
          .filter((row: ImportRow | null): row is ImportRow => Boolean(row));
        setImportRows(rows);
        setImportStatus(`${rows.length} referencias listas para importar.`);
      } catch {
        setImportStatus("No se pudo conectar con el lector de Excel.");
      }
      return;
    }

    parseCsvText(await file.text());
  }

  function applyImport() {
    if (!importRows.length) return;
    const importedProducts = importRows.map(importRowToProduct);
    setProducts((current) => mergeProducts(current, importedProducts));
    setImportStatus(`${importRows.length} referencias importadas.`);
    setImportRows([]);
    setView("products");
  }

  function exportBackup() {
    const backup = {
      exportedAt: new Date().toISOString(),
      products,
      invoices,
      exits,
      productReturns
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `inventario-ia-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const movementEditor = movementEdit && (
    <div className="movement-editor">
      {!adminUnlocked ? (
        <form onSubmit={unlockAdmin}>
          <div className="panel-title">
            <Lock size={16} />
            <h2>Clave de administrador</h2>
          </div>
          <label>
            Clave para editar movimientos
            <input
              autoFocus
              onChange={(event) => setAdminKeyInput(event.target.value)}
              placeholder="Clave de administrador"
              type="password"
              value={adminKeyInput}
            />
          </label>
          {adminKeyError && <p className="status-line">{adminKeyError}</p>}
          <div className="button-row">
            <button className="primary-button" type="submit">
              Desbloquear
            </button>
            <button className="secondary-button" onClick={cancelMovementEdit} type="button">
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={saveMovementEdit}>
          <div className="panel-title">
            <Pencil size={16} />
            <h2>Editar {movementEdit.kind === "entry" ? "entrada" : "salida"}</h2>
          </div>
          <div className="form-row">
            <label>
              Fecha
              <input
                onChange={(event) => setMovementEditForm({ ...movementEditForm, date: event.target.value })}
                type="date"
                value={movementEditForm.date}
              />
            </label>
            <label>
              {movementEdit.kind === "entry" ? "Proveedor" : "Cliente"}
              <input
                onChange={(event) => setMovementEditForm({ ...movementEditForm, party: event.target.value })}
                value={movementEditForm.party}
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Referencia
              <input
                onChange={(event) => setMovementEditForm({ ...movementEditForm, reference: event.target.value })}
                value={movementEditForm.reference}
              />
            </label>
            <label>
              Cantidad
              <input
                min="1"
                onChange={(event) => setMovementEditForm({ ...movementEditForm, quantity: event.target.value })}
                type="number"
                value={movementEditForm.quantity}
              />
            </label>
          </div>
          <div className="button-row">
            <button className="primary-button" type="submit">
              Guardar cambios
            </button>
            <button className="secondary-button danger" onClick={deleteMovement} type="button">
              <Trash2 size={15} />
              {movementDeleteArmed ? "Confirmar eliminacion" : "Eliminar"}
            </button>
            <button className="secondary-button" onClick={cancelMovementEdit} type="button">
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );

  return (
    <>
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <img src="/assets/yota-logo-sm.png" alt="YOTA Montacargas" />
          </div>
          <div>
            <strong>YOTA Inventario</strong>
            <span>Repuestos, ubicacion y stock</span>
          </div>
        </div>

        <nav className="nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={view === item.id ? "nav-button active" : "nav-button"}
                onClick={() => setView(item.id)}
                type="button"
                title={item.label}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="sidebar-actions">
          <button className="ghost-button" onClick={loadDemo} type="button">
            <Sparkles size={16} />
            Demo
          </button>
          <button className="ghost-button" onClick={exportBackup} type="button">
            <FileDown size={16} />
            Backup
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p>{new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })}</p>
            <h1>{titleForView(view)}</h1>
            <span className="brand-slogan">Movemos tu carga, impulsamos tu operacion.</span>
            <span className="cloud-status">{cloudStatus}</span>
          </div>
          <div className="topbar-actions">
            <button
              className={adminUnlocked ? "secondary-button active-toggle" : "secondary-button"}
              onClick={toggleAdminMode}
              type="button"
            >
              <Lock size={17} />
              {adminUnlocked ? "Admin activo" : "Superadmin"}
            </button>
            <button className="secondary-button" onClick={exportInventoryExcel} type="button">
              <FileSpreadsheet size={17} />
              Exportar
            </button>
            <button className="secondary-button" onClick={() => setView("invoices")} type="button">
              <Camera size={17} />
              Factura
            </button>
            <button className="secondary-button" onClick={() => setView("exits")} type="button">
              <ClipboardList size={17} />
              Salida
            </button>
            <button className="secondary-button" onClick={() => setView("returns")} type="button">
              <RotateCcw size={17} />
              Cambio
            </button>
            <button className="primary-button" onClick={() => setView("products")} type="button">
              <PackagePlus size={17} />
              Repuesto
            </button>
          </div>
        </header>

        {adminPromptOpen && !adminUnlocked && (
          <div className="movement-editor admin-prompt">
            <form onSubmit={unlockAdmin}>
              <div className="panel-title">
                <Lock size={16} />
                <h2>Modo superadministrador</h2>
              </div>
              <label>
                Clave de administrador
                <input
                  autoFocus
                  onChange={(event) => setAdminKeyInput(event.target.value)}
                  placeholder="Clave de administrador"
                  type="password"
                  value={adminKeyInput}
                />
              </label>
              {adminKeyError && <p className="status-line">{adminKeyError}</p>}
              <div className="button-row">
                <button className="primary-button" type="submit">
                  Activar
                </button>
                <button className="secondary-button" onClick={() => setAdminPromptOpen(false)} type="button">
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        {view === "dashboard" && (
          <Dashboard
            products={products}
            entries={entries}
            exits={exits}
            stats={stats}
            onEditProduct={editProduct}
            onOpenEntries={() => setView("entries")}
            onOpenExits={() => setView("exits")}
            onPrintNoStock={printNoStockReport}
          />
        )}

        {view === "products" && (
          <section className="content-grid two-columns">
            <form className="tool-panel product-form" onSubmit={submitProduct}>
              <div className="panel-title">
                <PackagePlus size={18} />
                <h2>{productForm.id ? "Editar producto" : "Nuevo producto"}</h2>
              </div>
              <div className="photo-picker">
                {productForm.photo ? (
                  <img src={productForm.photo} alt={productForm.name || "Producto"} />
                ) : (
                  <ImagePlus size={30} />
                )}
                <label className="icon-button" title="Agregar foto">
                  <Camera size={17} />
                  <input accept="image/*" onChange={handleProductPhoto} type="file" />
                </label>
              </div>
              <label>
                Descripcion
                <input
                  value={productForm.name}
                  onChange={(event) => setProductForm({ ...productForm, name: event.target.value })}
                  placeholder="Descripcion del repuesto"
                />
              </label>
              <div className="form-row">
                <label>
                  Ref
                  <input
                    value={productForm.sku}
                    onChange={(event) => setProductForm({ ...productForm, sku: event.target.value })}
                    placeholder="129900-11100"
                  />
                </label>
                <label>
                  Marca
                  <input
                    value={productForm.brand}
                    onChange={(event) => setProductForm({ ...productForm, brand: event.target.value })}
                    placeholder="Toyota, Yanmar, Hyster"
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Motor
                  <input
                    value={productForm.motor}
                    onChange={(event) => setProductForm({ ...productForm, motor: event.target.value })}
                    placeholder="4Y, 1DZ, K21"
                  />
                </label>
                <label>
                  Ubicacion
                  <input
                    value={productForm.location}
                    onChange={(event) => setProductForm({ ...productForm, location: event.target.value })}
                    placeholder="A1-1"
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Cruce
                  <input
                    value={productForm.crossRef}
                    onChange={(event) => setProductForm({ ...productForm, crossRef: event.target.value })}
                    placeholder="Referencia equivalente"
                  />
                </label>
                <label>
                  Ref. cliente
                  <input
                    value={productForm.customerRef}
                    onChange={(event) => setProductForm({ ...productForm, customerRef: event.target.value })}
                    placeholder="Codigo cliente"
                  />
                </label>
              </div>
              <div className="form-row three">
                <label>
                  Stock inicial
                  <input
                    min="0"
                    type="number"
                    value={productForm.initialStock}
                    onChange={(event) => setProductForm({ ...productForm, initialStock: event.target.value })}
                  />
                </label>
                <label>
                  Entradas
                  <input
                    min="0"
                    type="number"
                    value={productForm.entries}
                    onChange={(event) => setProductForm({ ...productForm, entries: event.target.value })}
                  />
                </label>
                <label>
                  Salidas
                  <input
                    min="0"
                    type="number"
                    value={productForm.exits}
                    onChange={(event) => setProductForm({ ...productForm, exits: event.target.value })}
                  />
                </label>
              </div>
              <label>
                Stock actual
                <input
                  min="0"
                  type="number"
                  value={productForm.stock}
                  onChange={(event) => setProductForm({ ...productForm, stock: event.target.value })}
                />
              </label>
              <div className="button-row">
                <button className="primary-button" type="submit">
                  <Check size={17} />
                  Guardar
                </button>
                {productForm.id && (
                  <button className="secondary-button" onClick={() => setProductForm(emptyForm)} type="button">
                    <X size={17} />
                    Cancelar
                  </button>
                )}
              </div>
            </form>

            <section className="product-section">
              <div className="searchbar">
                <Search size={18} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar por ref, descripcion, marca, motor o ubicacion"
                />
              </div>
              <div className="product-list">
                {pagedProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onDelete={deleteProduct}
                    onEdit={editProduct}
                    onEntry={startEntry}
                    onExit={startExit}
                  />
                ))}
                {!filteredProducts.length && <EmptyState label="Sin productos en esta vista." />}
              </div>
              <Paginator
                page={productPage}
                total={filteredProducts.length}
                pageSize={PRODUCT_PAGE_SIZE}
                onPage={setProductPage}
              />
            </section>
          </section>
        )}

        {view === "entries" && (
          <section className="content-grid two-columns">
            <form className="tool-panel product-form" onSubmit={registerEntry}>
              <div className="panel-title">
                <Download size={18} />
                <h2>Entrada de proveedor</h2>
              </div>
              <div className="form-row">
                <label>
                  Fecha
                  <input
                    type="date"
                    value={entryForm.date}
                    onChange={(event) => setEntryForm({ ...entryForm, date: event.target.value })}
                  />
                </label>
                <label>
                  Proveedor
                  <input
                    list="supplier-name-list"
                    value={entryForm.supplier}
                    onChange={(event) => setEntryForm({ ...entryForm, supplier: event.target.value })}
                    placeholder="Nombre del proveedor"
                  />
                </label>
              </div>
              <datalist id="supplier-name-list">
                {knownSuppliers.map((supplier) => (
                  <option key={supplier} value={supplier} />
                ))}
              </datalist>
              <label>
                Referencia de entrada
                <input
                  value={entryForm.reference}
                  onChange={(event) => setEntryForm({ ...entryForm, reference: event.target.value })}
                  placeholder="Factura, remision, orden de compra o referencia"
                />
              </label>
              <label>
                Nota
                <textarea
                  value={entryForm.notes}
                  onChange={(event) => setEntryForm({ ...entryForm, notes: event.target.value })}
                  placeholder="Detalle opcional"
                />
              </label>

              <div className="line-builder">
                <div className="panel-title compact">
                  <PackagePlus size={17} />
                  <h3>Agregar item</h3>
                </div>
                <div className="form-row">
                  <label>
                    Referencia
                    <input
                      list="product-ref-list-entry"
                      value={entryForm.sku}
                      onChange={(event) => setEntryForm({ ...entryForm, sku: event.target.value })}
                      onKeyDown={handleEntryItemKeyDown}
                      placeholder="Buscar o escribir referencia"
                    />
                  </label>
                  <label>
                    Cantidad
                    <input
                      min="1"
                      type="number"
                      value={entryForm.quantity}
                      onChange={(event) => setEntryForm({ ...entryForm, quantity: event.target.value })}
                      onKeyDown={handleEntryItemKeyDown}
                    />
                  </label>
                </div>
                <datalist id="product-ref-list-entry">
                  {products.map((product) => (
                    <option key={product.id} value={product.sku}>
                      {product.name}
                    </option>
                  ))}
                </datalist>
                {selectedEntryProduct ? (
                  <div className="selected-product">
                    <strong>{selectedEntryProduct.name}</strong>
                    <span>Marca: {selectedEntryProduct.brand || "-"}</span>
                    <span>Ubicacion: {selectedEntryProduct.location || "-"}</span>
                    <span>Stock actual: {selectedEntryProduct.stock}</span>
                  </div>
                ) : (
                  <div className="selected-product muted">
                    Escribe una referencia existente para sumar unidades a su stock.
                  </div>
                )}
                <button className="secondary-button full" onClick={addEntryLine} type="button">
                  <Plus size={17} />
                  Agregar item a la entrada
                </button>
              </div>

              {entryStatus && <p className="status-line">{entryStatus}</p>}

              <div className="exit-lines">
                <div className="exit-lines-header">
                  <span>
                    {resolvedEntryLines.length
                      ? `${resolvedEntryLines.length} item${resolvedEntryLines.length === 1 ? "" : "s"} listos`
                      : "Sin items agregados"}
                  </span>
                  <strong>Total: {stagedEntryQuantity}</strong>
                </div>
                {resolvedEntryLines.length ? (
                  <div className="exit-line-list">
                    {resolvedEntryLines.map((line) => (
                      <div className={line.product ? "exit-line" : "exit-line missing"} key={line.id}>
                        <div className="exit-line-main">
                          <strong>{line.product?.name || "Referencia no encontrada"}</strong>
                          <span>
                            {line.product?.sku || line.sku}
                            {line.product?.location ? ` - ${line.product.location}` : ""}
                          </span>
                        </div>
                        <div className="exit-line-stock">
                          <span>Stock</span>
                          <strong>{line.product?.stock ?? "-"}</strong>
                        </div>
                        <div className="exit-line-quantity">
                          <span>Cant.</span>
                          <strong>{line.quantity}</strong>
                        </div>
                        <button
                          className="icon-button danger"
                          onClick={() => removeEntryLine(line.id)}
                          title="Quitar item"
                          type="button"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState label="Agrega cada producto que llega del proveedor." />
                )}
              </div>

              <button className="primary-button full" type="submit">
                <Check size={17} />
                Registrar entrada completa
              </button>
              {printableEntry.length > 0 && (
                <div className="receipt-ready">
                  <div>
                    <strong>Comprobante listo</strong>
                    <span>
                      {printableEntry[0]?.reference} - {printableEntry[0]?.supplier}
                    </span>
                  </div>
                  <button className="secondary-button" onClick={() => printEntryReceipt()} type="button">
                    <Printer size={17} />
                    Imprimir PDF
                  </button>
                </div>
              )}
            </form>

            <section className="review-panel">
              <div className="panel-title">
                <FileText size={18} />
                <h2>Historial de entradas</h2>
              </div>
              <div className="searchbar">
                <Search size={18} />
                <input
                  list="supplier-name-list"
                  value={entryHistoryQuery}
                  onChange={(event) => setEntryHistoryQuery(event.target.value)}
                  placeholder="Buscar proveedor, producto, ref o entrada"
                />
              </div>
              <div className="form-row three">
                <label>
                  Desde
                  <input
                    type="date"
                    value={entryFilters.from}
                    onChange={(event) => setEntryFilters({ ...entryFilters, from: event.target.value })}
                  />
                </label>
                <label>
                  Hasta
                  <input
                    type="date"
                    value={entryFilters.to}
                    onChange={(event) => setEntryFilters({ ...entryFilters, to: event.target.value })}
                  />
                </label>
                <label>
                  Proveedor
                  <select
                    value={entryFilters.party}
                    onChange={(event) => setEntryFilters({ ...entryFilters, party: event.target.value })}
                  >
                    <option value="">Todos</option>
                    {knownSuppliers.map((supplier) => (
                      <option key={supplier} value={supplier}>
                        {supplier}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="searchbar">
                <Sparkles size={18} />
                <input
                  value={entrySmartQuery}
                  onChange={(event) => setEntrySmartQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      runSmartHistorySearch("entries");
                    }
                  }}
                  placeholder='Buscar con IA: "entradas de MAGGIE en julio"'
                />
                <button
                  className="secondary-button tiny"
                  disabled={smartSearching}
                  onClick={() => runSmartHistorySearch("entries")}
                  type="button"
                >
                  {smartSearching ? "..." : "IA"}
                </button>
              </div>
              {entrySmartStatus && <p className="status-line">{entrySmartStatus}</p>}
              <div className="exit-lines-header">
                <span>
                  {filteredEntriesAll.length} movimiento{filteredEntriesAll.length === 1 ? "" : "s"}
                  {hasActiveHistoryFilters(entryFilters) || entryHistoryQuery.trim() ? " (filtrado)" : ""}
                </span>
                <strong>{entryHistoryUnits} unidades</strong>
              </div>
              {(hasActiveHistoryFilters(entryFilters) || entryHistoryQuery.trim() || entrySmartQuery.trim()) && (
                <button className="ghost-button" onClick={() => clearHistoryFilters("entries")} type="button">
                  <X size={15} />
                  Limpiar filtros
                </button>
              )}
              <div className="button-row">
                <button
                  className={entryGrouped ? "secondary-button tiny active-toggle" : "secondary-button tiny"}
                  onClick={() => setEntryGrouped(true)}
                  type="button"
                >
                  Por proveedor
                </button>
                <button
                  className={entryGrouped ? "secondary-button tiny" : "secondary-button tiny active-toggle"}
                  onClick={() => setEntryGrouped(false)}
                  type="button"
                >
                  Detallado
                </button>
              </div>
              {movementEdit?.kind === "entry" && movementEditor}

              {entries.length ? (
                entryGrouped ? (
                  entryGroups.length ? (
                    <div className="movement-groups">
                      {pagedEntryGroups.map((group) => (
                        <details className="movement-group" key={group.key}>
                          <summary>
                            <div className="movement-group-main">
                              <strong>{group.party || "Sin proveedor"}</strong>
                              <span>
                                {group.date} · {group.reference}
                              </span>
                            </div>
                            <div className="movement-group-numbers">
                              <span>
                                {group.items.length} item{group.items.length === 1 ? "" : "s"}
                              </span>
                              <strong>{group.units} und</strong>
                            </div>
                          </summary>
                          <div className="table-wrap">
                            <table>
                              <thead>
                                <tr>
                                  <th>Ref</th>
                                  <th>Producto</th>
                                  <th>Cant.</th>
                                  {adminUnlocked && <th></th>}
                                </tr>
                              </thead>
                              <tbody>
                                {group.items.map((entry) => (
                                  <tr key={entry.id}>
                                    <td>{entry.sku}</td>
                                    <td>{entry.productName}</td>
                                    <td>{entry.quantity}</td>
                                    {adminUnlocked && (
                                      <td className="one-line">
                                        <button
                                          className="icon-button"
                                          onClick={() => startMovementEdit("entry", entry, entry.supplier)}
                                          title="Editar"
                                          type="button"
                                        >
                                          <Pencil size={14} />
                                        </button>
                                        <button
                                          className={rowDeleteArmed === entry.id ? "icon-button danger-armed" : "icon-button"}
                                          onClick={() => requestRowDelete("entry", entry.id)}
                                          title={rowDeleteArmed === entry.id ? "Confirmar eliminacion" : "Eliminar"}
                                          type="button"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      ))}
                      <Paginator
                        page={entryPage}
                        total={entryGroups.length}
                        pageSize={GROUP_PAGE_SIZE}
                        onPage={setEntryPage}
                      />
                    </div>
                  ) : (
                    <EmptyState label="No hay entradas que coincidan con esa busqueda." />
                  )
                ) : filteredHistoryEntries.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Entrada</th>
                          <th>Ref</th>
                          <th>Producto</th>
                          <th>Proveedor</th>
                          <th>Cant.</th>
                          {adminUnlocked && <th></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredHistoryEntries.map((entry) => (
                          <tr key={entry.id}>
                            <td>{entry.date}</td>
                            <td>{entry.reference}</td>
                            <td>{entry.sku}</td>
                            <td>{entry.productName}</td>
                            <td>{entry.supplier}</td>
                            <td>{entry.quantity}</td>
                            {adminUnlocked && (
                              <td className="one-line">
                                <button
                                  className="icon-button"
                                  onClick={() => startMovementEdit("entry", entry, entry.supplier)}
                                  title="Editar"
                                  type="button"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  className={rowDeleteArmed === entry.id ? "icon-button danger-armed" : "icon-button"}
                                  onClick={() => requestRowDelete("entry", entry.id)}
                                  title={rowDeleteArmed === entry.id ? "Confirmar eliminacion" : "Eliminar"}
                                  type="button"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <Paginator
                      page={entryPage}
                      total={filteredEntriesAll.length}
                      pageSize={HISTORY_PAGE_SIZE}
                      onPage={setEntryPage}
                    />
                  </div>
                ) : (
                  <EmptyState label="No hay entradas que coincidan con esa busqueda." />
                )
              ) : (
                <EmptyState label="Aun no hay entradas registradas." />
              )}
            </section>
          </section>
        )}

        {view === "exits" && (
          <section className="content-grid two-columns">
            <form className="tool-panel product-form" onSubmit={registerExit}>
              <div className="panel-title">
                <ClipboardList size={18} />
                <h2>Salida para cliente</h2>
              </div>
              <div className="form-row">
                <label>
                  Fecha
                  <input
                    type="date"
                    value={exitForm.date}
                    onChange={(event) => setExitForm({ ...exitForm, date: event.target.value })}
                  />
                </label>
                <label>
                  Cliente
                  <input
                    list="client-name-list"
                    value={exitForm.client}
                    onChange={(event) => setExitForm({ ...exitForm, client: event.target.value })}
                    placeholder="Nombre del cliente"
                  />
                </label>
              </div>
              <datalist id="client-name-list">
                {knownClients.map((client) => (
                  <option key={client} value={client} />
                ))}
              </datalist>
              <label>
                Referencia de salida
                <input
                  value={exitForm.reference}
                  onChange={(event) => setExitForm({ ...exitForm, reference: event.target.value })}
                  placeholder="Factura, orden, remision o referencia"
                />
              </label>
              <label>
                Nota
                <textarea
                  value={exitForm.notes}
                  onChange={(event) => setExitForm({ ...exitForm, notes: event.target.value })}
                  placeholder="Detalle opcional"
                />
              </label>

              <div className="line-builder">
                <div className="panel-title compact">
                  <PackagePlus size={17} />
                  <h3>Agregar item</h3>
                </div>
                <div className="form-row">
                  <label>
                    Referencia
                    <input
                      list="product-ref-list"
                      value={exitForm.sku}
                      onChange={(event) => setExitForm({ ...exitForm, sku: event.target.value })}
                      onKeyDown={handleExitItemKeyDown}
                      placeholder="Buscar o escribir referencia"
                    />
                  </label>
                  <label>
                    Cantidad
                    <input
                      min="1"
                      type="number"
                      value={exitForm.quantity}
                      onChange={(event) => setExitForm({ ...exitForm, quantity: event.target.value })}
                      onKeyDown={handleExitItemKeyDown}
                    />
                  </label>
                </div>
                <datalist id="product-ref-list">
                  {products.map((product) => (
                    <option key={product.id} value={product.sku}>
                      {product.name}
                    </option>
                  ))}
                </datalist>
                {selectedExitProduct ? (
                  <div className="selected-product">
                    <strong>{selectedExitProduct.name}</strong>
                    <span>Marca: {selectedExitProduct.brand || "-"}</span>
                    <span>Ubicacion: {selectedExitProduct.location || "-"}</span>
                    <span>Stock actual: {selectedExitProduct.stock}</span>
                  </div>
                ) : (
                  <div className="selected-product muted">
                    Escribe una referencia existente para ver el stock disponible.
                  </div>
                )}
                <button className="secondary-button full" onClick={addExitLine} type="button">
                  <Plus size={17} />
                  Agregar item a la salida
                </button>
              </div>

              {exitStatus && <p className="status-line">{exitStatus}</p>}

              <div className="exit-lines">
                <div className="exit-lines-header">
                  <span>
                    {resolvedExitLines.length
                      ? `${resolvedExitLines.length} item${resolvedExitLines.length === 1 ? "" : "s"} listos`
                      : "Sin items agregados"}
                  </span>
                  <strong>Total: {stagedExitQuantity}</strong>
                </div>
                {resolvedExitLines.length ? (
                  <div className="exit-line-list">
                    {resolvedExitLines.map((line) => (
                      <div className={line.product ? "exit-line" : "exit-line missing"} key={line.id}>
                        <div className="exit-line-main">
                          <strong>{line.product?.name || "Referencia no encontrada"}</strong>
                          <span>
                            {line.product?.sku || line.sku}
                            {line.product?.location ? ` - ${line.product.location}` : ""}
                          </span>
                        </div>
                        <div className="exit-line-stock">
                          <span>Stock</span>
                          <strong>{line.product?.stock ?? "-"}</strong>
                        </div>
                        <div className="exit-line-quantity">
                          <span>Cant.</span>
                          <strong>{line.quantity}</strong>
                        </div>
                        <button
                          className="icon-button danger"
                          onClick={() => removeExitLine(line.id)}
                          title="Quitar item"
                          type="button"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState label="Agrega cada producto que lleva el cliente." />
                )}
              </div>

              <button className="primary-button full" type="submit">
                <Check size={17} />
                Registrar salida completa
              </button>
              {printableExit.length > 0 && (
                <div className="receipt-ready">
                  <div>
                    <strong>Comprobante listo</strong>
                    <span>
                      {printableExit[0]?.reference} - {printableExit[0]?.client}
                    </span>
                  </div>
                  <button className="secondary-button" onClick={() => printExitReceipt()} type="button">
                    <Printer size={17} />
                    Imprimir PDF
                  </button>
                </div>
              )}
            </form>

            <section className="review-panel">
              <div className="panel-title">
                <FileText size={18} />
                <h2>Historial de salidas</h2>
              </div>
              <div className="searchbar">
                <Search size={18} />
                <input
                  list="client-name-list"
                  value={historyQuery}
                  onChange={(event) => setHistoryQuery(event.target.value)}
                  placeholder="Buscar cliente, producto, ref o salida"
                />
              </div>
              <div className="form-row three">
                <label>
                  Desde
                  <input
                    type="date"
                    value={exitFilters.from}
                    onChange={(event) => setExitFilters({ ...exitFilters, from: event.target.value })}
                  />
                </label>
                <label>
                  Hasta
                  <input
                    type="date"
                    value={exitFilters.to}
                    onChange={(event) => setExitFilters({ ...exitFilters, to: event.target.value })}
                  />
                </label>
                <label>
                  Cliente
                  <select
                    value={exitFilters.party}
                    onChange={(event) => setExitFilters({ ...exitFilters, party: event.target.value })}
                  >
                    <option value="">Todos</option>
                    {knownClients.map((client) => (
                      <option key={client} value={client}>
                        {client}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="searchbar">
                <Sparkles size={18} />
                <input
                  value={exitSmartQuery}
                  onChange={(event) => setExitSmartQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      runSmartHistorySearch("exits");
                    }
                  }}
                  placeholder='Buscar con IA: "salidas a Sertemap en julio"'
                />
                <button
                  className="secondary-button tiny"
                  disabled={smartSearching}
                  onClick={() => runSmartHistorySearch("exits")}
                  type="button"
                >
                  {smartSearching ? "..." : "IA"}
                </button>
              </div>
              {exitSmartStatus && <p className="status-line">{exitSmartStatus}</p>}
              <div className="exit-lines-header">
                <span>
                  {filteredExitsAll.length} movimiento{filteredExitsAll.length === 1 ? "" : "s"}
                  {hasActiveHistoryFilters(exitFilters) || historyQuery.trim() ? " (filtrado)" : ""}
                </span>
                <strong>{exitHistoryUnits} unidades</strong>
              </div>
              {(hasActiveHistoryFilters(exitFilters) || historyQuery.trim() || exitSmartQuery.trim()) && (
                <button className="ghost-button" onClick={() => clearHistoryFilters("exits")} type="button">
                  <X size={15} />
                  Limpiar filtros
                </button>
              )}
              <div className="button-row">
                <button
                  className={exitGrouped ? "secondary-button tiny active-toggle" : "secondary-button tiny"}
                  onClick={() => setExitGrouped(true)}
                  type="button"
                >
                  Por cliente
                </button>
                <button
                  className={exitGrouped ? "secondary-button tiny" : "secondary-button tiny active-toggle"}
                  onClick={() => setExitGrouped(false)}
                  type="button"
                >
                  Detallado
                </button>
              </div>
              {movementEdit?.kind === "exit" && movementEditor}

              {historyQuery.trim() && (
                <div className="client-history">
                  <div className="exit-lines-header">
                    <span>
                      {clientProductHistory.length
                        ? `${clientProductHistory.length} producto${clientProductHistory.length === 1 ? "" : "s"} encontrados`
                        : "Sin productos repetibles"}
                    </span>
                    <strong>{historyQuery.trim()}</strong>
                  </div>
                  {clientProductHistory.length ? (
                    <div className="client-history-list">
                      {clientProductHistory.slice(0, 10).map((item) => (
                        <article className="client-history-item" key={item.key}>
                          <div className="client-history-main">
                            <strong>{item.productName}</strong>
                            <span>
                              {item.sku} - {item.client}
                            </span>
                            <span>
                              Ultima: {item.lastDate} - {item.lastReference}
                            </span>
                          </div>
                          <div className="client-history-numbers">
                            <span>Total</span>
                            <strong>{item.totalQuantity}</strong>
                            <em>{item.times} salida{item.times === 1 ? "" : "s"}</em>
                          </div>
                          <div className="client-history-numbers">
                            <span>Stock</span>
                            <strong>{item.stock ?? "-"}</strong>
                            <em>{item.location || "-"}</em>
                          </div>
                          <button
                            className="secondary-button tiny"
                            onClick={() => repeatHistoryProduct(item)}
                            type="button"
                          >
                            Vender otra vez
                          </button>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <EmptyState label="No encontre productos en el historial para esa busqueda." />
                  )}
                </div>
              )}

              {exits.length ? (
                exitGrouped ? (
                  exitGroups.length ? (
                    <div className="movement-groups">
                      {pagedExitGroups.map((group) => (
                        <details className="movement-group" key={group.key}>
                          <summary>
                            <div className="movement-group-main">
                              <strong>{group.party || "Sin cliente"}</strong>
                              <span>
                                {group.date} · {group.reference}
                              </span>
                            </div>
                            <div className="movement-group-numbers">
                              <span>
                                {group.items.length} item{group.items.length === 1 ? "" : "s"}
                              </span>
                              <strong>{group.units} und</strong>
                            </div>
                          </summary>
                          <div className="table-wrap">
                            <table>
                              <thead>
                                <tr>
                                  <th>Ref</th>
                                  <th>Producto</th>
                                  <th>Cant.</th>
                                  {adminUnlocked && <th></th>}
                                </tr>
                              </thead>
                              <tbody>
                                {group.items.map((exit) => (
                                  <tr key={exit.id}>
                                    <td>{exit.sku}</td>
                                    <td>{exit.productName}</td>
                                    <td>{exit.quantity}</td>
                                    {adminUnlocked && (
                                      <td className="one-line">
                                        <button
                                          className="icon-button"
                                          onClick={() => startMovementEdit("exit", exit, exit.client)}
                                          title="Editar"
                                          type="button"
                                        >
                                          <Pencil size={14} />
                                        </button>
                                        <button
                                          className={rowDeleteArmed === exit.id ? "icon-button danger-armed" : "icon-button"}
                                          onClick={() => requestRowDelete("exit", exit.id)}
                                          title={rowDeleteArmed === exit.id ? "Confirmar eliminacion" : "Eliminar"}
                                          type="button"
                                        >
                                          <Trash2 size={14} />
                                        </button>
                                      </td>
                                    )}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                      ))}
                      <Paginator
                        page={exitPage}
                        total={exitGroups.length}
                        pageSize={GROUP_PAGE_SIZE}
                        onPage={setExitPage}
                      />
                    </div>
                  ) : (
                    <EmptyState label="No hay salidas que coincidan con esa busqueda." />
                  )
                ) : filteredHistoryExits.length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Fecha</th>
                          <th>Salida</th>
                          <th>Ref</th>
                          <th>Producto</th>
                          <th>Cliente</th>
                          <th>Cant.</th>
                          {adminUnlocked && <th></th>}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredHistoryExits.map((exit) => (
                          <tr key={exit.id}>
                            <td>{exit.date}</td>
                            <td>{exit.reference}</td>
                            <td>{exit.sku}</td>
                            <td>{exit.productName}</td>
                            <td>{exit.client}</td>
                            <td>{exit.quantity}</td>
                            {adminUnlocked && (
                              <td className="one-line">
                                <button
                                  className="icon-button"
                                  onClick={() => startMovementEdit("exit", exit, exit.client)}
                                  title="Editar"
                                  type="button"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  className={rowDeleteArmed === exit.id ? "icon-button danger-armed" : "icon-button"}
                                  onClick={() => requestRowDelete("exit", exit.id)}
                                  title={rowDeleteArmed === exit.id ? "Confirmar eliminacion" : "Eliminar"}
                                  type="button"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <Paginator
                      page={exitPage}
                      total={filteredExitsAll.length}
                      pageSize={HISTORY_PAGE_SIZE}
                      onPage={setExitPage}
                    />
                  </div>
                ) : (
                  <EmptyState label="No hay salidas que coincidan con esa busqueda." />
                )
              ) : (
                <EmptyState label="Aun no hay salidas registradas." />
              )}
            </section>
          </section>
        )}

        {view === "returns" && (
          <section className="content-grid two-columns">
            <form className="tool-panel product-form" onSubmit={registerReturnCase}>
              <div className="panel-title">
                <RotateCcw size={18} />
                <h2>Cambios / devoluciones</h2>
              </div>

              <label>
                Buscar salida original
                <input
                  value={returnForm.search}
                  onChange={(event) =>
                    setReturnForm({ ...returnForm, search: event.target.value, originalExitId: "" })
                  }
                  placeholder="Cliente, salida, fecha, referencia"
                />
              </label>

              <div className="exit-picker">
                {returnExitMatches.map((exit) => (
                  <button
                    className={returnForm.originalExitId === exit.id ? "exit-choice active" : "exit-choice"}
                    key={exit.id}
                    onClick={() => selectReturnExit(exit)}
                    type="button"
                  >
                    <span>
                      <strong>{exit.reference}</strong>
                      {exit.date} - {exit.client} - {exit.sku}
                    </span>
                    <em>{remainingReturnQuantity(productReturns, exit)} disp.</em>
                  </button>
                ))}
                {!returnExitMatches.length && <EmptyState label="No hay salidas pendientes para devolver." />}
              </div>

              {selectedReturnExit && (
                <div className="selected-product">
                  <strong>{selectedReturnExit.productName}</strong>
                  <span>Cliente: {selectedReturnExit.client}</span>
                  <span>Salida: {selectedReturnExit.reference}</span>
                  <span>
                    Cantidad salida: {selectedReturnExit.quantity} - disponible para devolver: {selectedReturnRemaining}
                  </span>
                </div>
              )}

              <div className="form-row">
                <label>
                  Fecha
                  <input
                    type="date"
                    value={returnForm.date}
                    onChange={(event) => setReturnForm({ ...returnForm, date: event.target.value })}
                  />
                </label>
                <label>
                  Movimiento
                  <select
                    value={returnForm.type}
                    onChange={(event) => setReturnForm({ ...returnForm, type: event.target.value as ReturnType })}
                  >
                    <option value="devolucion">Devolucion</option>
                    <option value="cambio">Cambio</option>
                    <option value="garantia">Garantia</option>
                  </select>
                </label>
              </div>

              <div className="form-row">
                <label>
                  Cantidad devuelta
                  <input
                    min="1"
                    type="number"
                    value={returnForm.returnedQuantity}
                    onChange={(event) => setReturnForm({ ...returnForm, returnedQuantity: event.target.value })}
                  />
                </label>
                <label>
                  Estado del repuesto
                  <select
                    value={returnForm.condition}
                    onChange={(event) =>
                      setReturnForm({ ...returnForm, condition: event.target.value as ReturnCondition })
                    }
                  >
                    <option value="bueno">Bueno, vuelve al stock</option>
                    <option value="revision">Revision, no disponible</option>
                    <option value="garantia">Garantia proveedor</option>
                    <option value="danado">Danado</option>
                  </select>
                </label>
              </div>

              {returnForm.type === "cambio" && (
                <div className="line-builder">
                  <div className="panel-title compact">
                    <PackagePlus size={17} />
                    <h3>Repuesto entregado</h3>
                  </div>
                  <div className="form-row">
                    <label>
                      Referencia nueva
                      <input
                        list="replacement-ref-list"
                        value={returnForm.replacementSku}
                        onChange={(event) => setReturnForm({ ...returnForm, replacementSku: event.target.value })}
                        placeholder="Referencia que se entrega"
                      />
                    </label>
                    <label>
                      Cantidad nueva
                      <input
                        min="1"
                        type="number"
                        value={returnForm.replacementQuantity}
                        onChange={(event) =>
                          setReturnForm({ ...returnForm, replacementQuantity: event.target.value })
                        }
                      />
                    </label>
                  </div>
                  <datalist id="replacement-ref-list">
                    {products.map((product) => (
                      <option key={product.id} value={product.sku}>
                        {product.name}
                      </option>
                    ))}
                  </datalist>
                  {selectedReplacementProduct && (
                    <div className="selected-product">
                      <strong>{selectedReplacementProduct.name}</strong>
                      <span>Ubicacion: {selectedReplacementProduct.location || "-"}</span>
                      <span>Stock actual: {selectedReplacementProduct.stock}</span>
                    </div>
                  )}
                </div>
              )}

              <label>
                Motivo
                <select
                  value={returnForm.reason}
                  onChange={(event) => setReturnForm({ ...returnForm, reason: event.target.value })}
                >
                  <option>Cambio solicitado por cliente</option>
                  <option>Producto equivocado</option>
                  <option>Garantia</option>
                  <option>Producto defectuoso</option>
                  <option>Error de despacho</option>
                  <option>Devolucion comercial</option>
                </select>
              </label>

              <label>
                Nota
                <textarea
                  value={returnForm.notes}
                  onChange={(event) => setReturnForm({ ...returnForm, notes: event.target.value })}
                  placeholder="Observaciones del caso"
                />
              </label>

              {returnStatus && <p className="status-line">{returnStatus}</p>}

              <button className="primary-button full" type="submit">
                <Check size={17} />
                Registrar caso
              </button>

              {printableReturn && (
                <div className="receipt-ready">
                  <div>
                    <strong>Acta lista</strong>
                    <span>
                      {labelForReturnType(printableReturn.type)} - {printableReturn.client}
                    </span>
                  </div>
                  <button className="secondary-button" onClick={() => printReturnAct()} type="button">
                    <Printer size={17} />
                    Imprimir PDF
                  </button>
                </div>
              )}
            </form>

            <section className="review-panel">
              <div className="panel-title">
                <FileText size={18} />
                <h2>Historial de cambios</h2>
              </div>
              {productReturns.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Tipo</th>
                        <th>Cliente</th>
                        <th>Devuelve</th>
                        <th>Cambio</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageSlice(productReturns, returnPage, HISTORY_PAGE_SIZE).map((item) => (
                        <tr key={item.id}>
                          <td>{item.date}</td>
                          <td>{labelForReturnType(item.type)}</td>
                          <td>{item.client}</td>
                          <td>
                            {item.returnedSku} x {item.returnedQuantity}
                          </td>
                          <td>
                            {item.replacementSku
                              ? `${item.replacementSku} x ${item.replacementQuantity || 0}`
                              : "-"}
                          </td>
                          <td>{labelForReturnCondition(item.condition)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <Paginator
                    page={returnPage}
                    total={productReturns.length}
                    pageSize={HISTORY_PAGE_SIZE}
                    onPage={setReturnPage}
                  />
                </div>
              ) : (
                <EmptyState label="Aun no hay cambios o devoluciones registrados." />
              )}
            </section>
          </section>
        )}

        {view === "invoices" && (
          <section className="content-grid two-columns">
            <section className="tool-panel">
              <div className="panel-title">
                <FileText size={18} />
                <h2>Nueva factura</h2>
              </div>
              <label className="dropzone">
                <Upload size={24} />
                <span>{invoiceFile ? invoiceFile.name : "Subir imagen o PDF"}</span>
                <input
                  accept="image/*,application/pdf"
                  onChange={(event) => setInvoiceFile(event.target.files?.[0] || null)}
                  type="file"
                />
              </label>
              <button className="primary-button full" disabled={extracting} onClick={extractInvoice} type="button">
                <Sparkles size={17} />
                {extracting ? "Procesando" : "Extraer con IA"}
              </button>
              {invoiceStatus && <p className="status-line">{invoiceStatus}</p>}

              <div className="manual-box">
                <div className="panel-title compact">
                  <ClipboardList size={17} />
                  <h3>Carga manual</h3>
                </div>
                <textarea
                  value={manualLines}
                  onChange={(event) => setManualLines(event.target.value)}
                  placeholder="SKU, Producto, Cantidad, Costo"
                />
                <button className="secondary-button full" onClick={buildManualInvoice} type="button">
                  <Plus size={17} />
                  Preparar
                </button>
              </div>
            </section>

            <section className="review-panel">
              <div className="panel-title">
                <Check size={18} />
                <h2>Revision</h2>
              </div>
              {invoiceDraft ? (
                <>
                  <div className="invoice-summary">
                    <strong>{invoiceDraft.supplier || "Proveedor sin nombre"}</strong>
                    <span>{invoiceDraft.invoiceNumber || "Sin numero"}</span>
                    <span>{formatCurrency(invoiceDraft.total || 0)}</span>
                  </div>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>SKU</th>
                          <th>Producto</th>
                          <th>Cant.</th>
                          <th>Costo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoiceDraft.items.map((item, index) => (
                          <tr key={`${item.name}-${index}`}>
                            <td>
                              <input
                                value={item.sku || ""}
                                onChange={(event) =>
                                  updateDraftItem(index, { sku: normalizeSku(event.target.value) || null })
                                }
                              />
                            </td>
                            <td>
                              <input
                                value={item.name}
                                onChange={(event) => updateDraftItem(index, { name: event.target.value })}
                              />
                            </td>
                            <td>
                              <input
                                min="0"
                                type="number"
                                value={item.quantity}
                                onChange={(event) =>
                                  updateDraftItem(index, { quantity: toNumber(event.target.value) })
                                }
                              />
                            </td>
                            <td>
                              <input
                                min="0"
                                type="number"
                                value={item.unitCost || 0}
                                onChange={(event) =>
                                  updateDraftItem(index, { unitCost: toNumber(event.target.value) })
                                }
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button className="primary-button full" onClick={applyInvoice} type="button">
                    <Check size={17} />
                    Sumar al inventario
                  </button>
                </>
              ) : (
                <EmptyState label="Las facturas listas aparecen aqui." />
              )}
            </section>
          </section>
        )}

        {view === "import" && (
          <section className="content-grid two-columns">
            <section className="tool-panel">
              <div className="panel-title">
                <FileSpreadsheet size={18} />
                <h2>Importar inventario</h2>
              </div>
              {localInventoryAvailable ? (
                <button className="primary-button full" onClick={loadCurrentInventoryFile} type="button">
                  <FileSpreadsheet size={17} />
                  Cargar copia inventario.xlsx
                </button>
              ) : (
                <div className="selected-product muted">
                  En produccion carga el Excel con el boton Subir Excel o CSV.
                </div>
              )}
              <label>
                Google Sheets o CSV publico
                <input
                  value={sheetUrl}
                  onChange={(event) => setSheetUrl(event.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/..."
                />
              </label>
              <button className="primary-button full" onClick={loadSheet} type="button">
                <FileSpreadsheet size={17} />
                Leer enlace
              </button>
              <label className="dropzone compact-drop">
                <Upload size={23} />
                <span>Subir Excel o CSV</span>
                <input accept=".xlsx,.csv,text/csv" onChange={handleInventoryFile} type="file" />
              </label>
              {importStatus && <p className="status-line">{importStatus}</p>}
            </section>

            <section className="review-panel">
              <div className="panel-title">
                <ClipboardList size={18} />
                <h2>Previsualizacion</h2>
              </div>
              {importRows.length ? (
                <>
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Ref</th>
                          <th>Descripcion</th>
                          <th>Marca</th>
                          <th>Ubicacion</th>
                          <th>Stock actual</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.slice(0, 12).map((row, index) => (
                          <tr key={`${row.sku}-${index}`}>
                            <td>{row.sku}</td>
                            <td>{row.name}</td>
                            <td>{row.brand}</td>
                            <td>{row.location}</td>
                            <td>{row.stock}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <button className="primary-button full" onClick={applyImport} type="button">
                    <Check size={17} />
                    Importar referencias
                  </button>
                </>
              ) : (
                <EmptyState label="Los productos importables aparecen aqui." />
              )}
            </section>
          </section>
        )}

        <footer className="workspace-footer">
          <button className="danger-link" onClick={resetAll} type="button">
            <Trash2 size={15} />
            Limpiar este navegador
          </button>
        </footer>
      </main>
    </div>
    <PrintReceipt active={printView === "exit"} records={printableExit} />
    <PrintEntryReceipt active={printView === "entry"} records={printableEntry} />
    <PrintNoStockReport active={printView === "no-stock"} products={stats.lowStock} />
    <PrintReturnAct active={printView === "return"} record={printableReturn} />
    </>
  );
}

function PrintReceipt({ active, records }: { active: boolean; records: ProductExit[] }) {
  if (!records.length) return <section className="print-document" aria-hidden="true" />;

  const first = records[0];
  const totalQuantity = records.reduce((sum, item) => sum + item.quantity, 0);
  const createdAt = first.createdAt ? new Date(first.createdAt) : new Date();

  return (
    <section className={active ? "print-document active-print" : "print-document"} aria-hidden="true">
      <header className="print-header">
        <div className="print-brand">
          <img src="/assets/yota-logo.png" alt="YOTA Montacargas" />
          <div>
            <strong>YOTA Montacargas</strong>
            <span>Comprobante de salida de inventario</span>
          </div>
        </div>
        <div className="print-stamp">
          <span>Salida</span>
          <strong>{first.reference}</strong>
        </div>
      </header>

      <section className="print-meta">
        <div>
          <span>Fecha</span>
          <strong>{first.date}</strong>
        </div>
        <div>
          <span>Cliente</span>
          <strong>{first.client}</strong>
        </div>
        <div>
          <span>Items</span>
          <strong>{records.length}</strong>
        </div>
        <div>
          <span>Total unidades</span>
          <strong>{totalQuantity}</strong>
        </div>
      </section>

      <table className="print-table">
        <thead>
          <tr>
            <th>Ref.</th>
            <th>Producto</th>
            <th>Marca</th>
            <th>Ubicacion</th>
            <th>Cant.</th>
          </tr>
        </thead>
        <tbody>
          {records.map((item) => (
            <tr key={item.id}>
              <td>{item.sku}</td>
              <td>{item.productName}</td>
              <td>{item.brand || "-"}</td>
              <td>{item.location || "-"}</td>
              <td>{item.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {first.notes && (
        <section className="print-notes">
          <span>Nota</span>
          <p>{first.notes}</p>
        </section>
      )}

      <footer className="print-footer">
        <div>
          <span>Entrega</span>
        </div>
        <div>
          <span>Recibe</span>
        </div>
        <p>Generado: {createdAt.toLocaleString("es-CO")}</p>
      </footer>
    </section>
  );
}

function PrintEntryReceipt({ active, records }: { active: boolean; records: ProductEntry[] }) {
  if (!records.length) return <section className="print-document" aria-hidden="true" />;

  const first = records[0];
  const totalQuantity = records.reduce((sum, item) => sum + item.quantity, 0);
  const createdAt = first.createdAt ? new Date(first.createdAt) : new Date();

  return (
    <section className={active ? "print-document active-print" : "print-document"} aria-hidden="true">
      <header className="print-header">
        <div className="print-brand">
          <img src="/assets/yota-logo.png" alt="YOTA Montacargas" />
          <div>
            <strong>YOTA Montacargas</strong>
            <span>Comprobante de entrada de inventario</span>
          </div>
        </div>
        <div className="print-stamp">
          <span>Entrada</span>
          <strong>{first.reference}</strong>
        </div>
      </header>

      <section className="print-meta">
        <div>
          <span>Fecha</span>
          <strong>{first.date}</strong>
        </div>
        <div>
          <span>Proveedor</span>
          <strong>{first.supplier}</strong>
        </div>
        <div>
          <span>Items</span>
          <strong>{records.length}</strong>
        </div>
        <div>
          <span>Total unidades</span>
          <strong>{totalQuantity}</strong>
        </div>
      </section>

      <table className="print-table">
        <thead>
          <tr>
            <th>Ref.</th>
            <th>Producto</th>
            <th>Marca</th>
            <th>Ubicacion</th>
            <th>Cant.</th>
          </tr>
        </thead>
        <tbody>
          {records.map((item) => (
            <tr key={item.id}>
              <td>{item.sku}</td>
              <td>{item.productName}</td>
              <td>{item.brand || "-"}</td>
              <td>{item.location || "-"}</td>
              <td>{item.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {first.notes && (
        <section className="print-notes">
          <span>Nota</span>
          <p>{first.notes}</p>
        </section>
      )}

      <footer className="print-footer">
        <div>
          <span>Entrega proveedor</span>
        </div>
        <div>
          <span>Recibe bodega</span>
        </div>
        <p>Generado: {createdAt.toLocaleString("es-CO")}</p>
      </footer>
    </section>
  );
}

function PrintNoStockReport({ active, products }: { active: boolean; products: Product[] }) {
  const sortedProducts = [...products].sort((a, b) =>
    `${a.location || ""} ${a.name}`.localeCompare(`${b.location || ""} ${b.name}`)
  );
  const suggestedUnits = sortedProducts.reduce(
    (sum, product) => sum + Math.max(product.minStock || 0, 1),
    0
  );
  const generatedAt = new Date();

  return (
    <section className={active ? "print-document active-print" : "print-document"} aria-hidden="true">
      <header className="print-header">
        <div className="print-brand">
          <img src="/assets/yota-logo.png" alt="YOTA Montacargas" />
          <div>
            <strong>YOTA Montacargas</strong>
            <span>Reporte de productos sin stock</span>
          </div>
        </div>
        <div className="print-stamp">
          <span>Sin stock</span>
          <strong>{sortedProducts.length} refs.</strong>
        </div>
      </header>

      <section className="print-meta">
        <div>
          <span>Fecha</span>
          <strong>{generatedAt.toLocaleDateString("es-CO")}</strong>
        </div>
        <div>
          <span>Referencias</span>
          <strong>{sortedProducts.length}</strong>
        </div>
        <div>
          <span>Stock actual</span>
          <strong>0</strong>
        </div>
        <div>
          <span>Sugerido compra</span>
          <strong>{suggestedUnits}</strong>
        </div>
      </section>

      <table className="print-table stock-print-table">
        <thead>
          <tr>
            <th>Ref.</th>
            <th>Producto</th>
            <th>Marca</th>
            <th>Motor</th>
            <th>Ubicacion</th>
            <th>Min.</th>
            <th>Sugerido</th>
          </tr>
        </thead>
        <tbody>
          {sortedProducts.map((product) => (
            <tr key={product.id}>
              <td>{product.sku}</td>
              <td>{product.name}</td>
              <td>{product.brand || "-"}</td>
              <td>{product.motor || "-"}</td>
              <td>{product.location || "Sin ubicacion"}</td>
              <td>{product.minStock || 0}</td>
              <td>{Math.max(product.minStock || 0, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <footer className="print-footer one-line">
        <p>Generado: {generatedAt.toLocaleString("es-CO")}</p>
      </footer>
    </section>
  );
}

function PrintReturnAct({ active, record }: { active: boolean; record: ProductReturn | null }) {
  if (!record) return <section className="print-document" aria-hidden="true" />;

  const generatedAt = record.createdAt ? new Date(record.createdAt) : new Date();

  return (
    <section className={active ? "print-document active-print" : "print-document"} aria-hidden="true">
      <header className="print-header">
        <div className="print-brand">
          <img src="/assets/yota-logo.png" alt="YOTA Montacargas" />
          <div>
            <strong>YOTA Montacargas</strong>
            <span>Acta de cambio / devolucion de repuestos</span>
          </div>
        </div>
        <div className="print-stamp">
          <span>Caso</span>
          <strong>{record.id.replace("caso-", "").slice(0, 8).toUpperCase()}</strong>
        </div>
      </header>

      <section className="print-meta">
        <div>
          <span>Fecha</span>
          <strong>{record.date}</strong>
        </div>
        <div>
          <span>Cliente</span>
          <strong>{record.client}</strong>
        </div>
        <div>
          <span>Tipo</span>
          <strong>{labelForReturnType(record.type)}</strong>
        </div>
        <div>
          <span>Salida original</span>
          <strong>{record.originalExitReference}</strong>
        </div>
      </section>

      <table className="print-table">
        <thead>
          <tr>
            <th>Movimiento</th>
            <th>Ref.</th>
            <th>Producto</th>
            <th>Cant.</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Devuelve cliente</td>
            <td>{record.returnedSku}</td>
            <td>{record.returnedProductName}</td>
            <td>{record.returnedQuantity}</td>
            <td>{labelForReturnCondition(record.condition)}</td>
          </tr>
          {record.replacementSku && (
            <tr>
              <td>Entrega YOTA</td>
              <td>{record.replacementSku}</td>
              <td>{record.replacementProductName}</td>
              <td>{record.replacementQuantity}</td>
              <td>Salida de cambio</td>
            </tr>
          )}
        </tbody>
      </table>

      <section className="print-notes">
        <span>Motivo</span>
        <p>{record.reason}</p>
        {record.notes && <p>{record.notes}</p>}
        <p>
          {record.restocked
            ? "El repuesto devuelto vuelve al stock disponible."
            : "El repuesto devuelto queda separado y no vuelve al stock disponible."}
        </p>
      </section>

      <footer className="print-footer">
        <div>
          <span>Entrega / revisa</span>
        </div>
        <div>
          <span>Cliente</span>
        </div>
        <p>Generado: {generatedAt.toLocaleString("es-CO")}</p>
      </footer>
    </section>
  );
}

function Dashboard({
  products,
  entries,
  exits,
  stats,
  onEditProduct,
  onOpenEntries,
  onOpenExits,
  onPrintNoStock
}: {
  products: Product[];
  entries: ProductEntry[];
  exits: ProductExit[];
  stats: {
    units: number;
    entries: number;
    exits: number;
    lowStock: Product[];
    withoutLocation: Product[];
    rotation: RotationDashboard;
  };
  onEditProduct: (product: Product) => void;
  onOpenEntries: () => void;
  onOpenExits: () => void;
  onPrintNoStock: () => void;
}) {
  return (
    <section className="dashboard">
      <div className="metrics">
        <Metric label="Referencias" value={String(products.length)} icon={Archive} accent="green" />
        <Metric label="Stock actual" value={String(stats.units)} icon={Boxes} accent="blue" />
        <Metric label="Alta rotacion" value={String(stats.rotation.highRotation.length)} icon={TrendingUp} accent="amber" />
        <Metric label="Alertas stock" value={String(stats.rotation.alerts.length)} icon={AlertTriangle} accent="coral" />
      </div>

      <section className="content-grid two-columns">
        <div className="review-panel">
          <div className="panel-title">
            <AlertTriangle size={18} />
            <h2>Alertas inteligentes</h2>
          </div>
          {stats.lowStock.length > 0 && (
            <button className="secondary-button full report-button" onClick={onPrintNoStock} type="button">
              <Printer size={17} />
              PDF sin stock
            </button>
          )}
          <div className="rotation-list">
            {stats.rotation.alerts.slice(0, 10).map((item) => (
              <RotationRow item={item} key={item.product.id} onEditProduct={onEditProduct} />
            ))}
            {!stats.rotation.alerts.length && <EmptyState label="Sin alertas por rotacion en este momento." />}
          </div>
        </div>

        <div className="review-panel">
          <div className="panel-title">
            <TrendingUp size={18} />
            <h2>Alta rotacion</h2>
          </div>
          <div className="rotation-list">
            {stats.rotation.highRotation.slice(0, 10).map((item) => (
              <RotationRow item={item} key={item.product.id} onEditProduct={onEditProduct} />
            ))}
            {!stats.rotation.highRotation.length && <EmptyState label="Aun no hay suficientes salidas para marcar alta rotacion." />}
          </div>
        </div>
      </section>

      <section className="content-grid two-columns smart-row">
        <div className="review-panel">
          <div className="panel-title">
            <Boxes size={18} />
            <h2>Baja rotacion a vigilar</h2>
          </div>
          <div className="rotation-list">
            {stats.rotation.lowAlerts.slice(0, 8).map((item) => (
              <RotationRow item={item} key={item.product.id} onEditProduct={onEditProduct} />
            ))}
            {!stats.rotation.lowAlerts.length && <EmptyState label="Los productos de baja rotacion aun no llegan a stock 2." />}
          </div>
        </div>

        <div className="review-panel">
          <div className="panel-title">
            <Download size={18} />
            <h2>Ultimas entradas</h2>
          </div>
          <div className="invoice-list">
            {entries.slice(0, 7).map((entry) => (
              <div className="invoice-row" key={entry.id}>
                <span>
                  {entry.date} · {entry.sku} · {entry.supplier}
                </span>
                <strong>+{entry.quantity}</strong>
              </div>
            ))}
            {!entries.length && (
              <button className="empty-action" onClick={onOpenEntries} type="button">
                <Download size={18} />
                Registrar primera entrada
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="content-grid two-columns smart-row">
        <div className="review-panel">
          <div className="panel-title">
            <ClipboardList size={18} />
            <h2>Ultimas salidas</h2>
          </div>
          <div className="invoice-list">
            {exits.slice(0, 7).map((exit) => (
              <div className="invoice-row" key={exit.id}>
                <span>
                  {exit.date} · {exit.sku} · {exit.client}
                </span>
                <strong>{exit.quantity}</strong>
              </div>
            ))}
            {!exits.length && (
              <button className="empty-action" onClick={onOpenExits} type="button">
                <ClipboardList size={18} />
                Registrar primera salida
              </button>
            )}
          </div>
        </div>
      </section>
    </section>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  accent
}: {
  label: string;
  value: string;
  icon: typeof Boxes;
  accent: string;
}) {
  return (
    <div className={`metric ${accent}`}>
      <Icon size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function RotationRow({
  item,
  onEditProduct
}: {
  item: RotationItem;
  onEditProduct: (product: Product) => void;
}) {
  return (
    <button
      className={`rotation-row ${item.level} ${item.alert ? "alert" : ""}`}
      onClick={() => onEditProduct(item.product)}
      type="button"
    >
      <div className="rotation-main">
        <strong>{item.product.name}</strong>
        <span>
          {item.product.sku} - Salidas {item.score} - Alerta en {item.alertThreshold}
        </span>
      </div>
      <div className="rotation-stock">
        <span>{item.level === "alta" ? "Alta" : "Baja"}</span>
        <strong>{item.product.stock}</strong>
      </div>
      {item.alert && <em>Reponer {item.suggestedUnits}</em>}
    </button>
  );
}

function ProductCard({
  product,
  onDelete,
  onEdit,
  onEntry,
  onExit
}: {
  product: Product;
  onDelete: (id: string) => void;
  onEdit: (product: Product) => void;
  onEntry: (product: Product) => void;
  onExit: (product: Product) => void;
}) {
  const low = product.stock <= 0;
  return (
    <article className={low ? "product-card low" : "product-card"}>
      <div className="product-photo">
        {product.photo ? <img src={product.photo} alt={product.name} /> : <Archive size={24} />}
      </div>
      <div className="product-main">
        <div className="product-heading">
          <div>
            <strong>{product.name}</strong>
            <span>{product.sku}</span>
          </div>
          <span className={low ? "pill warn" : "pill"}>{product.location || "Sin ubicacion"}</span>
        </div>
        <div className="product-meta">
          <span>Marca: {product.brand || "Sin marca"}</span>
          <span>Motor: {product.motor || "-"}</span>
          <span>Cruce: {product.crossRef || "-"}</span>
          <span>Ref. cliente: {product.customerRef || "-"}</span>
          <span>Inicial: {product.initialStock || 0}</span>
          <span>Entradas: {product.entries || 0}</span>
          <span>Salidas: {product.exits || 0}</span>
          <span>Actual: {product.stock}</span>
        </div>
      </div>
      <div className="card-actions">
        <button className="secondary-button tiny" onClick={() => onEntry(product)} type="button">
          Entrada
        </button>
        <button className="secondary-button tiny" onClick={() => onExit(product)} type="button">
          Salida
        </button>
        <button className="secondary-button tiny" onClick={() => onEdit(product)} type="button">
          Editar
        </button>
        <button className="icon-button danger" onClick={() => onDelete(product.id)} title="Eliminar" type="button">
          <Trash2 size={16} />
        </button>
      </div>
    </article>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="empty-state">{label}</div>;
}

function titleForView(view: View) {
  const titles: Record<View, string> = {
    dashboard: "Panel de control",
    products: "Repuestos",
    entries: "Entradas",
    exits: "Salidas",
    returns: "Cambios y devoluciones",
    invoices: "Facturas y fotos",
    import: "Importacion"
  };
  return titles[view];
}

function createSnapshot(
  products: Product[],
  invoices: InvoiceRecord[],
  entries: ProductEntry[],
  exits: ProductExit[],
  productReturns: ProductReturn[]
): InventorySnapshot {
  return { products, invoices, entries, exits, productReturns };
}

function hasSnapshotData(snapshot: InventorySnapshot | null | undefined) {
  return Boolean(
    snapshot &&
      (snapshot.products.length ||
        snapshot.invoices.length ||
        snapshot.entries.length ||
        snapshot.exits.length ||
        snapshot.productReturns.length)
  );
}

function formatCloudDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return ` (${date.toLocaleString("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  })})`;
}

function buildClientOptions(exits: ProductExit[]) {
  const clients = new Map<string, string>();
  for (const exit of exits) {
    const cleanClient = exit.client.trim();
    if (!cleanClient) continue;
    const key = normalizeHeader(cleanClient);
    if (!clients.has(key)) clients.set(key, cleanClient);
  }
  return Array.from(clients.values()).sort((a, b) => a.localeCompare(b, "es"));
}

const HISTORY_PAGE_SIZE = 50;
const PRODUCT_PAGE_SIZE = 24;
const GROUP_PAGE_SIZE = 20;
const ADMIN_KEY = "Yota2025$";

type MovementGroup<T> = {
  key: string;
  date: string;
  party: string;
  reference: string;
  items: T[];
  units: number;
};

function groupMovements<T extends { id: string; batchId?: string; date: string; reference: string; quantity: number }>(
  items: T[],
  getParty: (item: T) => string
): MovementGroup<T>[] {
  const groups = new Map<string, MovementGroup<T>>();
  for (const item of items) {
    const party = getParty(item);
    const key = item.batchId || `${item.date}|${normalizeHeader(party)}|${normalizeHeader(item.reference)}`;
    const group = groups.get(key);
    if (group) {
      group.items.push(item);
      group.units += item.quantity;
    } else {
      groups.set(key, {
        key,
        date: item.date,
        party,
        reference: item.reference,
        items: [item],
        units: item.quantity
      });
    }
  }
  return Array.from(groups.values());
}

function pageSlice<T>(items: T[], page: number, pageSize: number) {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(page, 0), pages - 1);
  return items.slice(safePage * pageSize, (safePage + 1) * pageSize);
}

function Paginator({
  page,
  total,
  pageSize,
  onPage
}: {
  page: number;
  total: number;
  pageSize: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const safePage = Math.min(Math.max(page, 0), pages - 1);
  const start = safePage * pageSize + 1;
  const end = Math.min(total, (safePage + 1) * pageSize);
  return (
    <div className="paginator">
      <button
        className="secondary-button tiny"
        disabled={safePage === 0}
        onClick={() => onPage(safePage - 1)}
        type="button"
      >
        Anterior
      </button>
      <span>
        {start}-{end} de {total} · pagina {safePage + 1} de {pages}
      </span>
      <button
        className="secondary-button tiny"
        disabled={safePage >= pages - 1}
        onClick={() => onPage(safePage + 1)}
        type="button"
      >
        Siguiente
      </button>
    </div>
  );
}

type HistoryFilters = {
  from: string;
  to: string;
  party: string;
};

function emptyHistoryFilters(): HistoryFilters {
  return { from: "", to: "", party: "" };
}

function hasActiveHistoryFilters(filters: HistoryFilters) {
  return Boolean(filters.from || filters.to || filters.party);
}

function matchesHistoryFilters(date: string, party: string, filters: HistoryFilters) {
  if (filters.from && date < filters.from) return false;
  if (filters.to && date > filters.to) return false;
  if (filters.party && !normalizeHeader(party).includes(normalizeHeader(filters.party))) return false;
  return true;
}

function filterExitHistory(exits: ProductExit[], query: string, filters: HistoryFilters) {
  const cleanQuery = normalizeHeader(query);
  const sortedExits = [...exits].sort((a, b) => exitTimestamp(b) - exitTimestamp(a));
  return sortedExits.filter(
    (exit) =>
      matchesHistoryFilters(exit.date, exit.client, filters) &&
      (!cleanQuery || normalizeHeader(historySearchText(exit)).includes(cleanQuery))
  );
}

function buildSupplierOptions(entries: ProductEntry[]) {
  const suppliers = new Map<string, string>();
  for (const entry of entries) {
    const clean = (entry.supplier || "").trim();
    if (!clean) continue;
    const key = normalizeHeader(clean);
    if (!suppliers.has(key)) suppliers.set(key, clean);
  }
  return Array.from(suppliers.values()).sort((a, b) => a.localeCompare(b, "es"));
}

function filterEntryHistory(entries: ProductEntry[], query: string, filters: HistoryFilters) {
  const cleanQuery = normalizeHeader(query);
  const sortedEntries = [...entries].sort((a, b) => entryTimestamp(b) - entryTimestamp(a));
  return sortedEntries.filter(
    (entry) =>
      matchesHistoryFilters(entry.date, entry.supplier, filters) &&
      (!cleanQuery || normalizeHeader(entryHistorySearchText(entry)).includes(cleanQuery))
  );
}

function entryHistorySearchText(entry: ProductEntry) {
  return [
    entry.supplier,
    entry.reference,
    entry.sku,
    entry.productName,
    entry.brand,
    entry.location,
    entry.date,
    entry.notes
  ].join(" ");
}

function entryTimestamp(entry: ProductEntry) {
  return Date.parse(entry.createdAt || entry.date) || Date.parse(entry.date) || 0;
}

function buildClientProductHistory(
  exits: ProductExit[],
  products: Product[],
  query: string
): ClientProductHistory[] {
  const cleanQuery = normalizeHeader(query);
  if (!cleanQuery) return [];

  const directClientMatches = exits.filter((exit) => normalizeHeader(exit.client).includes(cleanQuery));
  const sourceExits = directClientMatches.length
    ? directClientMatches
    : filterExitHistory(exits, query, emptyHistoryFilters());
  const history = new Map<string, ClientProductHistory>();

  for (const exit of sourceExits) {
    const product = findProductForSku(products, exit.sku);
    const key = product?.id || normalizeSku(exit.sku);
    const current = history.get(key);

    if (current) {
      current.totalQuantity += exit.quantity;
      current.times += 1;
      if (exitTimestamp(exit) >= exitTimestampFromParts(current.lastDate, current.lastReference)) {
        current.lastDate = exit.date;
        current.lastReference = exit.reference;
        current.client = exit.client;
      }
      continue;
    }

    history.set(key, {
      key,
      sku: product?.sku || exit.sku,
      productId: product?.id || exit.productId,
      productName: product?.name || exit.productName,
      client: exit.client,
      brand: product?.brand || exit.brand,
      location: product?.location || exit.location,
      stock: product ? product.stock : null,
      totalQuantity: exit.quantity,
      times: 1,
      lastDate: exit.date,
      lastReference: exit.reference,
      product
    });
  }

  return Array.from(history.values()).sort((a, b) => {
    const dateCompare = exitTimestampFromParts(b.lastDate, b.lastReference) - exitTimestampFromParts(a.lastDate, a.lastReference);
    return dateCompare || b.totalQuantity - a.totalQuantity || a.productName.localeCompare(b.productName, "es");
  });
}

function historySearchText(exit: ProductExit) {
  return [
    exit.client,
    exit.reference,
    exit.sku,
    exit.productName,
    exit.brand,
    exit.location,
    exit.date,
    exit.notes
  ].join(" ");
}

function exitTimestamp(exit: ProductExit) {
  return Date.parse(exit.createdAt || exit.date) || Date.parse(exit.date) || 0;
}

function exitTimestampFromParts(date: string, reference: string) {
  return Date.parse(date) || Date.parse(reference) || 0;
}

function buildRotationDashboard(products: Product[]): RotationDashboard {
  const positiveScores = products
    .map((product) => product.exits || 0)
    .filter((score) => score > 0)
    .sort((a, b) => a - b);
  const cutoff = positiveScores.length ? Math.max(3, Math.ceil(percentile(positiveScores, 0.75))) : 3;
  const items: RotationItem[] = products.map((product) => {
    const score = product.exits || 0;
    const level: RotationLevel = score > 0 && score >= cutoff ? "alta" : "baja";
    const alertThreshold = level === "alta" ? 20 : 2;
    const alert = product.stock <= alertThreshold;
    return {
      product,
      level,
      score,
      alertThreshold,
      alert,
      suggestedUnits: alert ? Math.max(1, alertThreshold - product.stock) : 0
    };
  });

  const highRotation = items
    .filter((item) => item.level === "alta")
    .sort((a, b) => b.score - a.score || a.product.stock - b.product.stock);
  const lowRotation = items
    .filter((item) => item.level === "baja")
    .sort((a, b) => a.score - b.score || a.product.stock - b.product.stock);
  const alerts = items
    .filter((item) => item.alert)
    .sort((a, b) => {
      if (a.level !== b.level) return a.level === "alta" ? -1 : 1;
      return b.suggestedUnits - a.suggestedUnits || b.score - a.score;
    });

  return {
    cutoff,
    highRotation,
    lowRotation,
    alerts,
    highAlerts: alerts.filter((item) => item.level === "alta"),
    lowAlerts: alerts.filter((item) => item.level === "baja")
  };
}

function percentile(values: number[], fraction: number) {
  if (!values.length) return 0;
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * fraction) - 1));
  return values[index];
}

function remainingReturnQuantity(productReturns: ProductReturn[], exit: ProductExit) {
  const returned = productReturns
    .filter((item) => item.originalExitId === exit.id)
    .reduce((sum, item) => sum + item.returnedQuantity, 0);
  return Math.max(0, exit.quantity - returned);
}

function labelForReturnType(type: ReturnType) {
  const labels: Record<ReturnType, string> = {
    devolucion: "Devolucion",
    cambio: "Cambio",
    garantia: "Garantia"
  };
  return labels[type];
}

function labelForReturnCondition(condition: ReturnCondition) {
  const labels: Record<ReturnCondition, string> = {
    bueno: "Bueno",
    revision: "Revision",
    garantia: "Garantia proveedor",
    danado: "Danado"
  };
  return labels[condition];
}

function isLocalRuntime() {
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

function toNumber(value: string | number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function normalizeSku(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "-");
}

function findProductForSku(products: Product[], sku: string) {
  const cleanSku = normalizeSku(sku);
  if (!cleanSku) return undefined;
  return products.find(
    (product) =>
      normalizeSku(product.sku) === cleanSku ||
      normalizeSku(product.crossRef) === cleanSku ||
      normalizeSku(product.customerRef) === cleanSku
  );
}

function matchProductForExit(products: Product[], value: string) {
  const exact = findProductForSku(products, value);
  if (exact) return { product: exact, count: 1 };

  const cleanValue = normalizeHeader(value);
  if (!cleanValue) return { product: undefined, count: 0 };

  const matches = products.filter((product) =>
    [product.sku, product.crossRef, product.customerRef, product.name, product.brand, product.location].some(
      (field) => normalizeHeader(field || "").includes(cleanValue)
    )
  );

  return {
    product: matches.length === 1 ? matches[0] : undefined,
    count: matches.length
  };
}

function createSku(name: string) {
  const prefix =
    name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 12) || "PROD";
  return `${prefix}-${Math.floor(Math.random() * 900 + 100)}`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0
  }).format(value || 0);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function formatInvoiceError(error: string) {
  const messages: Record<string, string> = {
    AI_NOT_CONFIGURED: "IA pendiente: configura OPENAI_API_KEY o usa carga manual.",
    UNSUPPORTED_FILE_TYPE: "Formato no soportado. Usa imagen o PDF.",
    INVOICE_FILE_REQUIRED: "Selecciona una factura primero.",
    INVOICE_EXTRACTION_FAILED: "La extraccion fallo. Puedes cargarla manualmente."
  };
  return messages[error] || "No se pudo procesar la factura.";
}

function parseManualLine(line: string): InvoiceItem | null {
  const parts = line.split(/[,;\t]/).map((part) => part.trim());
  if (parts.length < 2) return null;
  const [sku, name, quantity = "1", unitCost = "0"] = parts;
  const qty = toNumber(quantity) || 1;
  const cost = toNumber(unitCost);
  return {
    sku: normalizeSku(sku) || null,
    name,
    category: null,
    quantity: qty,
    unit: "unidad",
    unitCost: cost,
    lineTotal: qty * cost,
    confidence: 1
  };
}

function applyItemsToInventory(products: Product[], invoice: InvoiceExtraction, sourceInvoice: string): Product[] {
  const next = [...products];
  const now = new Date().toISOString();

  for (const item of invoice.items) {
    const sku = normalizeSku(item.sku) || createSku(item.name);
    const existingIndex = next.findIndex(
      (product) => product.sku === sku || product.name.toLowerCase() === item.name.toLowerCase()
    );
    const cost = item.unitCost || (item.lineTotal && item.quantity ? item.lineTotal / item.quantity : 0);

    if (existingIndex >= 0) {
      const existing = next[existingIndex];
      next[existingIndex] = {
        ...existing,
        sku: existing.sku || sku,
        stock: existing.stock + item.quantity,
        entries: (existing.entries || 0) + item.quantity,
        unitCost: cost || existing.unitCost,
        supplier: invoice.supplier || existing.supplier,
        updatedAt: now,
        source: sourceInvoice
      };
    } else {
      next.unshift({
        id: createId("prd"),
        sku,
        name: item.name,
        category: item.category || "Sin categoria",
        brand: invoice.supplier || "",
        motor: "",
        crossRef: "",
        customerRef: "",
        location: "",
        initialStock: 0,
        entries: item.quantity,
        exits: 0,
        stock: item.quantity,
        minStock: 0,
        unitCost: cost,
        price: Math.round(cost * 1.35),
        supplier: invoice.supplier || "",
        updatedAt: now,
        source: sourceInvoice
      });
    }
  }

  return next;
}

function mergeProducts(current: Product[], incoming: Product[]) {
  const next = [...current];
  for (const product of incoming) {
    const sku = normalizeSku(product.sku);
    const index = next.findIndex((item) => item.sku === sku && sku);
    if (index >= 0) {
      next[index] = {
        ...next[index],
        ...product,
        id: next[index].id,
        sku,
        stock: product.stock,
        updatedAt: new Date().toISOString()
      };
    } else {
      next.unshift({ ...product, sku: sku || createSku(product.name) });
    }
  }
  return next;
}

function normalizeImportRow(row: Record<string, unknown>): ImportRow | null {
  const value = (keys: string[]) => {
    const entries = Object.entries(row);
    const match = entries.find(([key]) =>
      keys.some((candidate) => normalizeHeader(key).includes(normalizeHeader(candidate)))
    );
    return cleanCellText(match?.[1]);
  };

  const name = value(["producto", "nombre", "name", "descripcion"]);
  if (!name) return null;

  const initialStock = toNumber(value(["stock inicial", "inicial"]));
  const entries = toNumber(value(["entradas", "entrada"]));
  const exits = toNumber(value(["salidas", "salida"]));
  const stock = toNumber(value(["stock actual", "actual", "stock", "existencia", "cantidad", "qty"]));
  const brand = value(["marca", "brand"]);

  return {
    sku: normalizeSku(value(["sku", "codigo", "referencia", "ref"])),
    name,
    category: value(["categoria", "category", "linea"]) || brand || "Repuestos",
    brand,
    motor: value(["motor"]),
    crossRef: value(["cruce", "referencia cruzada", "equivalencia"]),
    customerRef: value(["ref. cliente", "ref cliente", "cliente"]),
    location: value(["ubicacion", "ubicacion", "location"]).toUpperCase(),
    initialStock,
    entries,
    exits,
    stock: stock || Math.max(0, initialStock + entries - exits),
    minStock: toNumber(value(["minimo", "min", "stock minimo"])),
    unitCost: toNumber(value(["costo", "coste", "unit cost", "precio compra"])),
    price: toNumber(value(["precio", "venta", "price", "precio venta"])),
    supplier: value(["proveedor", "supplier"]) || brand
  };
}

function normalizeHeader(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function importRowToProduct(row: ImportRow): Product {
  return {
    id: createId("prd"),
    ...row,
    sku: normalizeSku(row.sku) || createSku(row.name),
    updatedAt: new Date().toISOString(),
    source: "importacion"
  };
}

function cleanCellText(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(value);
  }
  return String(value)
    .trim()
    .replace(/\.0$/, "");
}

export default App;
