export const IntelligenceConfig = {
  provider: "heuristic", // 'heuristic' | 'llm' | 'hybrid'
  // G2.16: feed antigo aposentado — nunca mais grava em mentor_history.
  saveHistory: false,    // Persiste logs no banco
  savePrompt: true,      // Salva o JSON/Text do prompt
  enableLLM: false,      // Ativa integração externa
  enableReasoning: true, // Fornece rastreamento das decisões
}
