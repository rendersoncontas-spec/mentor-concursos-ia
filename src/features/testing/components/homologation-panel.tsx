"use client"

import { useState } from "react"
import { PlayCircle, CheckCircle, XCircle, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import type { HomologationResult } from "@/application/testing/homologation.service"
import { runHomologationFlow1Action, runHomologationMentorAction } from "@/application/testing/homologation.actions"

function getLogStatusClass(status: HomologationResult["status"]): string | undefined {
  if (status === "FAILED") return "text-red-400"
  if (status === "PENDING") return "text-blue-300"
  return undefined
}

export function HomologationPanel() {
  const [logs, setLogs] = useState<HomologationResult[]>([])
  const [isRunning, setIsRunning] = useState(false)

  const runFlow1 = async () => {
    setIsRunning(true)
    setLogs([{ step: "Iniciando", status: "PENDING", message: "Preparando ambiente de teste..." }])
    
    const { data, error } = await runHomologationFlow1Action()
    
    if (error) {
      setLogs(prev => [...prev, { step: "Falha de Execução", status: "FAILED", message: error }])
    } else if (data) {
      setLogs(data)
    }
    
    setIsRunning(false)
  }

  const runMentorTest = async () => {
    setIsRunning(true)
    setLogs([{ step: "Iniciando Teste Mentor", status: "PENDING", message: "Preparando..." }])
    
    const { data, error } = await runHomologationMentorAction()
    
    if (error) {
      setLogs(prev => [...prev, { step: "Falha de Execução", status: "FAILED", message: error }])
    } else if (data) {
      setLogs(data)
    }
    
    setIsRunning(false)
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Fluxo 1: Completo</CardTitle>
            <CardDescription>Criação {'->'} Cronograma {'->'} Sessão {'->'} Mentor</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={runFlow1} disabled={isRunning} className="w-full gap-2">
              <PlayCircle className="w-4 h-4" /> Executar Fluxo de Teste
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Teste: Diferenciação de Energia</CardTitle>
            <CardDescription>Valida se o MentorIA produz insights diferentes (Energia 5 vs 2)</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={runMentorTest} disabled={isRunning} variant="secondary" className="w-full gap-2 border">
              <PlayCircle className="w-4 h-4" /> Testar Motor IA
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            Terminal de Validação
            {isRunning && <RefreshCw className="w-5 h-5 animate-spin text-primary ml-auto" />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-black text-green-400 p-4 rounded-xl font-mono text-sm h-80 overflow-y-auto space-y-3">
            {logs.length === 0 && (
              <div className="text-gray-500 italic">Aguardando execução dos testes...</div>
            )}
            {logs.map((log, i) => (
              <div key={i} className="flex gap-3 items-start border-b border-gray-800 pb-2">
                {log.status === "SUCCESS" && <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />}
                {log.status === "FAILED" && <XCircle className="w-5 h-5 text-red-500 shrink-0" />}
                {log.status === "PENDING" && <RefreshCw className="w-5 h-5 text-blue-400 shrink-0 animate-spin" />}
                
                <div className="space-y-1 w-full">
                  <div className="flex gap-2">
                    <span className="font-bold text-white">[{log.step}]</span>
                    <span className={getLogStatusClass(log.status)}>
                      {log.message}
                    </span>
                  </div>
                  {log.details ? (
                    <div className="bg-gray-900 p-2 rounded text-gray-300 mt-2 text-xs overflow-x-auto whitespace-pre-wrap break-all">
                      {JSON.stringify(log.details, null, 2)}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
