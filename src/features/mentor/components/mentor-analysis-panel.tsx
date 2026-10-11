"use client"

import { useEffect, useRef, useState } from "react"

import { requestMentorAnalysisAction } from "@/application/mentor-llm/mentor-analysis.action"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { MentorAnalysisResult, MentorRichText } from "@/domain/mentor/mentor-ai"
import type { ContextQualityLevel } from "@/domain/mentor/student-mentor-context"
import { CLIENT_WATCHDOG_MS, MENTOR_ANALYSIS_FALLBACK_TEXT, rateLimitText } from "@/features/mentor/lib/mentor-analysis-texts"

/**
 * G2.16 — "Análise do Mentor" (camada interpretativa por IA, opcional).
 *
 * - Desligada por padrão. G2.17 (piloto): a página só monta este bloco para
 *   alunos da allowlist; para os demais ele nem aparece.
 * - Chamada só por clique (nunca em render/navegação); botão travado durante
 *   a chamada (duplo clique não gera duas chamadas — e o servidor ainda
 *   compartilha a chamada em andamento entre abas).
 * - Fato (sistema) ≠ Interpretação (IA) ≠ Sugestão (IA): números, horas e
 *   percentuais são sempre os do sistema.
 * - G2.17: vigia no cliente — se a resposta não chegar em
 *   CLIENT_WATCHDOG_MS, sai do "carregando" e mostra a falha (a tela nunca
 *   fica presa; o panorama determinístico continua acima).
 */

const CONFIDENCE_LABEL = { high: "Confiança alta", medium: "Confiança média", low: "Confiança baixa" } as const

type PanelState = { phase: "idle" } | { phase: "loading" } | { phase: "done"; result: MentorAnalysisResult }

export function MentorAnalysisPanel({
  quality,
  requestAnalysis = requestMentorAnalysisAction,
}: {
  quality: ContextQualityLevel
  /**
   * G2.20: quem busca a análise. Produção usa SEMPRE a Server Action (padrão);
   * só o harness E2E injeta respostas controladas para testar os estados da tela.
   */
  requestAnalysis?: () => Promise<MentorAnalysisResult>
}) {
  const [state, setState] = useState<PanelState>({ phase: "idle" })
  const busy = useRef(false)
  // G2.21: o botão fica desabilitado durante a chamada e, com isso, o navegador
  // tira o foco dele (o foco ia para o <body> e quem usa teclado/leitor de tela
  // voltava ao topo). Ao terminar, devolve o foco ao botão — só se ele tinha o
  // foco e o foco não foi parar em outro lugar nesse meio-tempo.
  const buttonRef = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)
  useEffect(() => {
    if (state.phase !== "done" || !restoreFocus.current) return
    restoreFocus.current = false
    const active = document.activeElement
    if (!active || active === document.body) buttonRef.current?.focus()
  }, [state])

  if (quality === "EMPTY") {
    return (
      <section className="rounded-lg border bg-card px-4 py-3">
        <h2 className="type-h3 text-foreground">Análise do Mentor</h2>
        <p className="type-secondary mt-1">Você ainda não tem dados suficientes para uma análise de desempenho.</p>
      </section>
    )
  }

  const run = async () => {
    if (busy.current) return
    busy.current = true
    restoreFocus.current = document.activeElement === buttonRef.current
    setState({ phase: "loading" })
    let timer: ReturnType<typeof setTimeout> | undefined
    const watchdog = new Promise<MentorAnalysisResult>((resolve) => {
      timer = setTimeout(() => resolve({ status: "FAILED", reason: "TIMEOUT" }), CLIENT_WATCHDOG_MS)
    })
    try {
      const result = await Promise.race([requestAnalysis(), watchdog])
      setState({ phase: "done", result })
    } catch {
      setState({ phase: "done", result: { status: "FAILED", reason: "PROVIDER_ERROR" } })
    } finally {
      clearTimeout(timer)
      busy.current = false
    }
  }

  const result = state.phase === "done" ? state.result : null
  return (
    <section className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
        <div>
          <p className="type-caption uppercase tracking-wide">Interpretação por IA</p>
          <h2 className="type-h3 text-foreground">Análise do Mentor</h2>
          <p className="type-caption">Explica os dados acima; não calcula nem altera nada. Os números são sempre os do sistema.</p>
        </div>
        <Button ref={buttonRef} size="sm" variant="outline" onClick={run} disabled={state.phase === "loading"} aria-busy={state.phase === "loading"}>
          {buttonLabel(state.phase === "loading", result?.status === "OK")}
        </Button>
      </div>
      {quality === "LOW" && (
        <p className="type-secondary px-4 pt-2">Seus dados ainda são poucos: a análise será limitada.</p>
      )}
      <div className="px-4 py-4" aria-live="polite">
        {state.phase === "idle" && <p className="type-secondary">Peça uma análise quando quiser; ela usa apenas os fatos desta página.</p>}
        {state.phase === "loading" && <p className="type-secondary">Analisando seu momento…</p>}
        {result && <AnalysisResult result={result} />}
      </div>
    </section>
  )
}

