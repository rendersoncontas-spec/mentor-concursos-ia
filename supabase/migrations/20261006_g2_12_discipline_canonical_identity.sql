-- ============================================================================
-- G2.12 — IDENTIDADE CANÔNICA DO CATÁLOGO DE DISCIPLINAS.
--
-- NÃO APLICAR AUTOMATICAMENTE EM PRODUÇÃO. Revisar, rodar em staging e aplicar
-- pelo pipeline (`supabase db push`). Documentação completa, contagens
-- afetadas e rollback: docs/discipline-catalog-normalization.md.
--
-- O que esta migration faz (e o que NÃO faz):
--   1. `discipline_name_key(text)`: a chave canônica em SQL, idêntica à do
--      código (`canonicalDisciplineKey`): NFC, sem acento, minúsculas,
--      não-alfanumérico vira espaço, espaços colapsados.
--   2. Corrige `name_key` das linhas com acento (o backfill G1.1 trocou cada
--      letra acentuada por espaço: "Língua Portuguesa" → "l ngua portuguesa").
--      Só a coluna DERIVADA muda; `name` (o que o usuário vê) não é tocado.
--      Linhas cuja chave corrigida colidiria com outra NÃO são alteradas.
--   3. Trigger que mantém `name_key` sempre derivada de `name` (todo insert,
--      inclusive os caminhos legados que gravam sem a chave).
--   4. `canonical_discipline_id`: vínculo EXPLÍCITO alias → canônica. A linha
--      alias continua existindo e o histórico continua apontando para ela.
--      Sem cadeias, sem auto-referência, escrita só por admin (trigger).
--   5. RLS: UPDATE do catálogo global passa a ser só de admin (o código já
--      só atualiza `disciplines` no caminho admin; usuário comum grava a
--      aparência pessoal em `user_disciplines`).
--   6. Vincula SOMENTE os 2 pares com equivalência comprovada (ver doc).
--
--   NÃO apaga nenhuma linha. NÃO altera study_history, simulado_disciplines,
--   user_disciplines, topics, ciclos, planos, revisões ou questões. NÃO renomeia
--   nada. NÃO decide equivalência por texto: só os vínculos listados no bloco 6.
--
-- Idempotente: replays seguros (IF NOT EXISTS / CREATE OR REPLACE / DROP IF
-- EXISTS / checagens em DO).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Chave canônica em SQL (mesma regra do código).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.discipline_name_key(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $fn$
  SELECT btrim(
    regexp_replace(
      lower(
        translate(
          normalize(coalesce(p_name, ''), NFC),
          'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñÝýÿ',
          'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYyy'
        )
      ),
      '[^a-z0-9]+', ' ', 'g'
    )
  )
$fn$;

COMMENT ON FUNCTION public.discipline_name_key(text) IS
  'G2.12: chave canônica de nome de disciplina (igual a canonicalDisciplineKey do código).';

-- ----------------------------------------------------------------------------
-- 2. Corrige name_key divergente (sem colisão). Produção em 2026-10-06:
--    68 de 123 linhas divergentes, 0 colisões após a correção.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_divergent integer;
  v_blocked integer;
BEGIN
  SELECT count(*) INTO v_divergent
  FROM public.disciplines d
  WHERE d.name_key IS DISTINCT FROM public.discipline_name_key(d.name);

  SELECT count(*) INTO v_blocked
  FROM public.disciplines d
  WHERE d.name_key IS DISTINCT FROM public.discipline_name_key(d.name)
    AND EXISTS (
      SELECT 1 FROM public.disciplines o
      WHERE o.id <> d.id
        AND (public.discipline_name_key(o.name) = public.discipline_name_key(d.name)
             OR o.name_key = public.discipline_name_key(d.name))
    );

  IF v_blocked > 0 THEN
    RAISE NOTICE 'G2.12: % linha(s) com name_key divergente NÃO corrigidas por colisão canônica — triar manualmente (ver doc).', v_blocked;
  END IF;

  UPDATE public.disciplines d
  SET name_key = public.discipline_name_key(d.name)
  WHERE d.name_key IS DISTINCT FROM public.discipline_name_key(d.name)
    AND NOT EXISTS (
      SELECT 1 FROM public.disciplines o
      WHERE o.id <> d.id
        AND (public.discipline_name_key(o.name) = public.discipline_name_key(d.name)
             OR o.name_key = public.discipline_name_key(d.name))
    );

  RAISE NOTICE 'G2.12: name_key divergente em % linha(s); corrigidas % .', v_divergent, v_divergent - v_blocked;
END $$;

-- ----------------------------------------------------------------------------
-- 3. name_key sempre derivada de name.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.disciplines_sync_name_key()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  NEW.name_key := public.discipline_name_key(NEW.name);
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS disciplines_sync_name_key_trg ON public.disciplines;
CREATE TRIGGER disciplines_sync_name_key_trg
  BEFORE INSERT OR UPDATE OF name, name_key ON public.disciplines
  FOR EACH ROW EXECUTE FUNCTION public.disciplines_sync_name_key();

-- ----------------------------------------------------------------------------
-- 4. Vínculo alias → canônica.
-- ----------------------------------------------------------------------------
ALTER TABLE public.disciplines
  ADD COLUMN IF NOT EXISTS canonical_discipline_id uuid NULL;

COMMENT ON COLUMN public.disciplines.canonical_discipline_id IS
  'G2.12: NULL = a linha é canônica. Preenchido = alias desta outra linha (mesma matéria). Curado por admin; nunca inferido por texto.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'disciplines_canonical_discipline_id_fkey'
      AND conrelid = 'public.disciplines'::regclass
  ) THEN
    ALTER TABLE public.disciplines
      ADD CONSTRAINT disciplines_canonical_discipline_id_fkey
      FOREIGN KEY (canonical_discipline_id) REFERENCES public.disciplines(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'disciplines_canonical_not_self'
      AND conrelid = 'public.disciplines'::regclass
  ) THEN
    ALTER TABLE public.disciplines
      ADD CONSTRAINT disciplines_canonical_not_self
      CHECK (canonical_discipline_id IS NULL OR canonical_discipline_id <> id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS disciplines_canonical_discipline_id_idx
  ON public.disciplines (canonical_discipline_id)
  WHERE canonical_discipline_id IS NOT NULL;

-- Guarda: só admin (ou contexto sem usuário: migration/SQL editor/service
-- role) muda o vínculo; sem cadeias (o alvo precisa ser canônico e uma linha
-- que já é alvo não vira alias).
CREATE OR REPLACE FUNCTION public.disciplines_guard_canonical()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, auth
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.canonical_discipline_id IS NOT DISTINCT FROM OLD.canonical_discipline_id THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND NEW.canonical_discipline_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL AND coalesce(public.get_user_role(auth.uid()), 'user') <> 'admin' THEN
    RAISE EXCEPTION 'Somente administradores podem alterar a identidade canônica de disciplinas.'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.canonical_discipline_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.canonical_discipline_id = NEW.id THEN
    RAISE EXCEPTION 'Uma disciplina não pode ser alias de si mesma.' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.disciplines t
    WHERE t.id = NEW.canonical_discipline_id AND t.canonical_discipline_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'A disciplina-alvo já é alias de outra: aponte para a canônica final.' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.disciplines a WHERE a.canonical_discipline_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'Esta disciplina é canônica de outras e não pode virar alias.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS disciplines_guard_canonical_trg ON public.disciplines;
CREATE TRIGGER disciplines_guard_canonical_trg
  BEFORE INSERT OR UPDATE OF canonical_discipline_id ON public.disciplines
  FOR EACH ROW EXECUTE FUNCTION public.disciplines_guard_canonical();

-- ----------------------------------------------------------------------------
-- 5. RLS: UPDATE do catálogo global só para admin.
-- Antes: "Usuários autenticados podem atualizar disciplinas" (qualquer conta
-- logada podia renomear/recolorir uma disciplina de TODOS pela API).
-- SELECT e INSERT não mudam (o import/criação de matérias continua igual).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_user_role'
  ) THEN
    DROP POLICY IF EXISTS "Usuários autenticados podem atualizar disciplinas" ON public.disciplines;
    DROP POLICY IF EXISTS "Somente admin atualiza o catálogo de disciplinas" ON public.disciplines;
    CREATE POLICY "Somente admin atualiza o catálogo de disciplinas"
      ON public.disciplines
      FOR UPDATE
      TO authenticated
      USING (public.get_user_role(auth.uid()) = 'admin')
      WITH CHECK (public.get_user_role(auth.uid()) = 'admin');
  ELSE
    RAISE NOTICE 'G2.12: get_user_role ausente — policy de UPDATE de disciplines NÃO alterada.';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 6. Vínculos COMPROVADOS (2). Cada UPDATE confere id E nome: em outro banco
