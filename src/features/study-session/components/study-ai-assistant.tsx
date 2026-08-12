"use client"

import { useState } from "react"
import type { SVGProps } from "react"
import { Bot, Sparkles, BookOpen, BrainCircuit, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

interface StudyAIAssistantProps {
  topicName: string
  disciplineName: string
}

export function StudyAIAssistant({ topicName, disciplineName }: StudyAIAssistantProps) {
  const [loading, setLoading] = useState(false)
  const [response, setResponse] = useState<string | null>(null)

  const askAI = async (action: string) => {
    setLoading(true)
    // Simulação da chamada da IA para o escopo deste componente
    setTimeout(() => {
      setResponse(`Aqui está o resultado da sua solicitação: ${action} sobre ${topicName || "o tema atual"} de ${disciplineName || "sua disciplina"}.\n\n(Integração real da IA será plugada no serviço de AI).`)
      setLoading(false)
    }, 1500)
  }

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 rounded-r-xl border-l border-slate-800 w-80 overflow-hidden">
      <div className="p-4 border-b border-slate-800 flex items-center gap-2 bg-slate-950">
        <Bot className="w-5 h-5 text-blue-400" />
        <h3 className="font-bold text-sm tracking-wide">Assistente IA</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {!response && !loading && (
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              O que você gostaria de fazer com o tópico <strong className="text-slate-200">{topicName || "atual"}</strong>?
            </p>
            
            <Button variant="secondary" size="sm" className="w-full justify-start gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border-0" onClick={() => askAI("Resumir")}>
              <BookOpen className="w-4 h-4 text-emerald-400" />
              Resumir Tópico
            </Button>
            <Button variant="secondary" size="sm" className="w-full justify-start gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border-0" onClick={() => askAI("Gerar Flashcards")}>
              <RefreshCw className="w-4 h-4 text-amber-400" />
              Gerar Flashcards
            </Button>
            <Button variant="secondary" size="sm" className="w-full justify-start gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border-0" onClick={() => askAI("Criar 10 Questões")}>
              <CheckCircle2Icon className="w-4 h-4 text-purple-400" />
              Criar 10 Questões
            </Button>
            <Button variant="secondary" size="sm" className="w-full justify-start gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border-0" onClick={() => askAI("Explicar Conceito")}>
              <BrainCircuit className="w-4 h-4 text-blue-400" />
              Explicar como se eu tivesse 5 anos
            </Button>
            <Button variant="secondary" size="sm" className="w-full justify-start gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border-0" onClick={() => askAI("Mapa Mental")}>
              <Sparkles className="w-4 h-4 text-pink-400" />
              Gerar Mapa Mental (Texto)
            </Button>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-10 space-y-3">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-400 animate-pulse">A IA está pensando...</p>
          </div>
        )}

        {response && !loading && (
          <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
            <div className="bg-slate-800 p-3 rounded-lg text-sm leading-relaxed whitespace-pre-wrap border border-slate-700">
              {response}
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={() => setResponse(null)}>
              Fazer outra pergunta
            </Button>
          </div>
        )}
      </div>

      <div className="p-3 border-t border-slate-800 bg-slate-950">
        <Textarea 
          placeholder="Ou faça uma pergunta livre..." 
          className="min-h-[60px] bg-slate-900 border-slate-700 text-sm resize-none focus-visible:ring-blue-500"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              askAI("Pergunta Livre")
            }
          }}
        />
      </div>
    </div>
  )
}

function CheckCircle2Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}
