import { describe, it } from "node:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"

/**
 * Testes de "wiring" para o achado de seguranca/ownership da Fase 5 da
 * auditoria de estabilizacao.
 *
 * ACHADO REAL: updateDisciplineStatusAction (src/application/disciplines/
 * update-status.action.ts) recebia "userId" como PARAMETRO DO CLIENTE e
 * repassava direto para o filtro .eq("user_id", userId) da query, em vez de
 * derivar o usuario autenticado no servidor via getEffectiveUserId(supabase)
 * como faz toda a outra ~30 Server Actions auditadas nesta fase. A funcao
 * nao tinha nenhum caller em src/ nesta sessao (nao esta com regressao
 * ativa em producao hoje), e a RLS de user_disciplines (auth.uid() =
 * user_id, ver docs/sprint3-database.sql) barra a escrita cruzada mesmo
 * que o app confiasse no valor errado — mas o app nao deveria depender so
 * da RLS aqui, e sim seguir o mesmo padrao de todo o resto do codigo.
 *
 * Corrigido: a funcao passou a receber so (userDisciplineId, status) e a
 * derivar o usuario com getEffectiveUserId(supabase). Fase G (limpeza): como
 * continuava sem nenhum chamador, o arquivo update-status.action.ts foi
 * removido — e o teste especifico dele junto; a regra geral abaixo continua
 * valendo para todas as Server Actions de mutacao que existem.
 *
 * Este arquivo tambem guarda, por amostragem, que outras Server Actions
 * de mutacao (delete/update) continuam derivando o usuario no servidor em
 * vez de aceitar um userId do cliente — para pegar uma regressao futura do
 * mesmo padrao antes que ela chegue a producao.
 */

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf-8")
}

describe("regressao: Server Actions de mutacao nao devem aceitar um userId cru do cliente", () => {
  const actionFiles = [
    "src/application/study-history/study-history.actions.ts",
    "src/application/review-engine/review.actions.ts",
    "src/application/simulados/simulados.actions.ts",
    "src/application/simulados/simulado-records.actions.ts",
    "src/application/disciplines/discipline-actions.ts",
    "src/application/study-plan/list-plans.action.ts",
  ]

  for (const file of actionFiles) {
    it(`${file}: nenhuma assinatura de "export async function ...Action(" declara um parametro "userId"`, () => {
      const source = readSource(file)
      const sigRegex = /export async function \w*Action\(([^)]*)\)/g
      let m: RegExpExecArray | null
      while ((m = sigRegex.exec(source)) !== null) {
        const params = m[1] ?? ""
        // "userId" cru do cliente é o problema; "effectiveUserId"/"operatorId" etc.
        // (derivados no servidor, nunca parametros) não disparam aqui.
        assert.doesNotMatch(
          params,
          /(^|[^a-zA-Z])userId\s*:/,
          `assinatura suspeita em ${file}: "${m[0]}" aceita um parametro userId do cliente`,
        )
      }
    })
  }
})
