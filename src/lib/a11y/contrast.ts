/**
 * G2.24 — contraste WCAG 2.x para cores escolhidas pelo usuário.
 *
 * O aluno escolhe a cor de cada disciplina (`color_hex`). Texto sobre essa cor
 * não pode ser sempre branco: em cores claras (âmbar, lima, ciano...) o
 * contraste cai muito abaixo de 4,5:1. `readableTextOn` escolhe, entre texto
 * claro e escuro, o de MAIOR contraste calculado — sem mexer na cor salva.
 *
 * Funções puras, sem DOM. Só entende hexadecimal (#rgb, #rgba, #rrggbb,
 * #rrggbbaa); qualquer outra entrada é inválida e cai na cor neutra do sistema.
 */

export interface Rgb {
  r: number
  g: number
  b: number
}
export interface Rgba extends Rgb {
  a: number
}

/** Meta WCAG 1.4.3 (AA) para texto normal. */
export const WCAG_AA_NORMAL = 4.5

/** Mesmo neutro de `DEFAULT_DISCIPLINE_COLOR` (domain/disciplines). */
export const NEUTRAL_CHIP_COLOR = "#64748b"

export const LIGHT_TEXT = "#ffffff"
/** Escuro preferido (slate-900). Se nem ele alcançar a meta, usa preto puro. */
export const DARK_TEXT = "#0f172a"
const PURE_BLACK = "#000000"

const HEX_RE = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i

/** Lê #rgb, #rgba, #rrggbb ou #rrggbbaa. Entrada inválida → null (nunca lança). */
export function parseHexColor(input: unknown): Rgba | null {
  if (typeof input !== "string") return null
  const text = input.trim()
  if (!HEX_RE.test(text)) return null
  let hex = text.slice(1)
  if (hex.length === 3 || hex.length === 4) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("")
  }
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16)
  return { r: n(0), g: n(2), b: n(4), a: hex.length === 8 ? n(6) / 255 : 1 }
}

function channel(v: number): number {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

/** Luminância relativa (WCAG), 0 (preto) a 1 (branco). */
export function relativeLuminance(rgb: Rgb): number {
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
}

/** Razão de contraste (1 a 21) entre duas luminâncias. */
export function contrastRatio(a: number, b: number): number {
  const [hi, lo] = a >= b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

/** Cor com transparência sobre um fundo opaco → cor opaca efetiva. */
export function compositeOver(fg: Rgba, backdrop: Rgb): Rgb {
  const a = Math.min(1, Math.max(0, fg.a))
  return {
    r: Math.round(fg.r * a + backdrop.r * (1 - a)),
    g: Math.round(fg.g * a + backdrop.g * (1 - a)),
    b: Math.round(fg.b * a + backdrop.b * (1 - a)),
  }
}

export interface ReadableText {
  /** Cor do texto (hex). */
  color: string
  /** Contraste calculado entre o texto e o fundo efetivo. */
  ratio: number
  /** `ratio` alcança a meta pedida. */
  meetsTarget: boolean
}

export interface ReadableTextOptions {
  /** Meta de contraste (padrão 4,5:1, texto normal AA). */
  target?: number
  /** Fundo sob uma cor com transparência (padrão branco). */
  backdrop?: string
}

function ratioOf(textHex: string, bg: Rgb): number {
  const text = parseHexColor(textHex) as Rgba
  return contrastRatio(relativeLuminance(text), relativeLuminance(bg))
}

/**
 * Texto legível sobre `background`: escolhe claro ou escuro pelo MAIOR contraste.
 * Se nenhum dos dois alcançar a meta (tons intermediários), usa preto ou branco
 * puro — para qualquer cor opaca o melhor dos dois passa de 4,5:1.
 * Entrada inválida → calcula sobre a cor neutra do sistema.
 */
export function readableTextOn(background: unknown, options: ReadableTextOptions = {}): ReadableText {
  const target = options.target ?? WCAG_AA_NORMAL
  const parsed = parseHexColor(background) ?? (parseHexColor(NEUTRAL_CHIP_COLOR) as Rgba)
  const backdrop = parseHexColor(options.backdrop ?? "#ffffff") ?? { r: 255, g: 255, b: 255, a: 1 }
  const bg = compositeOver(parsed, backdrop)

  const light = ratioOf(LIGHT_TEXT, bg)
  const dark = ratioOf(DARK_TEXT, bg)
  const preferred = dark > light ? { color: DARK_TEXT, ratio: dark } : { color: LIGHT_TEXT, ratio: light }
  if (preferred.ratio >= target) return { ...preferred, meetsTarget: true }

  const black = ratioOf(PURE_BLACK, bg)
  const best = black > light ? { color: PURE_BLACK, ratio: black } : { color: LIGHT_TEXT, ratio: light }
  return { ...best, meetsTarget: best.ratio >= target }
}

export interface ChipColors {
  /** Fundo a aplicar: a cor do usuário se válida, senão o neutro do sistema. */
  background: string
  /** Texto legível sobre esse fundo. */
  color: string
  ratio: number
}

/**
 * Par fundo/texto para um chip colorido pelo usuário. Não altera a cor salva:
 * só decide COMO desenhá-la. Cor inválida → neutro (nunca um fundo "invisível").
 */
export function chipColors(stored: unknown, options: ReadableTextOptions = {}): ChipColors {
  const valid = parseHexColor(stored) !== null
  const background = valid ? (stored as string).trim() : NEUTRAL_CHIP_COLOR
  const text = readableTextOn(background, options)
  return { background, color: text.color, ratio: text.ratio }
}
