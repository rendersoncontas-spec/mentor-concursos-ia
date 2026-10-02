/**
 * Fase G2.6.1 — correção de segurança (achado P2 da auditoria
 * "Auditoria de Segurança — RLS / Supabase / Dependências — 2026-10-01"):
 * uploadAvatarAction confiava apenas no MIME embutido na data: URL montada
 * no navegador (`data:<mime>;base64,<...>`) — um valor 100% controlado pelo
 * cliente, sem nenhuma allowlist nem verificação do conteúdo real do
 * arquivo. Um usuário podia enviar qualquer tipo de arquivo (ex.: .svg com
 * script embutido, .html, um binário arbitrário) rotulado como
 * "image/png" e ele seguiria para o Supabase Storage.
 *
 * Este módulo é puro (sem I/O, sem Supabase) para ser testável em isolado:
 * exige que (a) o MIME declarado esteja em uma allowlist mínima de imagens
 * e (b) os magic bytes do início do arquivo (a assinatura binária real)
 * correspondam exatamente a esse mesmo tipo. Rejeita qualquer um dos dois
 * falhando — nunca confia isoladamente no MIME informado pelo cliente.
 *
 * Mantém intencionalmente apenas os 3 formatos já aceitos implicitamente
 * pela UI de upload de avatar (ver biblioteca de preview/crop de imagem do
 * perfil): JPEG, PNG e WebP.
 */

export type AllowedAvatarMime = "image/jpeg" | "image/png" | "image/webp"

const ALLOWED_AVATAR_MIME_TYPES: readonly AllowedAvatarMime[] = ["image/jpeg", "image/png", "image/webp"]

const MIME_TO_EXTENSION: Record<AllowedAvatarMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

export function isAllowedAvatarMime(mime: string): mime is AllowedAvatarMime {
  return (ALLOWED_AVATAR_MIME_TYPES as readonly string[]).includes(mime)
}

export function extensionForAvatarMime(mime: AllowedAvatarMime): string {
  return MIME_TO_EXTENSION[mime]
}

/**
 * Detecta o tipo real de uma imagem pelos magic bytes (assinatura binária
 * nos primeiros bytes do arquivo), nunca pelo MIME declarado pelo cliente.
 * Retorna null quando a assinatura não corresponde a nenhum formato
 * permitido (inclui o caso de arquivo vazio/curto demais).
 */
export function detectImageMimeFromMagicBytes(buffer: Buffer): AllowedAvatarMime | null {
  // JPEG: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg"
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png"
  }

  // WebP: "RIFF" (bytes 0-3) + tamanho (bytes 4-7, ignorado) + "WEBP" (bytes 8-11)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp"
  }

  return null
}

export interface AvatarValidationResult {
  ok: boolean
  mime?: AllowedAvatarMime
  error?: string
}

/**
 * Valida um upload de avatar. Falha se o MIME declarado não estiver na
 * allowlist, se o conteúdo não tiver uma assinatura de imagem reconhecida,
 * ou se o MIME declarado não corresponder ao tipo real detectado pelos
 * magic bytes (ex.: extensão/MIME falsos).
 */
export function validateAvatarUpload(declaredMime: string, buffer: Buffer): AvatarValidationResult {
  if (!isAllowedAvatarMime(declaredMime)) {
    return { ok: false, error: `Tipo de arquivo não permitido para avatar: ${declaredMime || "desconhecido"}.` }
  }

  const sniffed = detectImageMimeFromMagicBytes(buffer)
  if (!sniffed) {
    return { ok: false, error: "Arquivo não reconhecido como imagem válida (JPEG, PNG ou WebP)." }
  }

  if (sniffed !== declaredMime) {
    return { ok: false, error: "O conteúdo do arquivo não corresponde ao tipo declarado." }
  }

  return { ok: true, mime: sniffed }
}
