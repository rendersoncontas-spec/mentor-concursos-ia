import * as XLSX from "xlsx"

export interface RawSheet {
  name: string
  rows: (unknown[])[]
}

/**
 * Lê um arquivo Excel/CSV (ArrayBuffer) em planilhas com linhas cruas.
 * cellDates: true faz o SheetJS entregar células de data como Date nativo.
 */
export function readWorkbook(arrayBuffer: ArrayBuffer): RawSheet[] {
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true })
  const sheets: RawSheet[] = []
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name]
    if (!sheet) continue
    sheets.push({
      name,
      rows: XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        defval: null,
        raw: true,
        blankrows: false,
      }),
    })
  }
  return sheets
}

export function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
  return file.arrayBuffer()
}
