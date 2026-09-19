-- =====================================================================
-- MIGRATIONS PENDENTES — MÓDULO CICLOS (NomeIA)
-- Gerado em 2026-09-19. Cole este arquivo inteiro no Supabase SQL Editor
-- e execute de uma vez. Ambas as migrations abaixo são IDEMPOTENTES
-- (IF NOT EXISTS / CREATE OR REPLACE / DROP POLICY IF EXISTS), ou seja,
-- rodar mais de uma vez não duplica nem quebra nada.
--
-- NÃO fazem: DROP de tabelas existentes, DELETE de study_history,
-- reset de progresso, recriação de ciclos. Apenas ADICIONAM colunas
-- (com DEFAULT seguro), uma função e uma tabela nova.
-- =====================================================================


-- ---------------------------------------------------------------------
-- MIGRATION 1 de 2: supabase/migrations/20260919_cycle_reconciliation_seconds.sql
-- Adiciona colunas de segundos (precisão) e a função central de rebuild.
-- ---------------------------------------------------------------------

-- Persists exact seconds and replaces all derived rows for one owned cycle in
-- a single transaction. This function intentionally runs as the caller.
ALTER TABLE public.study_cycles
  ADD COLUMN IF NOT EXISTS current_item_progress_seconds integer NOT NULL DEFAULT 0;

ALTER TABLE public.study_cycle_sessions
  ADD COLUMN IF NOT EXISTS seconds_contributed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_seconds integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.reconcile_study_cycle(
  p_cycle_id uuid,
  p_sessions jsonb,
  p_state jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.study_cycles
    WHERE id = p_cycle_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Ciclo não encontrado ou não pertence ao usuário';
  END IF;

  DELETE FROM public.study_cycle_sessions WHERE cycle_id = p_cycle_id;

  INSERT INTO public.study_cycle_sessions (
    cycle_id, cycle_item_id, study_history_id, discipline_id, round_number,
    seconds_contributed, extra_seconds, minutes_contributed, extra_minutes
  )
  SELECT
    p_cycle_id,
    row.cycle_item_id,
    row.study_history_id,
    row.discipline_id,
    row.round_number,
    row.seconds_contributed,
    row.extra_seconds,
    row.minutes_contributed,
    row.extra_minutes
  FROM jsonb_to_recordset(COALESCE(p_sessions, '[]'::jsonb)) AS row(
    cycle_id uuid,
    cycle_item_id uuid,
    study_history_id uuid,
    discipline_id uuid,
    round_number integer,
    seconds_contributed integer,
    extra_seconds integer,
    minutes_contributed integer,
    extra_minutes integer
  );

  UPDATE public.study_cycles
  SET
    current_item_index = COALESCE((p_state->>'current_item_index')::integer, 0),
    current_round = COALESCE((p_state->>'current_round')::integer, 1),
    total_rounds_done = COALESCE((p_state->>'total_rounds_done')::integer, 0),
    current_item_progress_seconds = COALESCE((p_state->>'current_item_progress_seconds')::integer, 0),
    current_item_progress_min = COALESCE((p_state->>'current_item_progress_min')::integer, 0),
    updated_at = timezone('utc', now())
  WHERE id = p_cycle_id AND user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_study_cycle(uuid, jsonb, jsonb) TO authenticated;


-- ---------------------------------------------------------------------
-- MIGRATION 2 de 2: supabase/migrations/20260919_1_cycle_item_skips.sql
-- Cria a tabela de marcadores duráveis de "pular matéria".
-- ---------------------------------------------------------------------

-- Torna o "pular matéria" do ciclo durável e compatível com o rebuild central.
--
-- Antes: skipCycleCurrentItemAction gravava um registro sintético (sem
-- study_history_id) direto em study_cycle_sessions e atualizava
-- study_cycles.current_item_index manualmente. Isso violava duas regras:
--   1. study_cycle_sessions.study_history_id é NOT NULL — o INSERT sintético
--      falhava na constraint e o erro era engolido por um catch silencioso.
--   2. Mesmo que o INSERT tivesse funcionado, o próximo rebuild
--      (reconcile_study_cycle) apaga e reconstrói TODAS as sessões a partir
--      apenas de study_history — um "pulo" sem lastro em estudo real
--      desaparecia e o cursor voltava para a matéria pulada.
--
-- Agora: "pular" grava apenas um marcador durável (cycle_item_id + rodada).
-- O motor de reconciliação (reconcileCycleFromStudies) passa a tratar um
-- item marcado como "satisfeito" para fins de cursor/rodada nessa rodada
-- específica, SEM alterar o cálculo de progresso/extra — o tempo real
-- estudado continua sendo somado normalmente a partir de study_history.
-- O marcador nunca é apagado pelo rebuild (não é uma tabela derivada).
CREATE TABLE IF NOT EXISTS public.study_cycle_item_skips (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cycle_id uuid NOT NULL REFERENCES public.study_cycles(id) ON DELETE CASCADE,
  cycle_item_id uuid NOT NULL REFERENCES public.study_cycle_items(id) ON DELETE CASCADE,
  round_number integer NOT NULL DEFAULT 1,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (cycle_item_id, round_number)
);

CREATE INDEX IF NOT EXISTS idx_study_cycle_item_skips_cycle ON public.study_cycle_item_skips(cycle_id);

ALTER TABLE public.study_cycle_item_skips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuários veem seus próprios pulos de ciclo" ON public.study_cycle_item_skips;
CREATE POLICY "Usuários veem seus próprios pulos de ciclo" ON public.study_cycle_item_skips
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Usuários criam pulos em seus próprios ciclos" ON public.study_cycle_item_skips;
CREATE POLICY "Usuários criam pulos em seus próprios ciclos" ON public.study_cycle_item_skips
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.study_cycles
      WHERE study_cycles.id = study_cycle_item_skips.cycle_id
        AND study_cycles.user_id = auth.uid()
    )
  );

