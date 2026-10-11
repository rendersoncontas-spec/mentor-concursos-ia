import type { Page } from "@playwright/test"

/**
 * G2.20 — simulação CONTROLADA dos sinais de instalação do navegador.
 * Isto NÃO é a instalação real: só dispara os mesmos eventos que o Chrome
 * dispara (beforeinstallprompt/appinstalled) e simula display-mode. A janela
 * nativa do sistema não é automatizada.
 */
export interface PwaProbeOptions {
  standalone?: boolean
  navigatorStandalone?: boolean
}

export async function installPwaProbe(page: Page, opts: PwaProbeOptions = {}) {
  await page.addInitScript((o: PwaProbeOptions) => {
    type Probe = { adds: number; removes: number; prompts: string[] }
    const w = window as unknown as { __pwa: Probe }
    w.__pwa = { adds: 0, removes: 0, prompts: [] }
    const add = window.addEventListener.bind(window)
    const remove = window.removeEventListener.bind(window)
    window.addEventListener = ((type: string, l: EventListenerOrEventListenerObject, opt?: boolean | AddEventListenerOptions) => {
      if (type === "beforeinstallprompt") w.__pwa.adds += 1
      return add(type, l, opt)
    }) as typeof window.addEventListener
    window.removeEventListener = ((type: string, l: EventListenerOrEventListenerObject, opt?: boolean | EventListenerOptions) => {
      if (type === "beforeinstallprompt") w.__pwa.removes += 1
      return remove(type, l, opt)
    }) as typeof window.removeEventListener
    if (o.standalone) {
      const original = window.matchMedia.bind(window)
      window.matchMedia = ((q: string) => {
        if (!q.includes("display-mode: standalone")) return original(q)
        // Objeto simples: as propriedades do MediaQueryList real são só-leitura.
        return {
          matches: true,
          media: q,
          onchange: null,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
          dispatchEvent: () => false,
        } as unknown as MediaQueryList
      }) as typeof window.matchMedia
    }
    if (o.navigatorStandalone) Object.defineProperty(Navigator.prototype, "standalone", { get: () => true, configurable: true })
  }, opts)
}

/** Espera o app registrar o ouvinte de beforeinstallprompt (hidratação concluída). */
export async function waitForInstallListener(page: Page) {
  await page.waitForFunction(() => {
    const p = (window as unknown as { __pwa?: { adds: number; removes: number } }).__pwa
    return !!p && p.adds - p.removes >= 1
  })
}

export async function activeInstallListeners(page: Page): Promise<number> {
  return page.evaluate(() => {
    const p = (window as unknown as { __pwa: { adds: number; removes: number } }).__pwa
    return p.adds - p.removes
  })
}

export async function promptCalls(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { __pwa: { prompts: string[] } }).__pwa.prompts)
}

/** Dispara um beforeinstallprompt simulado; `outcome` é a escolha que o "usuário" fará. */
export async function fireBeforeInstallPrompt(page: Page, outcome: "accepted" | "dismissed", id = "evento-1") {
  await page.evaluate(
    ({ outcome: o, id: i }) => {
      const w = window as unknown as { __pwa: { prompts: string[] } }
      const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> }
      e.prompt = () => {
        w.__pwa.prompts.push(i)
        return Promise.resolve()
      }
      e.userChoice = Promise.resolve({ outcome: o, platform: "web" })
      window.dispatchEvent(e)
    },
    { outcome, id },
  )
}

export async function fireAppInstalled(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")))
}

export const USER_AGENTS = {
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1",
  instagramAndroid: "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/141.0 Mobile Safari/537.36 Instagram 350.0",
} as const
