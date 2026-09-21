import assert from "node:assert/strict"
import test from "node:test"

import type { SupabaseClient, User } from "@supabase/supabase-js"

import {
  backfillProfileFromGoogle,
  computeGoogleProfileBackfill,
  getOnboardingCompleted,
  type ProfileBackfillRow,
} from "./google-oauth-profile"

function googleUser(overrides: Partial<Pick<User, "email" | "user_metadata">> = {}): Pick<
  User,
  "email" | "user_metadata"
> {
  return {
    email: "joana@gmail.com",
    user_metadata: {
      full_name: "Joana Silva",
      avatar_url: "https://lh3.googleusercontent.com/a/joana.jpg",
    },
    ...overrides,
  }
}

// ── computeGoogleProfileBackfill (função pura) ──────────────────────────────

test("computeGoogleProfileBackfill: preenche campos vazios com dados do Google", () => {
  const profile: ProfileBackfillRow = { name: null, full_name: null, avatar_url: null, email: null }
  const updates = computeGoogleProfileBackfill(profile, googleUser())
  assert.deepEqual(updates, {
    name: "Joana Silva",
    full_name: "Joana Silva",
    avatar_url: "https://lh3.googleusercontent.com/a/joana.jpg",
    email: "joana@gmail.com",
  })
})

test("computeGoogleProfileBackfill: NUNCA sobrescreve dados já personalizados pelo usuário", () => {
  const profile: ProfileBackfillRow = {
    name: "Apelido que a Joana escolheu",
    full_name: "Joana da Silva Completo",
    avatar_url: "https://cdn.nomeia.com/uploads/avatar-custom.png",
    email: "joana@gmail.com",
  }
  const updates = computeGoogleProfileBackfill(profile, googleUser())
  assert.equal(updates, null, "nada deveria ser atualizado — todos os campos já têm valor do usuário")
})

test("computeGoogleProfileBackfill: preenche só os campos que estão vazios (parcial)", () => {
  const profile: ProfileBackfillRow = {
    name: "Apelido que a Joana escolheu",
    full_name: null,
    avatar_url: null,
    email: "joana@gmail.com",
  }
  const updates = computeGoogleProfileBackfill(profile, googleUser())
  assert.deepEqual(updates, {
    full_name: "Joana Silva",
    avatar_url: "https://lh3.googleusercontent.com/a/joana.jpg",
  })
})

test("computeGoogleProfileBackfill: aceita 'picture' como fallback de avatar quando 'avatar_url' não vem no metadata", () => {
  const profile: ProfileBackfillRow = { name: null, full_name: null, avatar_url: null, email: null }
  const updates = computeGoogleProfileBackfill(
    profile,
    googleUser({ user_metadata: { name: "Joana", picture: "https://lh3.googleusercontent.com/a/pic.jpg" } }),
  )
  assert.equal(updates?.avatar_url, "https://lh3.googleusercontent.com/a/pic.jpg")
  assert.equal(updates?.name, "Joana")
})

test("computeGoogleProfileBackfill: retorna null quando o Google não tem nada útil e o profile já está preenchido", () => {
  const profile: ProfileBackfillRow = {
    name: "Joana",
    full_name: "Joana Silva",
    avatar_url: "https://cdn.nomeia.com/a.png",
    email: "joana@gmail.com",
  }
  const updates = computeGoogleProfileBackfill(profile, googleUser({ user_metadata: {} }))
  assert.equal(updates, null)
})

// ── Fake Supabase client mínimo, só com o que backfillProfileFromGoogle/getOnboardingCompleted usam ──

interface FakeTable {
  select: (row: Record<string, unknown> | null) => void
  updates: Array<Record<string, unknown>>
}

function makeFakeSupabase(initialRow: Record<string, unknown> | null) {
  const state: FakeTable = { select: () => {}, updates: [] }
  let row = initialRow

  const client = {
    from(_table: string) {
      return {
        select() {
          return {
            eq() {
              return {
                async maybeSingle<T>() {
                  return { data: row as T | null, error: null }
                },
              }
            },
          }
        },
        update(values: Record<string, unknown>) {
          state.updates.push(values)
          return {
            eq(_col: string, id: string) {
              row = row ? { ...row, ...values, id } : null
              return Promise.resolve({ error: null })
            },
          }
        },
      }
    },
  } as unknown as SupabaseClient

  return { client, state, getRow: () => row }
}

function fakeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-123",
    email: "joana@gmail.com",
    user_metadata: { full_name: "Joana Silva", avatar_url: "https://lh3.googleusercontent.com/a/joana.jpg" },
    app_metadata: {},
    aud: "authenticated",
    created_at: new Date().toISOString(),
    ...overrides,
  } as User
}

test("backfillProfileFromGoogle: atualiza o profile existente com os campos vazios", async () => {
  const { client, state } = makeFakeSupabase({
    name: null,
    full_name: null,
    avatar_url: null,
    email: null,
  })

  await backfillProfileFromGoogle(client, fakeUser())

  assert.equal(state.updates.length, 1, "deve ter chamado update exatamente uma vez")
  assert.deepEqual(state.updates[0], {
    name: "Joana Silva",
    full_name: "Joana Silva",
    avatar_url: "https://lh3.googleusercontent.com/a/joana.jpg",
    email: "joana@gmail.com",
  })
})

test("backfillProfileFromGoogle: não chama update quando o profile já está completo", async () => {
  const { client, state } = makeFakeSupabase({
    name: "Joana",
    full_name: "Joana Silva",
    avatar_url: "https://cdn.nomeia.com/a.png",
    email: "joana@gmail.com",
  })

  await backfillProfileFromGoogle(client, fakeUser())

  assert.equal(state.updates.length, 0, "não deve chamar update — nada para preencher")
})

test("backfillProfileFromGoogle: não lança e não tenta INSERT quando o profile ainda não existe (aguarda o trigger)", async () => {
  const { client, state } = makeFakeSupabase(null)

  await assert.doesNotReject(() => backfillProfileFromGoogle(client, fakeUser()))
  assert.equal(state.updates.length, 0)
})

test("getOnboardingCompleted: reflete o valor do profile", async () => {
  const { client: clientTrue } = makeFakeSupabase({ onboarding_completed: true })
  assert.equal(await getOnboardingCompleted(clientTrue, "user-123"), true)

  const { client: clientFalse } = makeFakeSupabase({ onboarding_completed: false })
  assert.equal(await getOnboardingCompleted(clientFalse, "user-123"), false)
})

test("getOnboardingCompleted: assume 'não concluído' (fail-safe) quando não há profile", async () => {
  const { client } = makeFakeSupabase(null)
  assert.equal(await getOnboardingCompleted(client, "user-123"), false)
})
