import { describe, it } from "node:test"
import assert from "node:assert/strict"

import {
  detectImageMimeFromMagicBytes,
  extensionForAvatarMime,
  isAllowedAvatarMime,
  validateAvatarUpload,
} from "./avatar-validation"

/**
 * Fase G2.6.1 — correção de segurança (achado P2 da auditoria
 * "Auditoria de Segurança — RLS / Supabase / Dependências — 2026-10-01"):
 * uploadAvatarAction (profile.action.ts) confiava apenas no MIME que vem
 * embutido na data: URL montada no navegador — valor totalmente controlado
 * pelo cliente — sem allowlist e sem conferir o conteúdo real do arquivo.
 *
 * Este teste cobre o módulo puro avatar-validation.ts (sem Supabase/Storage,
 * que esta base de testes não tem infraestrutura para mockar — mesma
 * limitação documentada em admin-guard.test.ts) com os 4 cenários exigidos
 * pela fase: JPEG/PNG/WebP válidos, MIME falso, extensão falsa e tipo não
 * permitido.
 */

function bytes(...values: number[]): Buffer {
  return Buffer.from(values)
}

const REAL_JPEG_HEADER = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46)
const REAL_PNG_HEADER = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d)
const REAL_WEBP_HEADER = Buffer.concat([
  bytes(0x52, 0x49, 0x46, 0x46), // "RIFF"
  bytes(0x00, 0x01, 0x02, 0x03), // tamanho (irrelevante para a detecção)
  bytes(0x57, 0x45, 0x42, 0x50), // "WEBP"
])

describe("Fase G2.6.1 — detectImageMimeFromMagicBytes (assinatura binária real, não o MIME declarado)", () => {
  it("reconhece JPEG real (FF D8 FF)", () => {
    assert.equal(detectImageMimeFromMagicBytes(REAL_JPEG_HEADER), "image/jpeg")
  })

  it("reconhece PNG real (89 50 4E 47 0D 0A 1A 0A)", () => {
    assert.equal(detectImageMimeFromMagicBytes(REAL_PNG_HEADER), "image/png")
  })

  it("reconhece WebP real (RIFF....WEBP)", () => {
    assert.equal(detectImageMimeFromMagicBytes(REAL_WEBP_HEADER), "image/webp")
  })

  it("não reconhece conteúdo arbitrário (ex.: texto/SVG/HTML) como imagem", () => {
    const svgDisguisedAsImage = Buffer.from("<svg onload=alert(1)></svg>", "utf-8")
    assert.equal(detectImageMimeFromMagicBytes(svgDisguisedAsImage), null)
  })

  it("não reconhece buffer vazio ou curto demais", () => {
    assert.equal(detectImageMimeFromMagicBytes(Buffer.alloc(0)), null)
    assert.equal(detectImageMimeFromMagicBytes(bytes(0xff, 0xd8)), null)
  })
})

describe("Fase G2.6.1 — isAllowedAvatarMime / extensionForAvatarMime (allowlist mínima)", () => {
  it("permite exatamente image/jpeg, image/png e image/webp", () => {
    assert.equal(isAllowedAvatarMime("image/jpeg"), true)
    assert.equal(isAllowedAvatarMime("image/png"), true)
    assert.equal(isAllowedAvatarMime("image/webp"), true)
  })

  it("rejeita tipos não permitidos (svg, html, pdf, executável, gif)", () => {
    for (const mime of ["image/svg+xml", "text/html", "application/pdf", "application/x-msdownload", "image/gif", ""]) {
      assert.equal(isAllowedAvatarMime(mime), false, `deveria rejeitar ${mime}`)
    }
  })

  it("mapeia cada MIME permitido para a extensão de arquivo correta", () => {
    assert.equal(extensionForAvatarMime("image/jpeg"), "jpg")
    assert.equal(extensionForAvatarMime("image/png"), "png")
    assert.equal(extensionForAvatarMime("image/webp"), "webp")
  })
})

describe("Fase G2.6.1 — validateAvatarUpload (requisito: JPEG/PNG/WebP válidos passam; MIME falso, extensão falsa e tipo não permitido são rejeitados)", () => {
  it("aceita um JPEG real declarado como image/jpeg", () => {
    const result = validateAvatarUpload("image/jpeg", REAL_JPEG_HEADER)
    assert.equal(result.ok, true)
    assert.equal(result.mime, "image/jpeg")
  })

  it("aceita um PNG real declarado como image/png", () => {
    const result = validateAvatarUpload("image/png", REAL_PNG_HEADER)
    assert.equal(result.ok, true)
    assert.equal(result.mime, "image/png")
  })

  it("aceita um WebP real declarado como image/webp", () => {
    const result = validateAvatarUpload("image/webp", REAL_WEBP_HEADER)
    assert.equal(result.ok, true)
    assert.equal(result.mime, "image/webp")
  })

  it("rejeita tipo não permitido mesmo com MIME e conteúdo consistentes entre si (ex.: SVG)", () => {
    const svgContent = Buffer.from("<svg onload=alert(1)></svg>", "utf-8")
    const result = validateAvatarUpload("image/svg+xml", svgContent)
    assert.equal(result.ok, false)
    assert.ok(result.error)
  })

  it("rejeita MIME falso: cliente declara image/png mas o conteúdo real é um JPEG", () => {
    const result = validateAvatarUpload("image/png", REAL_JPEG_HEADER)
    assert.equal(result.ok, false)
    assert.ok(result.error)
  })

  it("rejeita extensão/tipo falso: cliente declara image/jpeg mas o conteúdo é HTML/script disfarçado", () => {
    const maliciousContent = Buffer.from("<html><script>alert(document.cookie)</script></html>", "utf-8")
    const result = validateAvatarUpload("image/jpeg", maliciousContent)
    assert.equal(result.ok, false)
    assert.ok(result.error)
  })

  it("rejeita quando o MIME declarado está vazio ou ausente", () => {
    const result = validateAvatarUpload("", REAL_PNG_HEADER)
    assert.equal(result.ok, false)
  })
})
