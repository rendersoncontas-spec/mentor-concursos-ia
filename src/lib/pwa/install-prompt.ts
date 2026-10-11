/**
 * UX-PWA-01 — controle da instalação do NomeIA como app web (PWA).
 *
 * Puro e sem React: recebe um "window" (real ou falso nos testes). Não cria
 * Service Worker, não promete offline e não abre nada sozinho.
 *
 * - beforeinstallprompt (Chrome/Edge/Samsung no Android e desktop): o evento
 *   é GUARDADO (preventDefault evita o mini-aviso automático) e só usado
 *   quando o aluno toca em "Instalar aplicativo". Nem todo navegador dispara
 *   esse evento — nada aqui presume que ele virá.
 * - appinstalled: único sinal de que a instalação aconteceu. "accepted" no
 *   prompt NÃO é tratado como instalado.
 * - Já instalado: display-mode standalone/fullscreen/minimal-ui ou
 *   navigator.standalone (iOS). O user-agent só escolhe as INSTRUÇÕES
 *   (iOS × Android × outros), nunca decide se o app está instalado.
 * - Ouvintes registrados uma única vez (contagem de uso) e removidos quando
 *   o último usuário libera o controle.
 */

export interface BeforeInstallPromptEventLike extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform?: string }>
}

export interface InstallWindowLike {
  addEventListener(type: string, listener: (e: Event) => void): void
  removeEventListener(type: string, listener: (e: Event) => void): void
  matchMedia?: (query: string) => {
    matches: boolean
    addEventListener?: (type: "change", l: () => void) => void
    removeEventListener?: (type: "change", l: () => void) => void
  }
  navigator: { userAgent: string; platform?: string; maxTouchPoints?: number; standalone?: boolean }
}

export type InstallPlatform = "ios" | "android" | "other"

export interface InstallSnapshot {
  /** Rodando como app instalado (standalone) ou appinstalled recebido. */
  installed: boolean
  /** Há um prompt nativo guardado e pronto para uso. */
  canPrompt: boolean
  /** Prompt nativo aberto aguardando a escolha. */
  prompting: boolean
  platform: InstallPlatform
  /** iOS fora do Safari (Chrome/Firefox/Edge iOS) — instrução extra. */
  iosNonSafari: boolean
  /** Navegador embutido de app (Instagram, Facebook…) — melhor abrir no navegador. */
  inAppBrowser: boolean
}

export type InstallOutcome = "accepted" | "dismissed" | "unavailable"

const STANDALONE_QUERIES = ["(display-mode: standalone)", "(display-mode: fullscreen)", "(display-mode: minimal-ui)"] as const

export function detectPlatform(nav: InstallWindowLike["navigator"]): InstallPlatform {
  const ua = nav.userAgent || ""
  // iPadOS se apresenta como "Macintosh" — o toque distingue de um Mac.
  if (/iPad|iPhone|iPod/i.test(ua) || (nav.platform === "MacIntel" && (nav.maxTouchPoints ?? 0) > 1)) return "ios"
  if (/Android/i.test(ua)) return "android"
  return "other"
}

export function isRunningStandalone(win: InstallWindowLike): boolean {
  if (win.navigator.standalone === true) return true
  if (!win.matchMedia) return false
  return STANDALONE_QUERIES.some((q) => {
    try {
      return win.matchMedia?.(q).matches === true
    } catch {
      return false
    }
  })
}

export function isBeforeInstallPromptEvent(e: Event): e is BeforeInstallPromptEventLike {
  const x = e as Partial<BeforeInstallPromptEventLike>
  return typeof x.prompt === "function" && typeof x.userChoice === "object" && x.userChoice !== null
}

export interface InstallController {
  /** Começa a ouvir (idempotente; conta usos). */
  acquire(): void
  /** Libera um uso; no último, remove todos os ouvintes. */
  release(): void
  getSnapshot(): InstallSnapshot
  subscribe(listener: () => void): () => void
  /** Abre o prompt nativo guardado. Sem prompt → "unavailable" (a tela mostra instruções). */
  promptInstall(): Promise<InstallOutcome>
  /** Número de ouvintes registrados na janela (diagnóstico/testes). */
  listenerCount(): number
}

