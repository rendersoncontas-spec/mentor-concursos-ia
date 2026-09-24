"use client"

import { createContext, createElement, useCallback, useContext, useEffect, useRef, useState } from "react"
import type { ReactNode } from "react"

import { fetchWithCache, hasServerValue, readFreshCache, seedCache } from "@/lib/server-action-cache"

const DEFAULT_TTL = 5 * 60 * 1000 // 5 min

/**
 * Fase F (performance) — dados que a página já carregou no servidor, indexados
 * pela mesma chave usada em `useCachedServerAction`. Um widget dentro deste
 * provider começa já com o dado (sem spinner e sem repetir a Server Action no
 * cliente). A presença da chave é o que conta: `null` é um valor válido (ex.:
 * "nenhum ciclo ativo").
 */
const InitialServerDataContext = createContext<Readonly<Record<string, unknown>> | null>(null)

export function InitialServerDataProvider({
  data,
  children,
}: {
  data: Readonly<Record<string, unknown>>
  children: ReactNode
}) {
  return createElement(InitialServerDataContext.Provider, { value: data }, children)
}

/**
 * Hook genérico para cachear resultados de Server Actions.
 *
 * Usa cache em módulo (module-level) — sobrevive re-renders e unmounts.
 * Primeira chamada busca do servidor, todas as próximas são instantâneas
 * enquanto o cache estiver fresco.
 *
 * Fase F (performance):
 * - `load` e `refresh` agora são estáveis. Antes, o `fetcher` (quase sempre
 *   uma arrow function inline) recriava `load` a cada render e o efeito de
 *   carga rodava de novo; se o componente pai re-renderizasse enquanto a
 *   primeira busca ainda estava em andamento, a mesma Server Action era
 *   disparada outra vez.
 * - Buscas simultâneas da mesma chave compartilham a mesma promessa.
 * - Dados vindos do servidor (`InitialServerDataProvider`) semeiam o cache.
 * - `refresh()` mantém o conteúdo atual na tela enquanto busca (antes o
 *   `loading` voltava a `true` e o widget trocava o conteúdo por um spinner a
 *   cada estudo salvo). `loading` só é `true` enquanto ainda não há dado.
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
  const initial = useContext(InitialServerDataContext)
  const hasInitial = hasServerValue(initial, key)

  // O estado guarda a chave a que o dado pertence: se a chave mudar (ex.: o
  // calendário vai para outro mês), o dado antigo não é exibido como se fosse
  // do novo mês — volta a "carregando" até chegar o dado da chave nova.
  const [state, setState] = useState<{ key: string; data: T | null; loaded: boolean }>(() => {
    if (hasInitial) {
      const value = (initial as Record<string, unknown>)[key] as T
      seedCache(key, value)
      return { key, data: value, loaded: true }
    }
    const cached = readFreshCache<T>(key, ttl)
    return cached ? { key, data: cached.data, loaded: true } : { key, data: null, loaded: false }
  })
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Fase F.2: depois de um router.refresh() a página chega do servidor com um
  // NOVO objeto de dados no InitialServerDataProvider. Antes o hook usava esses
  // dados só na montagem e os ignorava depois — por isso o widget precisava
  // buscar tudo de novo por Server Action (dado carregado 2×). Agora o dado novo
  // do servidor é adotado (e semeia o cache), e o widget pode dispensar a
  // própria busca quando o evento de estudo salvo avisa que haverá refresh
  // (ver shouldWidgetRefreshOnSaved). Padrão "guardar o valor da renderização
  // anterior" do React: atualização de estado durante a renderização, sem efeito.
  const [seenInitial, setSeenInitial] = useState(initial)
  if (seenInitial !== initial) {
    setSeenInitial(initial)
    if (hasInitial) {
      const value = (initial as Record<string, unknown>)[key] as T
      seedCache(key, value)
      setState({ key, data: value, loaded: true })
    }
  }

  // Sempre a versão mais recente do fetcher, sem que ela invalide `load`.
  const fetcherRef = useRef(fetcher)
  useEffect(() => {
    fetcherRef.current = fetcher
  })

  const load = useCallback(
    async (force = false) => {
      if (!force) {
        const cached = readFreshCache<T>(key, ttl)
        if (cached) {
          setState((prev) =>
            prev.key === key && prev.loaded && prev.data === cached.data
              ? prev
              : { key, data: cached.data, loaded: true },
          )
          return
        }
      }

      setFetching(true)
      setError(null)
      try {
        const result = await fetchWithCache<T>(key, () => fetcherRef.current(), { ttl, force })
        setState({ key, data: result, loaded: true })
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erro ao carregar dados")
      } finally {
        setFetching(false)
      }
    },
    [key, ttl],
  )

  useEffect(() => {
    void load()
  }, [load])

  const refresh = useCallback(() => load(true), [load])

  const current = state.key === key && state.loaded
  // `loading` só é true enquanto ainda não há dado para a chave atual (e não
  // houve erro); um refresh mantém o conteúdo atual na tela.
  const loading = !current && (fetching || !error)

  // `serverBacked`: o dado desta chave vem da página no servidor — um
  // router.refresh() o atualiza sem precisar de nova Server Action.
  return { data: current ? state.data : null, loading, error, refresh, serverBacked: hasInitial }
}
