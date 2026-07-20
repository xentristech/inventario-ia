import { openai, type OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";

const itemSchema = z.object({
  sku: z.string().nullable().describe("Codigo, referencia o SKU visible en la factura; null si no aparece."),
  name: z.string().describe("Nombre comercial del producto."),
  category: z.string().nullable().describe("Categoria breve sugerida para inventario."),
  quantity: z.number().describe("Cantidad comprada. Usa 1 si la factura no muestra cantidad."),
  unit: z.string().nullable().describe("Unidad de medida, por ejemplo unidad, kg, caja, litro."),
  unitCost: z.number().nullable().describe("Costo unitario antes de margen; null si no se puede inferir."),
  lineTotal: z.number().nullable().describe("Total de la linea; null si no se puede inferir."),
  confidence: z.number().min(0).max(1).describe("Confianza de extraccion para esta linea.")
});

export const invoiceSchema = z.object({
  supplier: z.string().nullable().describe("Proveedor o emisor de la factura."),
  invoiceNumber: z.string().nullable().describe("Numero de factura."),
  invoiceDate: z.string().nullable().describe("Fecha ISO yyyy-mm-dd si es posible."),
  currency: z.string().nullable().describe("Moneda detectada, por ejemplo COP o USD."),
  subtotal: z.number().nullable(),
  tax: z.number().nullable(),
  total: z.number().nullable(),
  confidence: z.number().min(0).max(1),
  items: z.array(itemSchema).describe("Productos comprados para sumar al inventario.")
});

export type InvoiceExtraction = z.infer<typeof invoiceSchema>;

export async function extractInvoiceFromFile(file: Express.Multer.File): Promise<InvoiceExtraction> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY_MISSING");
  }

  const modelId = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  const { output } = await generateText({
    model: openai(modelId),
    instructions:
      "Eres un analista de facturas para inventario. Extrae solo datos visibles o inferencias conservadoras. No inventes codigos, precios ni cantidades. Devuelve valores numericos sin simbolos de moneda.",
    output: Output.object({
      name: "InvoiceInventoryExtraction",
      description: "Datos normalizados de factura para crear o actualizar inventario.",
      schema: invoiceSchema
    }),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Extrae proveedor, numero, fecha, totales y cada producto comprable. Prioriza SKU, nombre, cantidad, costo unitario y total de linea."
          },
          {
            type: "file",
            mediaType: file.mimetype || "application/octet-stream",
            filename: file.originalname,
            data: file.buffer
          }
        ]
      }
    ],
    providerOptions: {
      openai: {
        store: false
      } satisfies OpenAIResponsesProviderOptions
    },
    maxRetries: 1,
    timeout: { totalMs: 60000 }
  });

  return output;
}
