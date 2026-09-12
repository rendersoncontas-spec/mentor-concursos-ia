"use client"

import { useCallback, useEffect, useState } from "react"

interface CacheEntry<T> {
  data: T
  timestamp: number
}

const _cache = new Map<string, CacheEntry<unknown>>()
const DEFAULT_TTL = 5 * 60 * 1000 // 5 min

/**
 * Hook genérico para cachear resultados de Server Actions.
 *
 * Usa cache em módulo (module-level) — sobrevive re-renders e unmounts.
 * Primeira chamada busca do servidor, todas as próximas são instantâneas
 * enquanto o cache estiver fresco.
 *
 * @param key - Chave única do cache (ex: "monthlyStats:2026:9")
 * @param fetcher - Função async que retorna os dados
 * @param ttl - Tempo de vida do cache em ms (padrão: 5 min)
 */
export function useCachedServerAction<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl = DEFAULT_TTL,
) {
  const [data, setData] = useState<T | null>(() => {
    const cached = _cache.get(key)
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.data as T
    }
    return null
  })
  const [loading, setLoading] = useState(!data)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    async (force = false) => {
      if (!force) {
        const cached = _cache.get(key)
        if (cached && Date.now() - cached.timestamp < ttl) {
          setData(cached.data as T)
          setLoading(false)
          return
        }
      }

      setLoading(true)
      setError(null)
      try {
        const result = await fetcher()
        _cache.set(key, { data: result, timestamp: Date.now() })
        setData(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar dados")
      } finally {
        setLoading(false)
      }
    },
    [key, fetcher, ttl],
  )

  useEffect(() => {
    void load()
  }, [load])

  return { data, loading, error, refresh: () => load(true) }
}
