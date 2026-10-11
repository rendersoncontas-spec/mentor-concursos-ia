import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { describe, it } from "node:test"

import {
  createInstallController,
  detectPlatform,
  getBrowserInstallController,
  isRunningStandalone,
  resolveInstallAction,
  serverInstallSnapshot,
  type InstallWindowLike,
} from "./install-prompt"

// UX-PWA-01 — instalação do NomeIA (sem navegador real: janela e eventos falsos).

const UA = {
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36",
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/128.0 Mobile/15E148 Safari/604.1",
  ipadOS: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  desktopFirefox: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0",
  instagramAndroid: "Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/128.0 Mobile Safari/537.36 Instagram 300.0",
}

class FakeMedia {
  matches: boolean
  listeners = new Set<() => void>()
  constructor(matches: boolean) {
    this.matches = matches
  }
  addEventListener(_t: "change", l: () => void) {
    this.listeners.add(l)
  }
  removeEventListener(_t: "change", l: () => void) {
    this.listeners.delete(l)
  }
}

class FakeWindow extends EventTarget implements InstallWindowLike {
  adds = 0
  removes = 0
  media = new Map<string, FakeMedia>()
  navigator: InstallWindowLike["navigator"]
  constructor(ua: string, opts: { standaloneMedia?: boolean; navStandalone?: boolean; platform?: string; touch?: number } = {}) {
    super()
    this.navigator = { userAgent: ua, platform: opts.platform ?? "Linux", maxTouchPoints: opts.touch ?? 0, ...(opts.navStandalone !== undefined ? { standalone: opts.navStandalone } : {}) }
    for (const q of ["(display-mode: standalone)", "(display-mode: fullscreen)", "(display-mode: minimal-ui)"]) {
      this.media.set(q, new FakeMedia(q === "(display-mode: standalone)" && opts.standaloneMedia === true))
    }
  }
  override addEventListener(type: string, l: (e: Event) => void) {
    this.adds += 1
    super.addEventListener(type, l)
  }
  override removeEventListener(type: string, l: (e: Event) => void) {
    this.removes += 1
    super.removeEventListener(type, l)
  }
  matchMedia = (q: string) => this.media.get(q) ?? new FakeMedia(false)
}

class FakeBeforeInstallPrompt extends Event {
  prompted = 0
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
  constructor(outcome: "accepted" | "dismissed", private readonly fail = false) {
    super("beforeinstallprompt", { cancelable: true })
    this.userChoice = Promise.resolve({ outcome })
  }
  prompt() {
    this.prompted += 1
    return this.fail ? Promise.reject(new Error("NotAllowedError")) : Promise.resolve()
  }
}

function setup(ua = UA.androidChrome, opts: ConstructorParameters<typeof FakeWindow>[1] = {}) {
  const win = new FakeWindow(ua, opts)
  const c = createInstallController(win)
  c.acquire()
  let notified = 0
  c.subscribe(() => {
    notified += 1
  })
  return { win, c, notified: () => notified }
}

