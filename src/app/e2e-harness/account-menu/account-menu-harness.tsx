"use client"

import { AppHeader } from "@/components/layout/header"

/**
 * G2.20 — cabeçalho real (AppHeader) com um aluno SINTÉTICO, sem sessão e sem
 * banco. "Sair" não é exercitado pelos testes (limparia o armazenamento local).
 */
export function AccountMenuHarness() {
  return (
    <div className="min-h-screen bg-background">
      <AppHeader
        userName="Aluno de Teste com um Nome Bem Comprido para Verificar Quebra de Linha"
        userEmail="aluno.teste.com.email.longo@exemplo.invalid"
        userId="e2e-harness-user"
        logoutAction={async () => undefined}
      />
      <main className="page-container py-6">
        <h1 className="type-h2 text-foreground">Harness E2E — menu da conta</h1>
        <p className="type-secondary mt-2">Página de teste com dados sintéticos. Só existe quando NOMEIA_E2E_HARNESS=1.</p>
      </main>
    </div>
  )
}