-- (staging com ids diferentes) simplesmente não casa e nada acontece.
-- ----------------------------------------------------------------------------
-- 6a. "Raciocínio Lógico-Matemático" é a mesma matéria que "Raciocínio Lógico e
--     Matemático" (mesmos dois termos; só o conector muda). Uso real: o mesmo
--     aluno estudou na segunda até 24/09 e passou para a primeira em 28/09.
UPDATE public.disciplines a
SET canonical_discipline_id = c.id
FROM public.disciplines c
WHERE a.id = '6514acc4-4497-4f42-b56b-d3d29ae9d819'
  AND a.name = 'Raciocínio Lógico-Matemático'
  AND c.id = 'a999929b-2793-43d9-b0a4-36a617d1bda8'
  AND c.name = 'Raciocínio Lógico e Matemático'
  AND a.canonical_discipline_id IS NULL
  AND c.canonical_discipline_id IS NULL;

-- 6b. "Tecnologia da Informação" é a mesma matéria que "Tecnologia da
--     Informação (TI)" ("TI" é a sigla do próprio nome). A primeira não tem
--     estudo, simulado nem vínculo pessoal; a segunda concentra o uso.
UPDATE public.disciplines a
SET canonical_discipline_id = c.id
FROM public.disciplines c
WHERE a.id = '90a1c53e-53a3-48ce-aac1-4354b3e07a65'
  AND a.name = 'Tecnologia da Informação'
  AND c.id = 'b518ed3a-6523-4fac-975d-1963aa9ecf53'
  AND c.name = 'Tecnologia da Informação (TI)'
  AND a.canonical_discipline_id IS NULL
  AND c.canonical_discipline_id IS NULL;