describe("UX-PWA-01 — Android e navegadores com beforeinstallprompt", () => {
  it("evento recebido: guardado (sem aviso automático do navegador) e o item passa a abrir o prompt nativo", () => {
    const { win, c, notified } = setup()
    assert.equal(c.getSnapshot().canPrompt, false)
    const e = new FakeBeforeInstallPrompt("accepted")
    win.dispatchEvent(e)
    assert.equal(e.defaultPrevented, true, "preventDefault: nada abre sozinho")
    assert.equal(e.prompted, 0, "o prompt NÃO é chamado automaticamente")
    assert.equal(c.getSnapshot().canPrompt, true)
    assert.equal(resolveInstallAction(c.getSnapshot()), "native-prompt")
    assert.ok(notified() >= 1)
  })

  it("prompt aceito: chama o prompt uma vez; NÃO marca instalado antes do appinstalled", async () => {
    const { win, c } = setup()
    const e = new FakeBeforeInstallPrompt("accepted")
    win.dispatchEvent(e)
    assert.equal(await c.promptInstall(), "accepted")
    assert.equal(e.prompted, 1)
    assert.equal(c.getSnapshot().installed, false, "aceitar ≠ instalado")
    assert.equal(c.getSnapshot().canPrompt, false, "o evento só pode ser usado uma vez")
    win.dispatchEvent(new Event("appinstalled"))
    assert.equal(c.getSnapshot().installed, true)
    assert.equal(resolveInstallAction(c.getSnapshot()), "hidden-installed")
  })

  it("prompt cancelado: 'dismissed', sem instalar; se o navegador oferecer de novo, volta a ficar disponível", async () => {
    const { win, c } = setup()
    win.dispatchEvent(new FakeBeforeInstallPrompt("dismissed"))
    assert.equal(await c.promptInstall(), "dismissed")
    assert.equal(c.getSnapshot().installed, false)
    assert.equal(c.getSnapshot().canPrompt, false)
    win.dispatchEvent(new FakeBeforeInstallPrompt("accepted"))
    assert.equal(c.getSnapshot().canPrompt, true)
  })

  it("toque duplo: um único prompt nativo; durante a escolha o estado indica 'prompting'", async () => {
    const { win, c } = setup()
    const e = new FakeBeforeInstallPrompt("accepted")
    win.dispatchEvent(e)
    const p1 = c.promptInstall()
    assert.equal(c.getSnapshot().prompting, true)
    const p2 = c.promptInstall()
    assert.equal(p1, p2)
    await p1
    assert.equal(e.prompted, 1)
    assert.equal(c.getSnapshot().prompting, false)
  })

  it("prompt falha (navegador recusa) → 'unavailable' (a tela cai nas instruções)", async () => {
    const { win, c } = setup()
    win.dispatchEvent(new FakeBeforeInstallPrompt("accepted", true))
    assert.equal(await c.promptInstall(), "unavailable")
  })

  it("navegador sem suporte (evento nunca vem): instruções do navegador, nunca 'instalado'", async () => {
    for (const ua of [UA.androidChrome, UA.desktopFirefox]) {
      const { c } = setup(ua)
      assert.equal(resolveInstallAction(c.getSnapshot()), "browser-instructions")
      assert.equal(await c.promptInstall(), "unavailable")
      assert.equal(c.getSnapshot().installed, false)
    }
  })

  it("evento sem prompt() (objeto estranho) é ignorado", () => {
    const { win, c } = setup()
    win.dispatchEvent(new Event("beforeinstallprompt"))
    assert.equal(c.getSnapshot().canPrompt, false)
  })

  it("navegador embutido (Instagram/WebView) é sinalizado para orientar abrir no navegador", () => {
    assert.equal(setup(UA.instagramAndroid).c.getSnapshot().inAppBrowser, true)
    assert.equal(setup(UA.androidChrome).c.getSnapshot().inAppBrowser, false)
  })
})

describe("UX-PWA-01 — iPhone e iPad", () => {
  it("iPhone/iPad (inclusive iPadOS que se diz Mac): instruções do Compartilhar, nunca prompt", () => {
    assert.equal(detectPlatform({ userAgent: UA.iphoneSafari }), "ios")
    assert.equal(detectPlatform({ userAgent: UA.ipadOS, platform: "MacIntel", maxTouchPoints: 5 }), "ios")
    assert.equal(detectPlatform({ userAgent: UA.ipadOS, platform: "MacIntel", maxTouchPoints: 0 }), "other", "Mac de verdade")
    const { c } = setup(UA.iphoneSafari, { platform: "iPhone" })
    assert.equal(resolveInstallAction(c.getSnapshot()), "ios-instructions")
    assert.equal(c.getSnapshot().iosNonSafari, false)
  })
  it("Chrome/Firefox no iOS: indica sugerir o Safari se a opção não aparecer", () => {
    assert.equal(setup(UA.iphoneChrome).c.getSnapshot().iosNonSafari, true)
  })
})

