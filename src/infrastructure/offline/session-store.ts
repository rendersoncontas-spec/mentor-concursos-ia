import { STORE_NAMES, deleteRecord, getRecord, putRecord } from "./indexeddb-client"
import type { ActiveSessionRecord } from "./types"

/**
 * Armazenamento local da sessão de cronômetro ativa (item 4/5 do pedido:
 * migração de `mentor_active_study_session`, de localStorage para
 * IndexedDB). Mantém EXATAMENTE os mesmos campos que o StudyProvider já usa
 * — este módulo não decide o que é uma sessão, só onde ela mora e como
 * outras abas ficam sabendo que ela mudou.
 *
 * Sincronização entre abas: localStorage tinha o evento nativo `storage`
 * de graça; IndexedDB não tem equivalente. Substituímos por um
 * BroadcastChannel dedicado — assim nenhuma aba fica com um cronômetro
 * "fantasma" depois que outra aba salva/encerra a sessão (mesmo
 * comportamento que já existia, só que agora por cima do IndexedDB).
 */

const BROADCAST_CHANNEL_NAME = "nomeia-offline-session"

interface SessionBroadcastMessage {
  userId: string
  kind: "updated" | "cleared"
}

function hasBroadcastChannel(): boolean {
  return typeof BroadcastChannel !== "undefined"
}

function broadcast(message: SessionBroadcastMessage): void {
  if (!hasBroadcastChannel()) return
  const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME)
  channel.postMessage(message)
  channel.close()
}

export const sessionStore = {
  async get(userId: string): Promise<ActiveSessionRecord | undefined> {
    return getRecord<ActiveSessionRecord>(STORE_NAMES.sessionState, userId)
  },

  async set(userId: string, data: Omit<ActiveSessionRecord, "userId">): Promise<void> {
    const record: ActiveSessionRecord = { ...data, userId }
    await putRecord<ActiveSessionRecord>(STORE_NAMES.sessionState, record)
    broadcast({ userId, kind: "updated" })
  },

  async clear(userId: string): Promise<void> {
    await deleteRecord(STORE_NAMES.sessionState, userId)
    broadcast({ userId, kind: "cleared" })
  },

  /**
   * Avisa `onChange` quando OUTRA aba salva/encerra a sessão deste mesmo
   * usuário. O chamador é responsável por reler `get(userId)` dentro do
   * callback — este módulo só notifica, não empurra o valor (evita
   * carregar dado duplicado pela mensagem quando um `get()` fresco já
   * resolve isso).
   */
  subscribe(userId: string, onChange: () => void): () => void {
    if (!hasBroadcastChannel()) return () => {}
    const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME)
    const handler = (event: MessageEvent<SessionBroadcastMessage>) => {
      if (event.data?.userId === userId) onChange()
    }
    channel.addEventListener("message", handler)
    return () => {
      channel.removeEventListener("message", handler)
      channel.close()
    }
  },
}
