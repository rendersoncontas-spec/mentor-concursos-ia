export function isUnifiedCycleEnabled(userId: string): boolean {
  // Flag de feature gradual para habilitar o modelo canônico (study_plans)
  // em vez do modelo legado (study_cycles) para o usuário.
  
  // Lista branca de usuários de teste para implementação gradual (Fase 1)
  const whitelist = [
    "00000000-0000-4000-8000-000000000001", // ID do usuário de teste principal
    "test-user-123",
  ];

  return whitelist.includes(userId);
}