describe("UX-PWA-01 — já instalado", () => {
  it("display-mode standalone ou navigator.standalone → instalado (item vira 'Aplicativo instalado')", () => {
    assert.equal(setup(UA.androidChrome, { standaloneMedia: true }).c.getSnapshot().installed, true)
    assert.equal(setup(UA.iphoneSafari, { navStandalone: true }).c.getSnapshot().installed, true)
    assert.equal(resolveInstallAction(setup(UA.iphoneSafari, { navStandalone: true }).c.getSnapshot()), "hidden-installed")
  })
  it("user-agent sozinho nunca decide 'instalado'", () => {
    for (const ua of Object.values(UA)) assert.equal(isRunningStandalone(new FakeWindow(ua)), false, ua)
  })
  it("mudança de display-mode é ouvida e atualiza o estado", () => {
    const { win, c } = setup()
    const media = win.media.get("(display-mode: standalone)")
    assert.ok(media)
    if (!media) return
    media.matches = true
    for (const l of media.listeners) l()
    assert.equal(c.getSnapshot().installed, true)
  })
  it("appinstalled descarta o prompt guardado", () => {
    const { win, c } = setup()
    win.dispatchEvent(new FakeBeforeInstallPrompt("accepted"))
    win.dispatchEvent(new Event("appinstalled"))
    assert.equal(c.getSnapshot().canPrompt, false)
    assert.equal(c.getSnapshot().installed, true)
  })
})

describe("UX-PWA-01 — ciclo de vida dos ouvintes", () => {
  it("vários usuários (raiz + menu): ouvintes registrados UMA vez", () => {
    const win = new FakeWindow(UA.androidChrome)
    const c = createInstallController(win)
    c.acquire()
    c.acquire()
    c.acquire()
    assert.equal(win.adds, 2, "beforeinstallprompt + appinstalled, uma vez cada")
    assert.equal(c.listenerCount(), 5, "2 da janela + 3 de display-mode")
  })
  it("limpeza: só no último release; depois disso eventos são ignorados", () => {
    const win = new FakeWindow(UA.androidChrome)
    const c = createInstallController(win)
    c.acquire()
    c.acquire()
    c.release()
    assert.equal(win.removes, 0)
    c.release()
    assert.equal(win.removes, 2)
    assert.equal(c.listenerCount(), 0)
    for (const m of win.media.values()) assert.equal(m.listeners.size, 0)
    win.dispatchEvent(new FakeBeforeInstallPrompt("accepted"))
    assert.equal(c.getSnapshot().canPrompt, false)
    c.release()
    assert.equal(win.removes, 2, "release extra não faz nada")
  })
  it("snapshot estável (mesmo objeto) quando nada muda — compatível com useSyncExternalStore", () => {
    const { c } = setup()
    assert.equal(c.getSnapshot(), c.getSnapshot())
  })
  it("no servidor não há controle; o snapshot do servidor é fixo e não oferece instalação", () => {
    assert.equal(typeof window, "undefined")
    assert.equal(getBrowserInstallController(), null)
    assert.equal(serverInstallSnapshot(), serverInstallSnapshot())
    assert.equal(serverInstallSnapshot().canPrompt, false)
  })
})

// ─── Integração (fonte): menu, modal, manifest, sem Service Worker ──────────

const read = (p: string) => readFileSync(p, "utf8")

