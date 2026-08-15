import type { ExtractResult } from "./types"

export async function extractDocxText(buffer: ArrayBuffer): Promise<ExtractResult> {
  const mammoth = await import("mammoth")
  const result = await mammoth.extractRawText({ arrayBuffer: buffer })
  return { text: result.value || "", method: "docx" }
}
