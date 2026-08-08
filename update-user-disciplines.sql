-- Script para atualizar a tabela user_disciplines para funcionar por concurso (target_id)
-- ATENÇÃO: Isso pode apagar as disciplinas atuais do usuário caso target_id seja exigido e o dado antigo fique órfão. 
-- Faremos um ajuste cuidadoso: primeiro adicionamos a coluna opcional, e depois aplicamos a chave única.

-- 1. Adicionar a coluna target_id
ALTER TABLE user_disciplines ADD COLUMN IF NOT EXISTS target_id uuid REFERENCES user_targets(id) ON DELETE CASCADE;

-- 2. (Opcional) Limpar dados antigos que possam conflitar com a nova restrição única,
-- pois agora as disciplinas deverão ser únicas por (user_id, target_id, discipline_id).
-- Se desejar começar do zero (já que o sistema anterior estava misturando tudo), execute:
-- DELETE FROM user_disciplines;

-- 3. Remover a restrição de unicidade antiga (que era user_id + discipline_id)
-- Vamos tentar remover pelo nome provável (pode falhar se o nome for diferente, mas normalmente é user_disciplines_user_id_discipline_id_key)
DO $$ 
BEGIN 
  BEGIN
    ALTER TABLE user_disciplines DROP CONSTRAINT user_disciplines_user_id_discipline_id_key;
  EXCEPTION
    WHEN undefined_object THEN null;
  END;
END $$;

-- 4. Adicionar a nova restrição de unicidade
ALTER TABLE user_disciplines ADD CONSTRAINT user_disciplines_user_target_discipline_key UNIQUE NULLS NOT DISTINCT (user_id, target_id, discipline_id);