describe("UX-PWA-01 — menu da conta, modal, manifest e preservação", () => {
  const header = read("src/components/layout/header.tsx")

  it("item fica logo após 'Editais cadastrados' e antes do bloco mobile/'Sair'; demais itens intactos", () => {
    const editais = header.indexOf("Editais cadastrados")
    const item = header.indexOf("<InstallAppMenuItem")
    const tema = header.indexOf("Opções mobile: Tema e Ajuda")
    const sair = header.indexOf("Opção 5: Sair")
    assert.ok(editais > 0 && item > editais && item < tema && tema < sair)
    for (const t of ["Minha conta", "Minha assinatura", "Pedir um edital", "Editais cadastrados", "Alternar tema", "Ajuda e suporte", "Sair"]) {
      assert.ok(header.includes(t), t)
    }
    assert.equal((header.match(/role="menuitem"/g) ?? []).length, 7, "itens existentes não mudaram")
  })

  it("item: texto 'Instalar aplicativo', ícone do lucide, role menuitem, fecha o menu; instalado → 'Aplicativo instalado'", () => {
    const item = read("src/components/pwa/install-app-menu-item.tsx")
    assert.match(item, /Instalar aplicativo/)
    assert.match(item, /Aplicativo instalado/)
    assert.match(item, /import \{ CircleCheck, Smartphone \} from "lucide-react"/)
    assert.match(item, /role="menuitem"/)
    assert.match(item, /onCloseMenu\(\)/)
    assert.match(item, /type="button"/)
    assert.doesNotMatch(item, /toast\.success/, "aceitar o prompt não é anunciado como instalado")
  })

  it("só o appinstalled gera o aviso de sucesso (captura montada nos Providers)", () => {
    assert.match(read("src/components/providers.tsx"), /<PwaInstallCapture \/>/)
    const cap = read("src/components/pwa/pwa-install-capture.tsx")
    assert.match(cap, /if \(!wasInstalled\.current && snapshot\.installed\)/)
  })

  it("modal: título, passos numerados, 'Entendi', descrição, altura limitada, sem emoji e sem afirmar instalação", () => {
    const dlg = read("src/components/pwa/install-app-dialog.tsx")
    assert.match(dlg, /Adicione o NomeIA à tela inicial/)
    assert.match(dlg, /<ol /)
    assert.match(dlg, /Entendi/)
    assert.match(dlg, /DialogDescription/)
    assert.match(dlg, /max-h-\[85dvh\][^"]*overflow-y-auto/)
    assert.match(dlg, /Compartilhar/)
    assert.match(dlg, /Adicionar à Tela de Início/)
    assert.match(dlg, /Safari/)
    assert.match(dlg, /O nome da opção varia\s+conforme o navegador/)
    assert.doesNotMatch(dlg, /\p{Extended_Pictographic}/u)
    assert.doesNotMatch(dlg, /foi instalado|instalado com sucesso|funciona offline|sem internet/i)
    assert.match(dlg, /continua precisando de internet/)
  })

  it("manifest único e válido para instalação; ícones oficiais existentes com o tamanho declarado", () => {
    const m = read("src/app/manifest.ts")
    for (const re of [/name: "NomeIA"/, /short_name: "NomeIA"/, /start_url: "\/dashboard"/, /scope: "\/"/, /display: "standalone"/]) assert.match(m, re)
    assert.equal(existsSync("public/manifest.json") || existsSync("public/manifest.webmanifest") || existsSync("public/site.webmanifest"), false, "sem segundo manifest")
    for (const [file, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["icon-maskable-192.png", 192], ["icon-maskable-512.png", 512]] as const) {
      assert.match(m, new RegExp(`/${file.replace(".", "\\.")}`))
      const buf = readFileSync(`public/${file}`)
      assert.equal(buf.readUInt32BE(16), size, file)
      assert.equal(buf.readUInt32BE(20), size, file)
    }
    assert.match(read("src/app/layout.tsx"), /appleWebApp: \{\s+capable: true,\s+title: "NomeIA"/)
  })

  it("manifest é público (não passa pela proteção de rotas) e não há Service Worker novo", () => {
    const routes = read("src/domain/auth/protected-routes.ts")
    assert.doesNotMatch(routes, /manifest/)
    const all = ["src/lib/pwa/install-prompt.ts", "src/lib/pwa/use-install-app.ts", "src/components/pwa/pwa-install-capture.tsx", "src/components/pwa/install-app-menu-item.tsx", "src/components/pwa/install-app-dialog.tsx"].map(read).join("\n")
    assert.doesNotMatch(all, /serviceWorker|caches\.|workbox/)
    assert.equal(existsSync("public/sw.js") || existsSync("public/service-worker.js"), false)
  })
})
