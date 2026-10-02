-- ============================================================================
-- G1.2 (G-13) — review_items SEM DELETE direto.
--
-- Evidência (2026-09-28): nenhum `.delete()` sobre `review_items` em
-- `src/` (suspend/archive via UPDATE de suspended_at/archived_at;
-- discardSession atua em review_sessions). A policy FOR ALL concedia DELETE
-- ao dono, contrariando a semântica FSRS/append-only.
--
-- Troca: FOR ALL → INSERT + UPDATE próprios (SELECT já existe em policy
-- separada e é mantida). Sem DELETE = DELETE bloqueado pela ausência de
-- policy (RLS habilitada). Idempotente.
-- ============================================================================

DROP POLICY IF EXISTS "Usuário modifica próprios itens" ON public.review_items;

DROP POLICY IF EXISTS "Usuário insere próprios itens" ON public.review_items;
CREATE POLICY "Usuário insere próprios itens"
  ON public.review_items FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuário atualiza próprios itens" ON public.review_items;
CREATE POLICY "Usuário atualiza próprios itens"
  ON public.review_items FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
