/**
 * Navegação por teclado do padrão de abas (WAI-ARIA APG "Tabs").
 *
 * G2.22: horizontal — ← / → circulam entre as abas, Home vai para a primeira
 * e End para a última.
 * G2.23: também vertical (↑ / ↓) e abas desabilitadas (são puladas), mais um
 * handler de DOM (`handleTabListKeyDown`) para as barras de abas que não
 * guardam o índice focado em estado.
 *
 * O helper só decide PARA ONDE o foco vai. Quem decide se a aba é ativada ao
 * receber foco (ativação automática) ou só com Enter/Espaço (ativação manual,
 * para painéis que carregam dados) é o componente.
 */

export type TabOrientation = "horizontal" | "vertical"
export type TabActivation = "automatic" | "manual"

export interface NextTabOptions {
  orientation?: TabOrientation | undefined
  /** Abas desabilitadas não recebem foco pelas setas nem por Home/End. */
  isDisabled?: (index: number) => boolean
}

const KEYS: Record<TabOrientation, { prev: string; next: string }> = {
  horizontal: { prev: "ArrowLeft", next: "ArrowRight" },
  vertical: { prev: "ArrowUp", next: "ArrowDown" },
}

/**
 * Índice da aba que deve receber o foco, ou null quando a tecla não pertence
 * ao padrão (ou não há aba habilitada para onde ir). `current` fora da lista
 * (ex.: -1) é tratado como "antes da primeira".
 */
export function nextTabIndex(key: string, current: number, count: number, options: NextTabOptions = {}): number | null {
  if (count <= 0) return null
  const { prev, next } = KEYS[options.orientation ?? "horizontal"]
  const disabled = options.isDisabled ?? (() => false)
  const enabled = Array.from({ length: count }, (_, i) => i).filter((i) => !disabled(i))
  if (enabled.length === 0) return null

  switch (key) {
    case "Home":
      return enabled[0] ?? null
    case "End":
      return enabled[enabled.length - 1] ?? null
    case next:
    case prev: {
      const step = key === next ? 1 : -1
      // Sem aba focada válida: → começa "antes da primeira", ← "depois da última".
      let start = current
      if (current < 0 || current >= count) start = step === 1 ? -1 : count
      for (let k = 1; k <= count; k++) {
        const i = (((start + step * k) % count) + count) % count
        if (!disabled(i)) return i
      }
      return null
    }
    default:
      return null
  }
}

/** Formato mínimo do evento de teclado (React ou DOM) usado pelo handler. */
export interface TabListKeyEvent {
  key: string
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  target: unknown
  currentTarget: unknown
  preventDefault(): void
}

interface TabLike {
  focus(): void
  click(): void
  getAttribute(name: string): string | null
  disabled?: boolean
}
interface TabListLike {
  querySelectorAll(selector: string): ArrayLike<TabLike>
}
interface ClosestCapable {
  closest?(selector: string): unknown
}

/**
 * `onKeyDown` do elemento `role="tablist"`. Descobre as abas pelo DOM
 * (`[role="tab"]`), parte da aba que está COM FOCO e move o foco segundo o
 * padrão APG. Com ativação automática, também ativa a aba focada (clique, o
 * mesmo caminho do mouse). Enter/Espaço não são tratados aqui: as abas são
 * <button>, então o navegador já os transforma em clique (ativação manual).
 * Combinações com Alt/Ctrl/Meta passam direto (atalhos do navegador).
 */
export function handleTabListKeyDown(
  event: TabListKeyEvent,
  options: { activation: TabActivation; orientation?: TabOrientation | undefined },
): void {
  if (event.altKey || event.ctrlKey || event.metaKey) return
  const list = event.currentTarget as TabListLike
  const tabs = Array.from(list.querySelectorAll('[role="tab"]'))
  const focused = (event.target as ClosestCapable | null)?.closest?.('[role="tab"]') as TabLike | null | undefined
  if (!focused) return
  const current = tabs.indexOf(focused)
  if (current === -1) return
  const isDisabled = (i: number) => {
    const tab = tabs[i]
    return !!tab && (tab.disabled === true || tab.getAttribute("aria-disabled") === "true")
  }
  const next = nextTabIndex(event.key, current, tabs.length, { orientation: options.orientation, isDisabled })
  if (next === null) return
  event.preventDefault()
  const target = tabs[next]
  if (!target) return
  target.focus()
  if (options.activation === "automatic" && next !== current) target.click()
}
