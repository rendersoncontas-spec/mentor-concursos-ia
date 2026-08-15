import type { ExtractResult } from "./types"

const ACCEPTED_EXTENSIONS = ["pdf", "docx", "txt"] as const
export type AcceptedExtension = (typeof ACCEPTED_EXTENSIONS)[number]

export function isAcceptedExtension(name: string): name is AcceptedExtension {
  const ext = name.split(".").pop()?.toLowerCase()
  return ext !== undefined && (ACCEPTED_EXTENSIONS as readonly string[]).includes(ext)
}

export function extensionOf(name: string): AcceptedExtension | null {
  const ext = name.split(".").pop()?.toLowerCase()
  if (!ext || !isAcceptedExtension(ext)) return null
  return ext
}

const MIME_BY_EXT: Record<AcceptedExtension, string[]> = {
  pdf: ["application/pdf"],
  docx: [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/octet-stream",
  ],
  txt: ["text/plain", "application/octet-stream", "text/markdown"],
}

export function isAcceptedMime(ext: AcceptedExtension, mime: string): boolean {
  if (!mime) return true
  return MIME_BY_EXT[ext].includes(mime.toLowerCase())
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export async function extractTextFromFile(
  buffer: ArrayBuffer,
  ext: AcceptedExtension,
): Promise<ExtractResult> {
  switch (ext) {
    case "pdf": {
      const { extractPdfText } = await import("./pdf-extractor")
      const result = await extractPdfText(buffer)
      return result
    }
    case "docx": {
      const { extractDocxText } = await import("./docx-extractor")
      return extractDocxText(buffer)
    }
    case "txt": {
      return extractTxtText(buffer)
    }
  }
}

function extractTxtText(buffer: ArrayBuffer): ExtractResult {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(buffer)
  return { text, method: "txt" }
}