export function createInstallController(win: InstallWindowLike): InstallController {
  const ua = win.navigator.userAgent || ""
  const platform = detectPlatform(win.navigator)
  let deferred: BeforeInstallPromptEventLike | null = null
  let installedByEvent = false
  let prompting: Promise<InstallOutcome> | null = null
  let users = 0
  let registered = 0
  const subscribers = new Set<() => void>()
  const mediaCleanups: (() => void)[] = []

  const compute = (): InstallSnapshot => ({
    installed: installedByEvent || isRunningStandalone(win),
    canPrompt: deferred !== null && !installedByEvent,
    prompting: prompting !== null,
    platform,
    iosNonSafari: platform === "ios" && /CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua),
    inAppBrowser: /FBAN|FBAV|Instagram|Line\/|TikTok|; wv\)/i.test(ua),
  })
  let snapshot = compute()
  const emit = () => {
    const next = compute()
    if (JSON.stringify(next) === JSON.stringify(snapshot)) return
    snapshot = next
    for (const s of subscribers) s()
  }

  const onBeforeInstall = (e: Event) => {
    if (!isBeforeInstallPromptEvent(e)) return
    // Guarda para usar no clique; impede o aviso automático do navegador.
    e.preventDefault()
    deferred = e
    emit()
  }
  const onInstalled = () => {
    installedByEvent = true
    deferred = null
    emit()
  }
  const onMediaChange = () => emit()

  return {
    acquire() {
      users += 1
      if (users > 1) return
      win.addEventListener("beforeinstallprompt", onBeforeInstall)
      win.addEventListener("appinstalled", onInstalled)
      registered = 2
      for (const q of STANDALONE_QUERIES) {
        try {
          const mql = win.matchMedia?.(q)
          if (mql?.addEventListener && mql.removeEventListener) {
            mql.addEventListener("change", onMediaChange)
            const remove = mql.removeEventListener.bind(mql)
            mediaCleanups.push(() => remove("change", onMediaChange))
            registered += 1
          }
        } catch {
          /* matchMedia indisponível: segue sem ouvir mudança de modo */
        }
      }
      emit()
    },
    release() {
      if (users === 0) return
      users -= 1
      if (users > 0) return
      win.removeEventListener("beforeinstallprompt", onBeforeInstall)
      win.removeEventListener("appinstalled", onInstalled)
      for (const c of mediaCleanups.splice(0)) c()
      registered = 0
    },
    getSnapshot: () => snapshot,
    subscribe(listener) {
      subscribers.add(listener)
      return () => {
        subscribers.delete(listener)
      }
    },
    promptInstall() {
      if (prompting) return prompting
      const event = deferred
      if (!event) return Promise.resolve<InstallOutcome>("unavailable")
      // O evento só pode ser usado uma vez.
      deferred = null
      prompting = (async (): Promise<InstallOutcome> => {
        try {
          await event.prompt()
          const choice = await event.userChoice
          return choice.outcome === "accepted" ? "accepted" : "dismissed"
        } catch {
          return "unavailable"
        } finally {
          prompting = null
          emit()
        }
      })()
      emit()
      return prompting
    },
    listenerCount: () => registered,
  }
}

// ─── Instância única no navegador ───────────────────────────────────────────

let browserController: InstallController | null = null

/** Controle compartilhado da página (null no servidor). */
export function getBrowserInstallController(): InstallController | null {
  if (typeof window === "undefined") return null
  browserController ??= createInstallController(window as unknown as InstallWindowLike)
  return browserController
}

const SERVER_SNAPSHOT: InstallSnapshot = {
  installed: false, canPrompt: false, prompting: false, platform: "other", iosNonSafari: false, inAppBrowser: false,
}
export function serverInstallSnapshot(): InstallSnapshot {
  return SERVER_SNAPSHOT
}

/** O que o item do menu faz ao ser tocado. */
export type InstallAction = "hidden-installed" | "native-prompt" | "ios-instructions" | "browser-instructions"

export function resolveInstallAction(s: InstallSnapshot): InstallAction {
  if (s.installed) return "hidden-installed"
  if (s.canPrompt) return "native-prompt"
  if (s.platform === "ios") return "ios-instructions"
  return "browser-instructions"
}
