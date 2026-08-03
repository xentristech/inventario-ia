import { openai, type OpenAIResponsesProviderOptions } from "@ai-sdk/openai";
import { generateText, Output } from "ai";
import { z } from "zod";

export const historyFilterSchema = z.object({
  from: z.string().nullable().describe("Fecha inicial yyyy-mm-dd del rango pedido; null si la consulta no limita inicio."),
  to: z.string().nullable().describe("Fecha final yyyy-mm-dd del rango pedido; null si no limita fin."),
  party: z
    .string()
    .nullable()
    .describe(
      "Cliente o proveedor mencionado. Usa el nombre EXACTO de la lista conocida cuando haya coincidencia razonable; null si la consulta no menciona ninguno."
    ),
  text: z
    .string()
    .nullable()
    .describe("Palabras clave restantes para buscar por producto, referencia o codigo; null si no aplica."),
  summary: z.string().describe("Descripcion corta en espanol de los filtros aplicados, por ejemplo: Salidas a Sertemap entre 2025-07-01 y 2025-07-31.")
});

export type HistoryFilterExtraction = z.infer<typeof historyFilterSchema>;

export async function parseHistoryQuery(
  query: string,
  kind: "entries" | "exits",
  parties: string[]
): Promise<HistoryFilterExtraction> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY_MISSING");
  }

  const modelId = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const partyLabel = kind === "entries" ? "proveedor" : "cliente";
  const movementLabel = kind === "entries" ? "entradas (ingresos de mercancia de proveedores)" : "salidas (ventas o despachos a clientes)";
  const today = new Date().toISOString().slice(0, 10);
  const knownParties = parties.slice(0, 400).join("; ");

  const { output } = await generateText({
    model: openai(modelId),
    instructions: `Conviertes consultas en espanol sobre el historial de ${movementLabel} de un inventario en filtros estructurados. Hoy es ${today}. Interpreta expresiones relativas de tiempo ("en julio", "la semana pasada", "este anio", "ultimos 3 meses") como rangos de fechas concretos. Si la consulta menciona un ${partyLabel}, devuelve su nombre exacto tomado de la lista conocida cuando exista una coincidencia razonable (tolera errores de tipeo). No inventes fechas ni nombres que la consulta no implique.`,
    output: Output.object({
      name: "HistoryFilterExtraction",
      description: "Filtros estructurados para el historial de inventario.",
      schema: historyFilterSchema
    }),
    messages: [
      {
        role: "user",
        content: `Consulta: ${query}\n\nLista de ${partyLabel}es conocidos: ${knownParties || "(vacia)"}`
      }
    ],
    providerOptions: {
      openai: {
        store: false
      } satisfies OpenAIResponsesProviderOptions
    },
    maxRetries: 1,
    timeout: { totalMs: 30000 }
  });

  return output;
}
