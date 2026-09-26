// ============================================================================
// Fase I.3 — o e-mail de lembrete não promete recurso que o produto não tem.
//
// O texto do caso "pending_review" dizia que havia "N flashcards/tópicos"
// aguardando revisão. Cartões de memorização não existem no NomeIA: a revisão
// cobre tópicos e subtópicos do edital. Este e-mail hoje não tem nenhum
// disparador (sendStudyReminderEmail não é chamada por ninguém), então a
// correção é só de texto — nada de envio, nada de integração com Revisões.
// ============================================================================

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

import { getStudyReminderEmailTemplate, getWelcomeEmailTemplate } from "@/infrastructure/email/email.templates"

const APP_URL = "https://app.nomeia.test"

function reminder(details: Parameters<typeof getStudyReminderEmailTemplate>[0]["details"]) {
  return getStudyReminderEmailTemplate({ name: "Renderson", details, appUrl: APP_URL })
}

describe("Lembrete de revisão — texto fiel ao que existe", () => {
  it("não menciona cartões de memorização em nenhuma parte do e-mail", () => {
    const { subject, html, text } = reminder({ reason: "pending_review", pendingCount: 7 })
    for (const part of [subject, html, text]) {
      assert.equal(/flashcard/i.test(part), false, "o e-mail não pode prometer flashcards")
    }
  })

  it("fala de tópicos do edital, a mesma terminologia da página de Revisões", () => {
    const { html } = reminder({ reason: "pending_review", pendingCount: 7 })
    assert.ok(html.includes("7 tópicos do edital"))
    assert.ok(html.includes("aguardando revisão"))
    assert.ok(html.includes(`${APP_URL}/dashboard/reviews`), "o botão leva à página de Revisões")
  })

  it("com um único item, o texto fica no singular", () => {
    const { subject, html } = reminder({ reason: "pending_review", pendingCount: 1 })
    assert.ok(html.includes("1 tópico do edital"))
    assert.ok(subject.includes("1 revisão pendente"))
  })

  it("sem contagem conhecida, não inventa número", () => {
    const { subject, html } = reminder({ reason: "pending_review" })
    assert.equal(/\d/.test(subject.replace(/[^\d]/g, "")), false, "o assunto não traz número inventado")
    assert.ok(html.includes("tópicos do edital"))
    assert.equal(html.includes("undefined"), false)
    assert.equal(/\balguns\b/.test(html), false, "nem número vago onde não há dado")
  })

  it("os outros motivos do lembrete continuam intactos", () => {
    assert.ok(reminder({ reason: "streak_protection" }).subject.includes("sequência"))
    assert.ok(
      reminder({ reason: "inactive_discipline", disciplineName: "Direito Penal", daysInactive: 5 }).subject.includes(
        "Direito Penal",
      ),
    )
    assert.ok(reminder({ reason: "daily_goal" }).html.includes(`${APP_URL}/dashboard/study-session`))
  })
})

describe("Nenhum template promete flashcards como recurso de revisão", () => {
  it("o e-mail de boas-vindas descreve Revisões pelo que ela é", () => {
    const { html } = getWelcomeEmailTemplate({ name: "Renderson", appUrl: APP_URL })
    assert.equal(/flashcard/i.test(html), false)
    assert.ok(html.includes("repetição espaçada"))
    assert.equal(
      html.includes("Revisões Inteligentes"),
      false,
      'o recurso se chama "Revisões" (regra de nomenclatura da Fase I.1)',
    )
  })

  it("o arquivo de templates não menciona flashcards em nenhum lugar", () => {
    const src = readFileSync(join(process.cwd(), "src/infrastructure/email/email.templates.ts"), "utf-8")
    assert.equal(/flashcard/i.test(src), false)
  })
})
