import type { CapacitorConfig } from "@capacitor/cli"

// Fase G2.6 — Casca Android (Capacitor) do NomeIA.
//
// Decisão herdada da auditoria G2.5 (claude/fase-g2-5-auditoria-android-capacitor-2026-10-01.md):
// o NomeIA usa Server Actions, um proxy de autenticação por requisição e um
// Route Handler de OAuth — nada disso sobrevive fora de um servidor Next.js
// de verdade. Por isso esta é a estratégia "Remote Web": o WebView do
// Android carrega a URL HTTPS real do app, e tudo continua rodando no
// servidor exatamente como roda hoje no navegador. NÃO é um export estático.
//
// `webDir: "capacitor-www"` aponta para um placeholder minúsculo
// (capacitor-www/index.html) que existe só porque a ferramenta Capacitor
// exige um webDir válido para inicializar o projeto — ele só aparece na tela
// se, por algum motivo, a navegação para `server.url` falhar antes de
// começar. O conteúdo real do app nunca vem desse diretório.
//
// `server.url` é configurável via variável de ambiente
// `CAPACITOR_SERVER_URL`, resolvida em build-time (quando `npx cap sync`
// roda). Propositalmente NUNCA hardcoda "localhost": no Android,
// "localhost" dentro do WebView aponta para o próprio dispositivo/emulador,
// não para a máquina onde o `next dev` está rodando. Ver
// claude/fase-g2-6-android-capacitor-implementacao-2026-10-01.md, seção 9,
// para o valor usado em cada ambiente (emulador: 10.0.2.2; dispositivo
// físico: IP da máquina na mesma rede; produção: URL HTTPS real).
//
// Sem CAPACITOR_SERVER_URL definida, o app abre só o placeholder local —
// comportamento esperado enquanto não houver uma URL de desenvolvimento ou
// produção configurada (ver seção 39 do brief G2.6).
const serverUrl = process.env["CAPACITOR_SERVER_URL"]?.trim() || undefined

// Cleartext (HTTP sem TLS) só é permitido quando a própria URL configurada
// for HTTP — nunca como padrão, e nunca junto com uma URL HTTPS (seção 8 do
// brief: "não misturar os dois"). Isso cobre o caso de desenvolvimento local
// (`http://10.0.2.2:3000` ou o IP da máquina na rede) sem abrir uma
// exceção de segurança desnecessária para produção.
const isHttpDevUrl = serverUrl?.startsWith("http://") ?? false

const config: CapacitorConfig = {
  appId: "com.nomeia.concursos",
  appName: "NomeIA",
  webDir: "capacitor-www",
  server: {
    ...(serverUrl ? { url: serverUrl } : {}),
    androidScheme: "https",
    cleartext: isHttpDevUrl,
  },
}

export default config