-- ----------------------------------------------------------------------------
-- 7. PENDENTES DE DECISÃO DE PRODUTO — NÃO executados. Descomentar somente
-- após a decisão registrada no doc ("Noções de X" é escopo reduzido de X).
-- ----------------------------------------------------------------------------
-- UPDATE public.disciplines SET canonical_discipline_id = 'a7eae543-debd-4e79-b939-0352ef7c3da9'
--   WHERE id = 'f44bb805-29e5-4f9f-810a-4fb44ec19c23' AND name = 'Noções de Direito Administrativo';
-- UPDATE public.disciplines SET canonical_discipline_id = '5ad2134f-4c58-4008-8e6f-c21e76478995'
--   WHERE id = 'cda018d6-85be-4b2e-ae38-7d49bd0c80d7' AND name = 'Noções de Direito Constitucional';
-- UPDATE public.disciplines SET canonical_discipline_id = 'd0b87e03-6c94-4953-9c62-0e06b5a39bd7'
--   WHERE id = '1f45f64d-0d42-47ac-be5e-f60e40bb55c6' AND name = 'Noções de Informática';
-- UPDATE public.disciplines SET canonical_discipline_id = '5ad2134f-4c58-4008-8e6f-c21e76478995'
--   WHERE id = '05a08d3e-165a-499b-8596-52e5cbf645aa' AND name = 'Direito Constitucional (CF/1988 e Doutrina)';

-- ----------------------------------------------------------------------------
-- Verificação pós-aplicação (somente leitura):
--   SELECT a.name AS alias, c.name AS canonica
--   FROM public.disciplines a JOIN public.disciplines c ON c.id = a.canonical_discipline_id;
--   SELECT count(*) FROM public.disciplines WHERE name_key IS DISTINCT FROM public.discipline_name_key(name);
--
-- ROLLBACK (nenhum dado de histórico foi tocado; tudo é reversível):
--   UPDATE public.disciplines SET canonical_discipline_id = NULL WHERE canonical_discipline_id IS NOT NULL;
--   DROP TRIGGER IF EXISTS disciplines_guard_canonical_trg ON public.disciplines;
--   DROP FUNCTION IF EXISTS public.disciplines_guard_canonical();
--   ALTER TABLE public.disciplines DROP CONSTRAINT IF EXISTS disciplines_canonical_not_self;
--   ALTER TABLE public.disciplines DROP CONSTRAINT IF EXISTS disciplines_canonical_discipline_id_fkey;
--   DROP INDEX IF EXISTS public.disciplines_canonical_discipline_id_idx;
--   ALTER TABLE public.disciplines DROP COLUMN IF EXISTS canonical_discipline_id;
--   DROP TRIGGER IF EXISTS disciplines_sync_name_key_trg ON public.disciplines;
--   DROP FUNCTION IF EXISTS public.disciplines_sync_name_key();
--   DROP POLICY IF EXISTS "Somente admin atualiza o catálogo de disciplinas" ON public.disciplines;
--   CREATE POLICY "Usuários autenticados podem atualizar disciplinas" ON public.disciplines
--     FOR UPDATE USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
--   -- name_key: a forma antiga (com acento virando espaço) é recomputável, mas
--   -- não há motivo para voltar a ela; manter a corrigida é seguro.
--   -- DROP FUNCTION IF EXISTS public.discipline_name_key(text);
-- ============================================================================
