-- ============================================================================
-- SEED: Matérias base para concursos (INSS / concursos gerais)
--
-- Adiciona à tabela global `disciplines` as matérias solicitadas que
-- ainda não existam (idempotente via ON CONFLICT / NOT EXISTS).
--
-- Segurança: nenhuma linha é apagada ou alterada. Apenas INSERT.
-- ============================================================================

-- ▸ Matérias novas (com cor da paleta oficial do sistema) ------------------
-- ON CONFLICT (name) DO NOTHING garante idempotência total.

INSERT INTO disciplines (name, area, color_hex)
VALUES
  ('Ética no Serviço Público', 'Geral', '#22c55e'),
  ('Noções de Direito Constitucional', 'Direito', '#f43f5e'),
  ('Noções de Direito Administrativo', 'Direito', '#6366f1'),
  ('Noções de Informática', 'Exatas', '#0ea5e9'),
  ('Raciocínio Lógico-Matemático', 'Exatas', '#f59e0b'),
  ('Seguridade Social', 'Geral', '#10b981')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- VERIFICAÇÃO PÓS-SEED (rodar e conferir as 6 linhas)
-- ============================================================================
SELECT name, area, color_hex
FROM disciplines
WHERE name IN (
  'Ética no Serviço Público',
  'Noções de Direito Constitucional',
  'Noções de Direito Administrativo',
  'Noções de Informática',
  'Raciocínio Lógico-Matemático',
  'Seguridade Social'
)
ORDER BY name;
