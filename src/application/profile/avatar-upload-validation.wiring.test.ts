import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/**
 * Fase G2.6.1 — correção de segurança. Confirma estaticamente que
 * uploadAvatarAction (profile.action.ts) de fato chama a validação de
 * avatar-validation.ts ANTES de qualquer upload para o Supabase Storage —
 * garantindo que um tipo rejeitado nunca chega a ser enviado ao bucket nem
 * salvo como fallback na tabela profiles. O comportamento funcional em si
 * (JPEG/PNG/WebP válidos, MIME falso, extensão falsa, tipo não permitido) é
 * coberto por avatar-validation.test.ts.
 */
describe("Fase G2.6.1 — uploadAvatarAction está conectado à validação de magic bytes/allowlist", () => {
  const content = fs.readFileSync(
    path.join(process.cwd(), "src", "application", "profile", "profile.action.ts"),
    "utf-8",
  )

  it("importa validateAvatarUpload e extensionForAvatarMime de ./avatar-validation", () => {
    assert.match(content, /import\s*\{\s*extensionForAvatarMime,\s*validateAvatarUpload\s*\}\s*from\s*"\.\/avatar-validation"/)
  })

  it("o bucket/path do Supabase Storage (avatars/<user.id>/avatar.<ext>) não foi alterado", () => {
    assert.match(content, /\.from\("avatars"\)/)
    assert.match(content, /`\$\{user\.id\}\/avatar\.\$\{ext\}`/)
  })

  it("chama validateAvatarUpload ANTES do upload para o Storage, e retorna erro quando a validação falha", () => {
    const uploadFnIdx = content.indexOf("export async function uploadAvatarAction")
    assert.ok(uploadFnIdx >= 0)
    const body = content.slice(uploadFnIdx)

    const validateIdx = body.indexOf("validateAvatarUpload(")
    const storageUploadIdx = body.indexOf(".storage")
    assert.ok(validateIdx >= 0, "deveria chamar validateAvatarUpload")
    assert.ok(storageUploadIdx >= 0, "deveria chamar o Storage")
    assert.ok(validateIdx < storageUploadIdx, "a validação deve ocorrer antes do upload ao Storage")

    assert.match(body, /if \(!validation\.ok \|\| !validation\.mime\)\s*\{\s*return \{ success: false, error:/)
  })

  it("já não deriva mais o MIME confiando apenas na string da data: URL (sem checagem de magic bytes)", () => {
    const uploadFnIdx = content.indexOf("export async function uploadAvatarAction")
    const nextFnIdx = content.indexOf("export async function", uploadFnIdx + 10)
    const body = content.slice(uploadFnIdx, nextFnIdx === -1 ? content.length : nextFnIdx)
    // Antes da correção, o ext vinha direto de mime.split("/")[1] — sem
    // allowlist nem verificação do conteúdo. Isso não deve mais existir.
    assert.doesNotMatch(body, /mime\.split\("\/"\)\[1\]/)
  })
})
