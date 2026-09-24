/**
 * Fase F (performance) — núcleo, sem React, do cache de leituras feitas por
 * Server Actions no cliente (usado por `useCachedServerAction`).
 *
 * Três garantias, todas testadas em `server-action-cache.test.ts`:
 *
 * 1. Cache por chave com TTL (comportamento que já existia no hook).
 * 2. Deduplicação de chamadas simultâneas: se a mesma chave já está sendo
 *    buscada, quem chegar depois aguarda a MESMA promessa em vez de disparar
 *    outra Server Action. Isso importa porque o Next.js executa as Server
 *    Actions de um cliente em fila (uma por vez): cada chamada duplicada
 *    atrasa todas as outras leituras da tela.
 * 3. Semeadura com dados já carregados no servidor (`seedCache`), para a tela
 *    não repetir no cliente uma leitura que a página já fez no render.
 *
 * `force: true` (usado pelo refresh após salvar um estudo) ignora o cache e
 * também não reaproveita uma busca antiga em andamento — sempre busca de novo.
 */

export interface CacheEntry<T> {
  data: T
  timestamp: number
}

const cacheStore = new Map<string, CacheEntry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()

export function readFreshCache<T>(key: string, ttl: number, now: number = Date.now()): CacheEntry<T> | null {
  const entry = cacheStore.get(key)
  if (!entry) return null
  if (now - entry.timestamp >= ttl) return null
  return entry as CacheEntry<T>
}

export function seedCache<T>(key: string, data: T, now: number = Date.now()): void {
  cacheStore.set(key, { data, timestamp: now })
}

export function invalidateCache(key: string): void {
  cacheStore.delete(key)
}

export async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: { ttl: number; force?: boolean },
): Promise<T> {
  if (!options.force) {
    const fresh = readFreshCache<T>(key, options.ttl)
    if (fresh) return fresh.data
    const pending = inflight.get(key)
    if (pending) return pending as Promise<T>
  }

  const promise: Promise<T> = fetcher().then(
    (result) => {
      cacheStore.set(key, { data: result, timestamp: Date.now() })
      // Só remove se ainda for a promessa registrada (um force posterior pode
      // ter registrado outra por cima).
      if (inflight.get(key) === promise) inflight.delete(key)
      return result
    },
    (err: unknown) => {
      if (inflight.get(key) === promise) inflight.delete(key)
      throw err
    },
  )
  inflight.set(key, promise)
  return promise
}

/**
 * Fase F.2 — a página enviou do servidor um valor para esta chave? A presença
 * da chave é o que conta (`null` é um valor válido, ex.: "nenhum ciclo ativo").
 */
export function hasServerValue(initial: Readonly<Record<string, unknown>> | null | undefined, key: string): boolean {
  return initial !== null && initial !== undefined && Object.prototype.hasOwnProperty.call(initial, key)
}

/** Apenas para testes. */
export function __resetServerActionCacheForTests(): void {
  cacheStore.clear()
  inflight.clear()
}