function buttonLabel(loading: boolean, hasAnalysis: boolean): string {
  if (loading) return "Gerando análise…"
  return hasAnalysis ? "Gerar novamente" : "Gerar análise"
}

function AnalysisResult({ result }: { result: MentorAnalysisResult }) {
  if (result.status === "RATE_LIMITED") return <p className="type-secondary">{rateLimitText(result.scope, result.retryAfterSeconds)}</p>
  if (result.status === "INSUFFICIENT_DATA") {
    return <p className="type-secondary">Você ainda não tem dados suficientes para uma análise de desempenho.</p>
  }
  if (result.status === "DISABLED") return <p className="type-secondary">A análise por IA não está disponível no momento.</p>
  if (result.status === "UNAVAILABLE") return <p className="type-secondary">{result.reason}</p>
  if (result.status === "FAILED") {
    return (
      <p className="type-secondary">
        {result.reason === "TIMEOUT" ? "A análise demorou mais que o esperado. " : ""}
        {MENTOR_ANALYSIS_FALLBACK_TEXT}
      </p>
    )
  }

  const a = result.analysis
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">{CONFIDENCE_LABEL[a.confidence]}</Badge>
        {a.insufficientData && <Badge variant="outline">Dados limitados</Badge>}
        {result.cached && <span className="type-caption">mesma análise para os mesmos dados</span>}
      </div>
      <AiText label="Mentor (IA)" parts={a.summary} />
      {a.summaryFacts.length > 0 && (
        <ul className="space-y-1">
          {a.summaryFacts.map((f, i) => (
            <li key={i}>
              <SystemFact text={f} />
            </li>
          ))}
        </ul>
      )}
      {a.highlights.length > 0 && (
        <ul className="divide-y rounded-md border">
          {a.highlights.map((h, i) => (
            <li key={i} className="space-y-1.5 px-3 py-2.5">
              <SystemFact text={h.fact} />
              <AiText label="Mentor (IA)" parts={h.interpretation} />
            </li>
          ))}
        </ul>
      )}
      {a.attentionPoints.length > 0 && (
        <div>
          <h3 className="type-label">Merece atenção</h3>
          <ul className="mt-2 divide-y rounded-md border">
            {a.attentionPoints.map((p, i) => (
              <li key={i} className="space-y-1.5 px-3 py-2.5">
                <SystemFact text={p.fact} />
                <AiText label="Mentor (IA)" parts={p.text} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {a.recommendations.length > 0 && (
        <div>
          <h3 className="type-label">Próximos passos sugeridos pelo Mentor</h3>
          <ul className="mt-2 divide-y rounded-md border">
            {a.recommendations.map((r, i) => (
              <li key={i} className="space-y-1.5 px-3 py-2.5">
                <p className="text-sm font-medium text-foreground"><Rich parts={r.title} /></p>
                <SystemFact text={r.basis} />
                <AiText label="Sugestão (IA)" parts={r.suggestion} />
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="type-caption">
        Interpretação gerada por IA em {new Date(result.generatedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · versão {result.promptVersion},
        a partir apenas dos dados mostrados nesta página. Números, datas e nomes de disciplinas vêm sempre do sistema. Sugestões não são
        obrigações e nada foi alterado na sua conta.
      </p>
    </div>
  )
}

/** Dado calculado pelo sistema (números, datas e nomes oficiais). */
function SystemFact({ text }: { text: string }) {
  if (!text) return null
  return (
    <p className="text-sm text-foreground">
      <span className="type-label mr-1">Dado do sistema</span>
      {text}
    </p>
  )
}

/** Texto interpretativo da IA, visualmente separado dos dados. */
function AiText({ label, parts }: { label: string; parts: MentorRichText }) {
  return (
    <p className="border-l-2 border-primary/40 pl-3 text-sm text-muted-foreground">
      <span className="type-label mr-1 text-primary">{label}</span>
      <Rich parts={parts} />
    </p>
  )
}

/** Partes do texto: disciplinas com a denominação oficial; referências a fatos viram marcador. */
function Rich({ parts }: { parts: MentorRichText }) {
  return (
    <>
      {parts.map((p, i) => {
        if (p.kind === "discipline") return <strong key={i} className="font-medium text-foreground">{p.name}</strong>
        if (p.kind === "fact") {
          return (
            <abbr key={i} title={p.text} className="mx-0.5 cursor-help no-underline type-caption">
              (ver dado)
            </abbr>
          )
        }
        return <span key={i}>{p.value}</span>
      })}
    </>
  )
}
