"use server"

import { createClient } from "@/infrastructure/supabase/server"

export interface SubscriptionData {
  plan: string
  status: "ativo" | "gratuito" | "cancelado" | "expirado"
  adhesionDate: string | null
  paymentDate: string | null
  nextPayment: string | null
  amount: string | null
  paymentMethod: string | null
  purchaseHistory: Array<{
    date: string
    provider: string
    plan: string
    period: string
    status: string
    paymentMethod: string
    recurring: string
    amount: string
  }>
}

export async function getSubscriptionDataAction(): Promise<{
  success: boolean
  data?: SubscriptionData
  error?: string
}> {
  try {
    const supabase = await createClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return { success: false, error: "Usuário não autenticado." }
    }

    const adhesionDate = user.created_at
      ? new Date(user.created_at).toLocaleDateString("pt-BR")
      : null

    // Não existe infraestrutura de pagamento/assinatura nesta versão.
    // Os dados abaixo refletem o estado real: todos os usuários estão no
    // plano gratuito e não existe histórico de compras.
    return {
      success: true,
      data: {
        plan: "Gratuito",
        status: "gratuito",
        adhesionDate,
        paymentDate: null,
        nextPayment: null,
        amount: "R$ 0,00",
        paymentMethod: null,
        purchaseHistory: [],
      },
    }
  } catch (err: unknown) {
    console.error("Erro em getSubscriptionDataAction:", err)
    return { success: false, error: "Erro interno ao carregar assinatura." }
  }
}
