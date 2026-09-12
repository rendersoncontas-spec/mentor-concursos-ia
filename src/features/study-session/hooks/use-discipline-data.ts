"use client"

import { useCallback, useEffect, useState } from "react"

import {
  type DisciplineOption,
  type DisciplineSuggestion,
  getStudyCenterData,
} from "@/application/study-session/get-disciplines.action"

interface DisciplineCache {
  planDisciplines: DisciplineOption[]
  allDisciplines: DisciplineOption[]
  hasActivePlan: boolean
  suggestionsSource: string
  suggestions: DisciplineSuggestion[]
}

let _cache: DisciplineCache | null = null
let _fetchPromise: Promise<DisciplineCache> | null = null
let _lastFetchAt = 0
const STALE_MS = 5 * 60 * 1000 // 5 min

async function fetchAndCache(): Promise<DisciplineCache> {
  if (_fetchPromise) return _fetchPromise

  _fetchPromise = getStudyCenterData().then((result) => {
    _cache = {
      planDisciplines: result.planDisciplines,
      allDisciplines: result.allDisciplines,
      hasActivePlan: result.hasActivePlan,
      suggestionsSource: result.suggestionsSource,
      suggestions: result.suggestions,
    }
    _lastFetchAt = Date.now()
    _fetchPromise = null
    return _cache
  })

  return _fetchPromise
}

export function useDisciplineData() {
  const [data, setData] = useState<DisciplineCache | null>(_cache)
  const [loading, setLoading] = useState(!_cache)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (force = false) => {
    // Already cached and fresh
    if (!force && _cache && Date.now() - _lastFetchAt < STALE_MS) {
      setData(_cache)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const result = await fetchAndCache()
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar disciplinas")
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-load on mount if no cache
  useEffect(() => {
    if (!_cache) {
      void load()
    }
  }, [load])

  // Background refresh when stale
  useEffect(() => {
    if (_cache && Date.now() - _lastFetchAt >= STALE_MS) {
      void load(true)
    }
  }, [load])

  return { data, loading, error, refresh: () => load(true) }
}
