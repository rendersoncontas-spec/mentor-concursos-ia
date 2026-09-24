-- Fase C.1 — Idempotência real do salvamento offline (STUDY_SESSION_CREATE)
--
-- Cenário que esta migration fecha: o cliente cria um operationId, envia o
-- estudo, o servidor grava study_history, mas a conexão cai antes do
-- cliente receber a resposta. O worker de sincronização (Fase C) marca a
-- operação como "retryable" e tenta de novo com o MESMO operationId — sem
-- esta constraint, isso cria um segundo registro duplicado.
--
-- client_operation_id é nullable e não retroativo: registros existentes
-- (manuais feitos direto no servidor, importações, etc.) continuam com
-- client_operation_id NULL para sempre — só operações que passaram pela
-- fila de sincronização offline (Fase C) preenchem essa coluna.
--
-- O índice único é PARCIAL (WHERE client_operation_id IS NOT NULL), no
-- mesmo padrão já usado por study_history_import_fingerprint_idx: nunca
-- impede múltiplos registros com client_operation_id NULL.

ALTER TABLE public.study_history
  ADD COLUMN IF NOT EXISTS client_operation_id UUID NULL;

CREATE UNIQUE INDEX IF NOT EXISTS study_history_client_operation_id_idx
  ON public.study_history (client_operation_id)
  WHERE client_operation_id IS NOT NULL;

COMMENT ON COLUMN public.study_history.client_operation_id IS
  'UUID gerado pelo cliente (mesmo operationId da sync queue offline, Fase C) para tornar STUDY_SESSION_CREATE idempotente. NULL para registros que não vieram da fila offline (manual direto, importação, etc.).';
