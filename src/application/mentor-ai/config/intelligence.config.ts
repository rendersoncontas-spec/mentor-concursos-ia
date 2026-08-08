export const IntelligenceConfig = {
  provider: "heuristic", // 'heuristic' | 'llm' | 'hybrid'
  saveHistory: true,     // Persiste logs no banco
  savePrompt: true,      // Salva o JSON/Text do prompt
  enableLLM: false,      // Ativa integração externa
  enableReasoning: true, // Fornece rastreamento das decisões
}