GRANT SELECT, INSERT ON public.study_cycle_item_skips TO authenticated;


-- =====================================================================
-- QUERIES DE VERIFICAÇÃO — rode DEPOIS de aplicar o SQL acima
-- (ou rode ANTES para confirmar se já não estão aplicadas, já que
-- todo o bloco acima é seguro para rodar de novo mesmo se já existir)
-- =====================================================================

-- 1) Colunas novas em study_cycles / study_cycle_sessions existem?
SELECT table_name, column_name, data_type, column_default
FROM information_schema.columns
WHERE (table_name = 'study_cycles' AND column_name = 'current_item_progress_seconds')
   OR (table_name = 'study_cycle_sessions' AND column_name IN ('seconds_contributed', 'extra_seconds'));

-- 2) Função reconcile_study_cycle existe com a assinatura esperada?
SELECT p.proname, pg_get_function_arguments(p.oid) AS args, p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'reconcile_study_cycle';
-- Esperado: 1 linha, args = "p_cycle_id uuid, p_sessions jsonb, p_state jsonb", security_definer = false (SECURITY INVOKER)

-- 3) Tabela study_cycle_item_skips existe, com RLS ligado e as 2 policies?
SELECT relname, relrowsecurity AS rls_enabled
FROM pg_class
WHERE relname = 'study_cycle_item_skips';

SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_expr, pg_get_expr(polwithcheck, polrelid) AS with_check_expr
FROM pg_policy
WHERE polrelid = 'public.study_cycle_item_skips'::regclass;
-- Esperado: 2 policies — uma SELECT (using user_id = auth.uid()),
-- uma INSERT (with check user_id = auth.uid() AND EXISTS ciclo do próprio usuário)

-- 4) Constraint de unicidade (cycle_item_id, round_number) existe?
SELECT conname, contype, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.study_cycle_item_skips'::regclass;
