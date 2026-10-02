# Release Notes — G1 (auditoria global)

## CORREÇÕES

- Ciclo: edição de ciclo sempre reconcilia; "concluir volta" com evento
  durável + rebuild (tabela `study_cycle_round_conclusions`).
- Planejamento: geração 100% atômica via RPC; 1 ACTIVE garantido por índice.
- Revisões: finalize idempotente com recovery; respostas com operationId estável.
- Histórico/estatísticas: paginação determinística; timezone America/Sao_Paulo.
- Dashboard: reorder com rollback em falha de persistência.
- Edital: meta corrompida retorna erro em vez de sobrescrever.

## SEGURANÇA

- Identidade sempre do servidor; roles fail-closed; suporte isolado e auditado.
- OAuth sem open redirect; cookies `Secure` em produção; sem segredos no
  browser/bundle/logs; RLS verificada em 21 tabelas.

## INTEGRIDADE

- Fingerprint de importação único TS=SQL; filtro de disciplina exato;
- validação runtime no save (UUID, datas, NaN); 23505 só como idempotência.

## PLANEJAMENTO / CICLO / OFFLINE

- Semana via resolver canônico; sync queue isolada por usuário com retry
  idempotente; troca de usuário purga estado anterior (sem vazar prefs/sessão).

## UX/A11Y/PERFORMANCE

- Controles de ícone nomeados; semântica de dialog; trava anti-duplo-submit;
  N+1 de itens eliminado; leituras independentes em paralelo.

## TESTES

- Suíte completa verde G1.12: 1766/1766, 315 suites, 0 fail/skip/todo;
  incluindo regressão de todas as fases; 13 testes legados reintegrados
  ao `npm test`. `tsc --noEmit` 0; `npm run build` OK.
