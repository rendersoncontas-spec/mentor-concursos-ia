import assert from "node:assert/strict"
import test from "node:test"

import { resetPasswordSchema } from "./auth.schemas"

// resetPasswordSchema existia sem nenhum consumidor real ate o QA funcional
// de 2026-09 descobrir que a pagina /update-password nunca tinha sido
// construida - o fluxo de "esqueci minha senha" enviava o e-mail mas nao
// havia onde o usuario efetivamente trocasse a senha. Este teste cobre a
// unica peca testavel sem navegador real (o schema em si).
test("resetPasswordSchema: aceita senha e confirmacao iguais com 6+ caracteres", () => {
  const result = resetPasswordSchema.safeParse({
    password: "123456",
    confirmPassword: "123456",
  })
  assert.equal(result.success, true)
})

test("resetPasswordSchema: rejeita senha curta", () => {
  const result = resetPasswordSchema.safeParse({
    password: "123",
    confirmPassword: "123",
  })
  assert.equal(result.success, false)
})

test("resetPasswordSchema: rejeita quando as senhas nao coincidem", () => {
  const result = resetPasswordSchema.safeParse({
    password: "123456",
    confirmPassword: "654321",
  })
  assert.equal(result.success, false)
  if (!result.success) {
    assert.deepEqual(result.error.issues[0]?.path, ["confirmPassword"])
  }
})
