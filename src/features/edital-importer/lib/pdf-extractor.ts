import type { ExtractResult } from "./types"

const MIN_SELECTABLE_TEXT_CHARS = 200

export async function extractPdfText(buffer: ArrayBuffer): Promise<ExtractResult> {
  const { PDFParse } = await import("pdf-parse")
  const parser = new PDFParse({ data: buffer })
  try {
    const result = await parser.getText()
    const text = (result.text || "").split("\u0000").join("")

    if (text.trim().length < MIN_SELECTABLE_TEXT_CHARS) {
      return {
        text,
        method: "pdf",
        warning:
          "O PDF parece ser um documento digitalizado (sem texto selecionável). Copie o conteúdo programático para um arquivo TXT e importe novamente.",
      }
    }

    return { text, method: "pdf" }
  } finally {
    await parser.destroy()
  }
}
