import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/**
 * Fase G2.6 — Casca Android (Capacitor) do NomeIA.
 *
 * Teste único de configuração (o brief pediu "não criar dezenas de testes").
 * Verifica só o que é estático e lível do repositório: capacitor.config.ts,
 * package.json e a config Android gerada — nunca abre o Android Studio nem
 * roda Gradle (isso é smoke test manual, documentado no relatório da fase).
 *
 * Decisão herdada da auditoria G2.5: a estratégia é "Remote Web" — o app
 * carrega a URL remota via `server.url`, configurável por
 * `CAPACITOR_SERVER_URL`, nunca hardcodada como "localhost" (que no Android
 * aponta para o próprio dispositivo, não para a máquina de desenvolvimento).
 */

const repoRoot = process.cwd()
const capacitorConfigSource = fs.readFileSync(path.join(repoRoot, "capacitor.config.ts"), "utf-8")
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf-8")) as {
  dependencies: Record<string, string>
  devDependencies: Record<string, string>
}

describe("Fase G2.6 — capacitor.config.ts", () => {
  it("usa o appId com.nomeia.concursos", () => {
    assert.match(capacitorConfigSource, /appId:\s*"com\.nomeia\.concursos"/)
  })

  it("usa o appName NomeIA", () => {
    assert.match(capacitorConfigSource, /appName:\s*"NomeIA"/)
  })

  it("resolve server.url a partir de CAPACITOR_SERVER_URL, não hardcodado", () => {
    assert.match(capacitorConfigSource, /process\.env\["CAPACITOR_SERVER_URL"\]/)
  })

  it("nunca hardcoda localhost na configuração do servidor (fora de comentários explicativos)", () => {
    // Remove comentários de linha antes de checar — o arquivo TEM comentários
    // que mencionam "localhost" para explicar por que ele NUNCA é usado como
    // valor. O que este teste proíbe é o uso real, não a palavra em prosa.
    const withoutLineComments = capacitorConfigSource
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, ""))
      .join("\n")
    assert.doesNotMatch(withoutLineComments, /localhost/i)
  })

  it("cleartext só é ligado quando a própria URL configurada for http:// (nunca um valor fixo true)", () => {
    assert.match(capacitorConfigSource, /isHttpDevUrl\s*=\s*serverUrl\?\.startsWith\("http:\/\/"\)/)
    assert.doesNotMatch(capacitorConfigSource, /cleartext:\s*true/)
  })

  it("androidScheme é https (nunca http)", () => {
    assert.match(capacitorConfigSource, /androidScheme:\s*"https"/)
  })
})

describe("Fase G2.6 — pacotes instalados são só os 3 pacotes base, versão estável", () => {
  it("@capacitor/core e @capacitor/android em dependencies, @capacitor/cli em devDependencies", () => {
    assert.ok(packageJson.dependencies["@capacitor/core"], "@capacitor/core ausente em dependencies")
    assert.ok(packageJson.dependencies["@capacitor/android"], "@capacitor/android ausente em dependencies")
    assert.ok(packageJson.devDependencies["@capacitor/cli"], "@capacitor/cli ausente em devDependencies")
  })

  it("nenhuma versão instalada é next/alpha/beta/dev/nightly", () => {
    const versions = [
      packageJson.dependencies["@capacitor/core"],
      packageJson.dependencies["@capacitor/android"],
      packageJson.devDependencies["@capacitor/cli"],
    ]
    for (const v of versions) {
      assert.doesNotMatch(v ?? "", /alpha|beta|dev|nightly|next/i)
    }
  })

  it("nenhum plugin Capacitor extra foi instalado nesta fase (browser/app/filesystem/etc.)", () => {
    const forbidden = [
      "@capacitor/browser",
      "@capacitor/app",
      "@capacitor/filesystem",
      "@capacitor/share",
      "@capacitor/haptics",
      "@capacitor/push-notifications",
      "@capacitor/local-notifications",
      "@capacitor/camera",
      "@capacitor/geolocation",
      "@capacitor/splash-screen",
      "@capacitor/status-bar",
    ]
    for (const pkg of forbidden) {
      assert.ok(!packageJson.dependencies[pkg], `${pkg} não deveria estar instalado nesta fase`)
      assert.ok(!packageJson.devDependencies[pkg], `${pkg} não deveria estar instalado nesta fase`)
    }
  })
})

describe("Fase G2.6 — Android gerado não contém segredo nenhum", () => {
  const androidDir = path.join(repoRoot, "android")
  const forbiddenPatterns = [/SERVICE_ROLE/i, /RESEND_API_KEY/i, /SUPABASE_SERVICE/i]

  function walk(dir: string): string[] {
    const out: string[] = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "build" || entry.name === ".gradle") continue // artefatos de build, não código-fonte
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) out.push(...walk(full))
      else if (/\.(xml|gradle|java|kt|properties|ts|json)$/.test(entry.name)) out.push(full)
    }
    return out
  }

  it("nenhum arquivo de configuração/código do projeto android/ contém SERVICE_ROLE/RESEND_API_KEY", () => {
    const files = walk(androidDir)
    assert.ok(files.length > 0, "pasta android/ não encontrada ou vazia — rodou `npx cap add android`?")
    for (const file of files) {
      const content = fs.readFileSync(file, "utf-8")
      for (const pattern of forbiddenPatterns) {
        assert.doesNotMatch(content, pattern, `${file} não deveria conter ${pattern}`)
      }
    }
  })

  it("AndroidManifest.xml só pede a permissão INTERNET (nenhuma permissão não usada)", () => {
    const manifest = fs.readFileSync(path.join(androidDir, "app/src/main/AndroidManifest.xml"), "utf-8")
    const permissions = [...manifest.matchAll(/<uses-permission\s+android:name="([^"]+)"/g)].map((m) => m[1])
    assert.deepEqual(permissions, ["android.permission.INTERNET"])
  })

  it("compileSdk/targetSdk = 36 (API 36, exigência atual do Google Play)", () => {
    const variables = fs.readFileSync(path.join(androidDir, "variables.gradle"), "utf-8")
    assert.match(variables, /compileSdkVersion\s*=\s*36/)
    assert.match(variables, /targetSdkVersion\s*=\s*36/)
  })
})
