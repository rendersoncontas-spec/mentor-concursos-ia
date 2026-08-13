-- ========================================================================================
-- MIGRATION: Catálogo global de tópicos e subtópicos (gerado automaticamente)
-- Fonte: src/application/topic-catalog/catalog.json · 26 disciplinas
-- Gerado por scripts/generate-topic-catalog-sql.mjs — NÃO editar manualmente.
-- ========================================================================================

-- 1. Função de normalização (imutável, sem dependência de extensões) — usada nos índices e no matching
CREATE OR REPLACE FUNCTION public.normalize_text(s text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
RETURN lower(btrim(translate(
  s,
  'áàâãäéèêëíìîïóòôõöúùûüçñýÿÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ',
  'aaaaaeeeeiiiiooooouuuucnyyAAAAAEEEEIIIIOOOOOUUUUCNY'
)));

-- 2. Tabela de tópicos do catálogo (reutiliza a tabela existente public.topics)
CREATE TABLE IF NOT EXISTS public.topics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  discipline_id uuid NOT NULL REFERENCES public.disciplines(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Unicidade normalizada (ignora caixa, acentos e espaços) para evitar duplicação
CREATE UNIQUE INDEX IF NOT EXISTS topics_discipline_name_norm_idx
  ON public.topics (discipline_id, public.normalize_text(name));

-- 3. Tabela de subtópicos do catálogo
CREATE TABLE IF NOT EXISTS public.subtopics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

CREATE UNIQUE INDEX IF NOT EXISTS subtopics_topic_name_norm_idx
  ON public.subtopics (topic_id, public.normalize_text(name));

-- 4. RLS
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subtopics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Todos podem ler tópicos" ON public.topics;
CREATE POLICY "Todos podem ler tópicos"
  ON public.topics FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Usuários autenticados podem criar tópicos" ON public.topics;
CREATE POLICY "Usuários autenticados podem criar tópicos"
  ON public.topics FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Todos podem ler subtópicos" ON public.subtopics;
CREATE POLICY "Todos podem ler subtópicos"
  ON public.subtopics FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Usuários autenticados podem criar subtópicos" ON public.subtopics;
CREATE POLICY "Usuários autenticados podem criar subtópicos"
  ON public.subtopics FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- ========================================================================================
-- 5. SEEDS (idempotentes: rodar N vezes não duplica — ON CONFLICT + normalização)
-- ========================================================================================

-- Língua Portuguesa (20 tópicos)
-- 5.1 Garante a disciplina (reutiliza a linha existente por nome/alias; só cria se não houver nenhuma)
INSERT INTO public.disciplines (name, area)
SELECT 'Língua Portuguesa', 'Linguagens'
WHERE NOT EXISTS (SELECT 1 FROM public.disciplines WHERE public.normalize_text(name) IN (public.normalize_text('Língua Portuguesa'), public.normalize_text('Português'), public.normalize_text('Língua Portuguesa (Português)'), public.normalize_text('Português (Língua Portuguesa)')));

-- 5.2 Tópicos padrão da disciplina
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Língua Portuguesa'), public.normalize_text('Português'), public.normalize_text('Língua Portuguesa (Português)'), public.normalize_text('Português (Língua Portuguesa)'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Língua Portuguesa') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.topics (discipline_id, name)
SELECT target.id, t.name
FROM target
JOIN (VALUES ('Compreensão e Interpretação de Textos'), ('Gêneros Textuais'), ('Tipologia Textual'), ('Coesão Textual'), ('Coerência Textual'), ('Semântica'), ('Funções da Linguagem'), ('Figuras de Linguagem'), ('Ortografia'), ('Acentuação'), ('Formação de Palavras'), ('Classes de Palavras'), ('Verbo'), ('Sintaxe'), ('Concordância'), ('Regência'), ('Crase'), ('Pontuação'), ('Colocação Pronominal'), ('Redação Oficial')) AS t(name) ON true
ON CONFLICT DO NOTHING;

-- 5.3 Subtópicos dos tópicos
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Língua Portuguesa'), public.normalize_text('Português'), public.normalize_text('Língua Portuguesa (Português)'), public.normalize_text('Português (Língua Portuguesa)'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Língua Portuguesa') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.subtopics (topic_id, name)
SELECT tp.id, s.name
FROM target
JOIN public.topics tp ON tp.discipline_id = target.id
JOIN (VALUES ('Compreensão e Interpretação de Textos', 'Ideia principal e secundárias'), ('Compreensão e Interpretação de Textos', 'Inferência'), ('Compreensão e Interpretação de Textos', 'Informação explícita e implícita'), ('Compreensão e Interpretação de Textos', 'Sentido contextual de palavras e expressões'), ('Compreensão e Interpretação de Textos', 'Relações entre partes do texto'), ('Compreensão e Interpretação de Textos', 'Elementos de coesão na interpretação'), ('Compreensão e Interpretação de Textos', 'Vozes e discursos no texto'), ('Compreensão e Interpretação de Textos', 'Função e efeito de sentido de recursos expressivos'), ('Gêneros Textuais', 'Gêneros do cotidiano'), ('Gêneros Textuais', 'Gêneros jornalísticos'), ('Gêneros Textuais', 'Gêneros científicos e acadêmicos'), ('Gêneros Textuais', 'Gêneros oficiais'), ('Gêneros Textuais', 'Gêneros digitais'), ('Gêneros Textuais', 'Suporte e circulação dos gêneros'), ('Tipologia Textual', 'Narração'), ('Tipologia Textual', 'Descrição'), ('Tipologia Textual', 'Dissertação'), ('Tipologia Textual', 'Exposição'), ('Tipologia Textual', 'Injunção'), ('Tipologia Textual', 'Sequências textuais dominantes'), ('Coesão Textual', 'Coesão referencial'), ('Coesão Textual', 'Coesão sequencial'), ('Coesão Textual', 'Anáfora e catáfora'), ('Coesão Textual', 'Conectores e operadores argumentativos'), ('Coesão Textual', 'Elipse e substituição'), ('Coesão Textual', 'Reiteração'), ('Coerência Textual', 'Princípios de coerência'), ('Coerência Textual', 'Coerência e progressão temática'), ('Coerência Textual', 'Implicaturas e pressupostos'), ('Coerência Textual', 'Quebras de coerência'), ('Coerência Textual', 'Coerência e contexto'), ('Semântica', 'Significação das palavras'), ('Semântica', 'Sinônimos e antônimos'), ('Semântica', 'Polissemia'), ('Semântica', 'Homonímia e paronímia'), ('Semântica', 'Conotação e denotação'), ('Semântica', 'Ambiguidade e duplo sentido'), ('Funções da Linguagem', 'Função referencial'), ('Funções da Linguagem', 'Função emotiva'), ('Funções da Linguagem', 'Função conativa'), ('Funções da Linguagem', 'Função fática'), ('Funções da Linguagem', 'Função metalinguística'), ('Funções da Linguagem', 'Função poética'), ('Figuras de Linguagem', 'Figuras de palavras'), ('Figuras de Linguagem', 'Figuras de pensamento'), ('Figuras de Linguagem', 'Figuras de sintaxe'), ('Figuras de Linguagem', 'Figuras de som'), ('Figuras de Linguagem', 'Vícios de linguagem'), ('Ortografia', 'Emprego das letras'), ('Ortografia', 'Uso do hífen'), ('Ortografia', 'Novo Acordo Ortográfico'), ('Ortografia', 'Sufixos e prefixos'), ('Ortografia', 'Homófonos e homógrafos'), ('Acentuação', 'Regras gerais'), ('Acentuação', 'Acentuação dos hiatos'), ('Acentuação', 'Acentos diferenciais'), ('Acentuação', 'Proparoxítonas, paroxítonas e oxítonas'), ('Acentuação', 'Novo Acordo Ortográfico'), ('Formação de Palavras', 'Estrutura das palavras'), ('Formação de Palavras', 'Radical, prefixo e sufixo'), ('Formação de Palavras', 'Composição por justaposição e aglutinação'), ('Formação de Palavras', 'Derivação'), ('Formação de Palavras', 'Abreviação, siglas e estrangeirismos'), ('Classes de Palavras', 'Substantivo'), ('Classes de Palavras', 'Adjetivo'), ('Classes de Palavras', 'Artigo'), ('Classes de Palavras', 'Pronome'), ('Classes de Palavras', 'Numeral'), ('Classes de Palavras', 'Advérbio'), ('Classes de Palavras', 'Preposição'), ('Classes de Palavras', 'Conjunção'), ('Classes de Palavras', 'Interjeição'), ('Classes de Palavras', 'Verbo'), ('Verbo', 'Conjugação verbal'), ('Verbo', 'Tempos e modos verbais'), ('Verbo', 'Vozes verbais'), ('Verbo', 'Locuções verbais'), ('Verbo', 'Correlação verbal'), ('Verbo', 'Verbos regulares e irregulares'), ('Verbo', 'Formas nominais do verbo'), ('Sintaxe', 'Termos da oração'), ('Sintaxe', 'Sujeito e predicado'), ('Sintaxe', 'Complementos verbais e nominais'), ('Sintaxe', 'Adjuntos e aposto'), ('Sintaxe', 'Vocativo'), ('Sintaxe', 'Período simples'), ('Sintaxe', 'Período composto'), ('Sintaxe', 'Coordenação'), ('Sintaxe', 'Subordinação'), ('Concordância', 'Concordância verbal'), ('Concordância', 'Concordância nominal'), ('Concordância', 'Casos especiais'), ('Concordância', 'Concordância com sujeito simples e composto'), ('Concordância', 'Concordância com verbos impessoais'), ('Concordância', 'Coletivos e partitivos'), ('Regência', 'Regência verbal'), ('Regência', 'Regência nominal'), ('Regência', 'Crase e regência'), ('Regência', 'Casos especiais'), ('Regência', 'Regência de pronomes relativos'), ('Crase', 'Casos obrigatórios'), ('Crase', 'Casos proibidos'), ('Crase', 'Casos facultativos'), ('Crase', 'Crase com pronomes'), ('Crase', 'Crase com locuções'), ('Pontuação', 'Vírgula'), ('Pontuação', 'Ponto e vírgula'), ('Pontuação', 'Dois-pontos'), ('Pontuação', 'Ponto final'), ('Pontuação', 'Reticências'), ('Pontuação', 'Parênteses e colchetes'), ('Pontuação', 'Aspas e travessão'), ('Pontuação', 'Aposto e vocativo'), ('Colocação Pronominal', 'Próclise'), ('Colocação Pronominal', 'Ênclise'), ('Colocação Pronominal', 'Mesóclise'), ('Colocação Pronominal', 'Casos especiais'), ('Colocação Pronominal', 'Colocação com locuções verbais'), ('Redação Oficial', 'Manual de Redação'), ('Redação Oficial', 'Padrões oficiais'), ('Redação Oficial', 'Impressões, memorandos e ofícios'), ('Redação Oficial', 'Pronomes de tratamento'), ('Redação Oficial', 'Clareza, concisão e impessoalidade')) AS s(topic_name, name) ON true
WHERE public.normalize_text(tp.name) = public.normalize_text(s.topic_name)
ON CONFLICT DO NOTHING;

-- Matemática (16 tópicos)
-- 5.1 Garante a disciplina (reutiliza a linha existente por nome/alias; só cria se não houver nenhuma)
INSERT INTO public.disciplines (name, area)
SELECT 'Matemática', 'Exatas'
WHERE NOT EXISTS (SELECT 1 FROM public.disciplines WHERE public.normalize_text(name) IN (public.normalize_text('Matemática'), public.normalize_text('Matemática Básica'), public.normalize_text('Matemática Financeira e Raciocínio Lógico')));

-- 5.2 Tópicos padrão da disciplina
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Matemática'), public.normalize_text('Matemática Básica'), public.normalize_text('Matemática Financeira e Raciocínio Lógico'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Matemática') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.topics (discipline_id, name)
SELECT target.id, t.name
FROM target
JOIN (VALUES ('Conjuntos'), ('Operações'), ('Razão e Proporção'), ('Regra de Três'), ('Porcentagem'), ('Equações'), ('Inequações'), ('Funções'), ('Sequências'), ('Geometria Plana'), ('Geometria Espacial'), ('Trigonometria'), ('Análise Combinatória'), ('Probabilidade'), ('Estatística'), ('Matemática Financeira')) AS t(name) ON true
ON CONFLICT DO NOTHING;

-- 5.3 Subtópicos dos tópicos
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Matemática'), public.normalize_text('Matemática Básica'), public.normalize_text('Matemática Financeira e Raciocínio Lógico'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Matemática') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.subtopics (topic_id, name)
SELECT tp.id, s.name
FROM target
JOIN public.topics tp ON tp.discipline_id = target.id
JOIN (VALUES ('Conjuntos', 'Conjuntos numéricos'), ('Conjuntos', 'Subconjuntos'), ('Conjuntos', 'Operações entre conjuntos'), ('Conjuntos', 'Diagramas de Venn'), ('Conjuntos', 'Intervalos'), ('Operações', 'Adição, subtração, multiplicação e divisão'), ('Operações', 'Potenciação'), ('Operações', 'Radiciação'), ('Operações', 'Múltiplos e divisores'), ('Operações', 'MMC e MDC'), ('Operações', 'Números primos'), ('Razão e Proporção', 'Razão'), ('Razão e Proporção', 'Proporção'), ('Razão e Proporção', 'Grandezas direta e inversamente proporcionais'), ('Razão e Proporção', 'Divisão proporcional'), ('Regra de Três', 'Regra de três simples'), ('Regra de Três', 'Regra de três composta'), ('Porcentagem', 'Cálculo de percentuais'), ('Porcentagem', 'Aumentos e descontos'), ('Porcentagem', 'Aumentos e descontos sucessivos'), ('Porcentagem', 'Variação percentual'), ('Equações', 'Equações do 1º grau'), ('Equações', 'Equações do 2º grau'), ('Equações', 'Equações com mais de uma variável'), ('Equações', 'Sistemas de equações'), ('Inequações', 'Inequações do 1º grau'), ('Inequações', 'Inequações do 2º grau'), ('Inequações', 'Inequações produto e quociente'), ('Funções', 'Conceito de função'), ('Funções', 'Domínio, contradomínio e imagem'), ('Funções', 'Função afim'), ('Funções', 'Função quadrática'), ('Funções', 'Função exponencial'), ('Funções', 'Função logarítmica'), ('Funções', 'Composição e inversa'), ('Sequências', 'Progressão aritmética'), ('Sequências', 'Progressão geométrica'), ('Sequências', 'Termo geral'), ('Sequências', 'Soma dos termos'), ('Geometria Plana', 'Triângulos'), ('Geometria Plana', 'Quadriláteros'), ('Geometria Plana', 'Circunferência e círculo'), ('Geometria Plana', 'Áreas e perímetros'), ('Geometria Plana', 'Teorema de Pitágoras'), ('Geometria Plana', 'Semelhança de figuras'), ('Geometria Espacial', 'Prismas'), ('Geometria Espacial', 'Pirâmides'), ('Geometria Espacial', 'Cilindros'), ('Geometria Espacial', 'Cones'), ('Geometria Espacial', 'Esferas'), ('Geometria Espacial', 'Áreas e volumes'), ('Trigonometria', 'Razões trigonométricas'), ('Trigonometria', 'Relações fundamentais'), ('Trigonometria', 'Arcos notáveis'), ('Trigonometria', 'Lei dos senos e cossenos'), ('Trigonometria', 'Funções trigonométricas'), ('Análise Combinatória', 'Princípio fundamental da contagem'), ('Análise Combinatória', 'Permutações'), ('Análise Combinatória', 'Arranjos'), ('Análise Combinatória', 'Combinações'), ('Análise Combinatória', 'Permutações com repetição'), ('Probabilidade', 'Espaço amostral'), ('Probabilidade', 'Probabilidade da união e intersecção'), ('Probabilidade', 'Probabilidade condicional'), ('Probabilidade', 'Eventos independentes'), ('Probabilidade', 'Distribuição binomial'), ('Estatística', 'Tabelas e gráficos'), ('Estatística', 'Média aritmética'), ('Estatística', 'Moda'), ('Estatística', 'Mediana'), ('Estatística', 'Variância e desvio padrão'), ('Matemática Financeira', 'Juros simples'), ('Matemática Financeira', 'Juros compostos'), ('Matemática Financeira', 'Descontos'), ('Matemática Financeira', 'Taxas equivalentes'), ('Matemática Financeira', 'Inflação'), ('Matemática Financeira', 'Séries de pagamentos')) AS s(topic_name, name) ON true
WHERE public.normalize_text(tp.name) = public.normalize_text(s.topic_name)
ON CONFLICT DO NOTHING;

-- Raciocínio Lógico (13 tópicos)
-- 5.1 Garante a disciplina (reutiliza a linha existente por nome/alias; só cria se não houver nenhuma)
INSERT INTO public.disciplines (name, area)
SELECT 'Raciocínio Lógico', 'Exatas'
WHERE NOT EXISTS (SELECT 1 FROM public.disciplines WHERE public.normalize_text(name) IN (public.normalize_text('Raciocínio Lógico'), public.normalize_text('Raciocínio Lógico-Matemático'), public.normalize_text('Raciocínio Lógico Matemático'), public.normalize_text('RLM')));

-- 5.2 Tópicos padrão da disciplina
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Raciocínio Lógico'), public.normalize_text('Raciocínio Lógico-Matemático'), public.normalize_text('Raciocínio Lógico Matemático'), public.normalize_text('RLM'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Raciocínio Lógico') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.topics (discipline_id, name)
SELECT target.id, t.name
FROM target
JOIN (VALUES ('Proposições'), ('Conectivos'), ('Tabela-Verdade'), ('Equivalências'), ('Negação'), ('Argumentação'), ('Quantificadores'), ('Diagramas Lógicos'), ('Lógica de Argumentação'), ('Conjuntos'), ('Sequências'), ('Análise Combinatória'), ('Probabilidade')) AS t(name) ON true
ON CONFLICT DO NOTHING;

-- 5.3 Subtópicos dos tópicos
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Raciocínio Lógico'), public.normalize_text('Raciocínio Lógico-Matemático'), public.normalize_text('Raciocínio Lógico Matemático'), public.normalize_text('RLM'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Raciocínio Lógico') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.subtopics (topic_id, name)
SELECT tp.id, s.name
FROM target
JOIN public.topics tp ON tp.discipline_id = target.id
JOIN (VALUES ('Proposições', 'Conceito de proposição'), ('Proposições', 'Proposições simples e compostas'), ('Proposições', 'Sentenças abertas'), ('Proposições', 'Valor lógico'), ('Conectivos', 'Conjunção'), ('Conectivos', 'Disjunção inclusiva e exclusiva'), ('Conectivos', 'Condicional'), ('Conectivos', 'Bicondicional'), ('Conectivos', 'Conectivos e operações lógicas'), ('Tabela-Verdade', 'Construção de tabelas-verdade'), ('Tabela-Verdade', 'Número de linhas'), ('Tabela-Verdade', 'Tautologias, contradições e contingências'), ('Equivalências', 'Equivalências notáveis'), ('Equivalências', 'Leis de De Morgan'), ('Equivalências', 'Equivalências do condicional'), ('Equivalências', 'Negação de proposições compostas'), ('Negação', 'Negação de proposições simples'), ('Negação', 'Negação de proposições compostas'), ('Negação', 'Negação do condicional'), ('Negação', 'Negação de quantificadores'), ('Argumentação', 'Argumento válido e inválido'), ('Argumentação', 'Premissas e conclusão'), ('Argumentação', 'Métodos de validação'), ('Argumentação', 'Argumentos e dedução'), ('Quantificadores', 'Quantificador universal'), ('Quantificadores', 'Quantificador existencial'), ('Quantificadores', 'Negação de proposições quantificadas'), ('Quantificadores', 'Diagramas lógicos com quantificadores'), ('Diagramas Lógicos', 'Relações de conjunto'), ('Diagramas Lógicos', 'Diagramas de Venn'), ('Diagramas Lógicos', 'Silogismos e conclusões'), ('Lógica de Argumentação', 'Argumentação cotidiana'), ('Lógica de Argumentação', 'Assunção e dedução'), ('Lógica de Argumentação', 'Analogias'), ('Lógica de Argumentação', 'Sofismas e falácias'), ('Conjuntos', 'Operações entre conjuntos'), ('Conjuntos', 'Elementos e subconjuntos'), ('Conjuntos', 'Problemas com conjuntos'), ('Sequências', 'Sequências numéricas'), ('Sequências', 'Sequências figurais'), ('Sequências', 'Lei de formação'), ('Sequências', 'Sequências lógicas'), ('Análise Combinatória', 'Princípio da contagem'), ('Análise Combinatória', 'Arranjos e combinações'), ('Análise Combinatória', 'Permutações'), ('Análise Combinatória', 'Problemas de contagem'), ('Probabilidade', 'Eventos'), ('Probabilidade', 'Probabilidade condicional'), ('Probabilidade', 'Probabilidade de eventos compostos'), ('Probabilidade', 'Espaços equiprováveis')) AS s(topic_name, name) ON true
WHERE public.normalize_text(tp.name) = public.normalize_text(s.topic_name)
ON CONFLICT DO NOTHING;

-- Direito Constitucional (16 tópicos)
-- 5.1 Garante a disciplina (reutiliza a linha existente por nome/alias; só cria se não houver nenhuma)
INSERT INTO public.disciplines (name, area)
SELECT 'Direito Constitucional', 'Direito'
WHERE NOT EXISTS (SELECT 1 FROM public.disciplines WHERE public.normalize_text(name) IN (public.normalize_text('Direito Constitucional'), public.normalize_text('Constitucional'), public.normalize_text('Direito Constitucional e Administrativo')));

-- 5.2 Tópicos padrão da disciplina
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Direito Constitucional'), public.normalize_text('Constitucional'), public.normalize_text('Direito Constitucional e Administrativo'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Direito Constitucional') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.topics (discipline_id, name)
SELECT target.id, t.name
FROM target
JOIN (VALUES ('Teoria da Constituição'), ('Princípios Fundamentais'), ('Direitos Fundamentais'), ('Nacionalidade'), ('Direitos Políticos'), ('Partidos Políticos'), ('Organização do Estado'), ('Intervenção'), ('Administração Pública'), ('Poder Legislativo'), ('Poder Executivo'), ('Poder Judiciário'), ('Funções Essenciais à Justiça'), ('Controle de Constitucionalidade'), ('Ordem Social'), ('Tributação e Orçamento na Constituição')) AS t(name) ON true
ON CONFLICT DO NOTHING;

-- 5.3 Subtópicos dos tópicos
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Direito Constitucional'), public.normalize_text('Constitucional'), public.normalize_text('Direito Constitucional e Administrativo'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Direito Constitucional') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.subtopics (topic_id, name)
SELECT tp.id, s.name
FROM target
JOIN public.topics tp ON tp.discipline_id = target.id
JOIN (VALUES ('Teoria da Constituição', 'Conceito e classificação das constituições'), ('Teoria da Constituição', 'Poder constituinte'), ('Teoria da Constituição', 'Normas constitucionais'), ('Teoria da Constituição', 'Eficácia e aplicabilidade'), ('Teoria da Constituição', 'Hermenêutica constitucional'), ('Princípios Fundamentais', 'Fundamentos da República'), ('Princípios Fundamentais', 'Separação dos Poderes'), ('Princípios Fundamentais', 'Objetivos fundamentais'), ('Princípios Fundamentais', 'Princípios nas relações internacionais'), ('Direitos Fundamentais', 'Direitos individuais'), ('Direitos Fundamentais', 'Direitos coletivos'), ('Direitos Fundamentais', 'Direitos sociais'), ('Direitos Fundamentais', 'Direitos de nacionalidade'), ('Direitos Fundamentais', 'Direitos políticos'), ('Direitos Fundamentais', 'Garantias fundamentais'), ('Direitos Fundamentais', 'Cláusulas pétreas'), ('Direitos Fundamentais', 'Limites e restrições'), ('Nacionalidade', 'Nacionalidade originária e derivada'), ('Nacionalidade', 'Português equiparado'), ('Nacionalidade', 'Perda de nacionalidade'), ('Direitos Políticos', 'Sufrágio e voto'), ('Direitos Políticos', 'Elegibilidade'), ('Direitos Políticos', 'Perda e suspensão dos direitos políticos'), ('Direitos Políticos', 'Ações de impugnação'), ('Partidos Políticos', 'Liberdade de criação'), ('Partidos Políticos', 'Funcionamento parlamentar'), ('Partidos Políticos', 'Prestação de contas'), ('Organização do Estado', 'União'), ('Organização do Estado', 'Estados'), ('Organização do Estado', 'Municípios'), ('Organização do Estado', 'Distrito Federal'), ('Organização do Estado', 'Territórios'), ('Organização do Estado', 'Competências'), ('Organização do Estado', 'Bens públicos'), ('Intervenção', 'Intervenção federal'), ('Intervenção', 'Intervenção estadual'), ('Intervenção', 'Limites e controle'), ('Administração Pública', 'Princípios constitucionais'), ('Administração Pública', 'Servidores públicos'), ('Administração Pública', 'Estabilidade'), ('Administração Pública', 'Acumulação de cargos'), ('Administração Pública', 'Responsabilidade civil do Estado'), ('Poder Legislativo', 'Estrutura do Congresso Nacional'), ('Poder Legislativo', 'Comissões'), ('Poder Legislativo', 'Processo legislativo'), ('Poder Legislativo', 'Espécies normativas'), ('Poder Legislativo', 'Imunidades e prerrogativas'), ('Poder Legislativo', 'Fiscalização contábil e orçamentária'), ('Poder Executivo', 'Presidente da República'), ('Poder Executivo', 'Atribuições'), ('Poder Executivo', 'Responsabilidade'), ('Poder Executivo', 'Ministros de Estado'), ('Poder Judiciário', 'Órgãos do Judiciário'), ('Poder Judiciário', 'Garantias da magistratura'), ('Poder Judiciário', 'Quinto constitucional'), ('Poder Judiciário', 'Conselho Nacional de Justiça'), ('Poder Judiciário', 'Competências'), ('Funções Essenciais à Justiça', 'Ministério Público'), ('Funções Essenciais à Justiça', 'Advocacia Pública'), ('Funções Essenciais à Justiça', 'Advocacia'), ('Funções Essenciais à Justiça', 'Defensoria Pública'), ('Controle de Constitucionalidade', 'Controle difuso e concentrado'), ('Controle de Constitucionalidade', 'Ação direta de inconstitucionalidade'), ('Controle de Constitucionalidade', 'Ação declaratória de constitucionalidade'), ('Controle de Constitucionalidade', 'Arguição de descumprimento de preceito fundamental'), ('Controle de Constitucionalidade', 'Súmula vinculante'), ('Controle de Constitucionalidade', 'Efeitos das decisões'), ('Ordem Social', 'Seguridade social'), ('Ordem Social', 'Educação'), ('Ordem Social', 'Saúde'), ('Ordem Social', 'Previdência e assistência'), ('Ordem Social', 'Meio ambiente'), ('Ordem Social', 'Cultura e comunicação'), ('Tributação e Orçamento na Constituição', 'Sistema tributário nacional'), ('Tributação e Orçamento na Constituição', 'Limitações ao poder de tributar'), ('Tributação e Orçamento na Constituição', 'Orçamento'), ('Tributação e Orçamento na Constituição', 'Crédito adicional')) AS s(topic_name, name) ON true
WHERE public.normalize_text(tp.name) = public.normalize_text(s.topic_name)
ON CONFLICT DO NOTHING;

-- Direito Administrativo (19 tópicos)
-- 5.1 Garante a disciplina (reutiliza a linha existente por nome/alias; só cria se não houver nenhuma)
INSERT INTO public.disciplines (name, area)
SELECT 'Direito Administrativo', 'Direito'
WHERE NOT EXISTS (SELECT 1 FROM public.disciplines WHERE public.normalize_text(name) IN (public.normalize_text('Direito Administrativo'), public.normalize_text('Administrativo')));

-- 5.2 Tópicos padrão da disciplina
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Direito Administrativo'), public.normalize_text('Administrativo'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Direito Administrativo') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.topics (discipline_id, name)
SELECT target.id, t.name
FROM target
JOIN (VALUES ('Princípios da Administração Pública'), ('Administração Direta'), ('Administração Indireta'), ('Centralização e Descentralização'), ('Atos Administrativos'), ('Poderes Administrativos'), ('Poder de Polícia'), ('Serviços Públicos'), ('Agentes Públicos'), ('Servidores Públicos'), ('Responsabilidade Civil do Estado'), ('Bens Públicos'), ('Licitações'), ('Contratos Administrativos'), ('Improbidade Administrativa'), ('Processo Administrativo'), ('Controle da Administração'), ('Intervenção do Estado na Propriedade'), ('Terceiro Setor')) AS t(name) ON true
ON CONFLICT DO NOTHING;

-- 5.3 Subtópicos dos tópicos
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Direito Administrativo'), public.normalize_text('Administrativo'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Direito Administrativo') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.subtopics (topic_id, name)
SELECT tp.id, s.name
FROM target
JOIN public.topics tp ON tp.discipline_id = target.id
JOIN (VALUES ('Princípios da Administração Pública', 'Legalidade'), ('Princípios da Administração Pública', 'Impessoalidade'), ('Princípios da Administração Pública', 'Moralidade'), ('Princípios da Administração Pública', 'Publicidade'), ('Princípios da Administração Pública', 'Eficiência'), ('Princípios da Administração Pública', 'Outros princípios implícitos'), ('Administração Direta', 'Órgãos públicos'), ('Administração Direta', 'Desconcentração'), ('Administração Direta', 'Estrutura administrativa'), ('Administração Indireta', 'Autarquias'), ('Administração Indireta', 'Fundações públicas'), ('Administração Indireta', 'Empresas públicas'), ('Administração Indireta', 'Sociedades de economia mista'), ('Administração Indireta', 'Entidades de fiscalização'), ('Centralização e Descentralização', 'Desconcentração e descentralização'), ('Centralização e Descentralização', 'Delegação e outorga'), ('Atos Administrativos', 'Conceito e atributos'), ('Atos Administrativos', 'Elementos e requisitos'), ('Atos Administrativos', 'Classificação'), ('Atos Administrativos', 'Discricionariedade e vinculação'), ('Atos Administrativos', 'Extinção e invalidação'), ('Atos Administrativos', 'Revogação e anulação'), ('Atos Administrativos', 'Convalidação'), ('Poderes Administrativos', 'Poder vinculado'), ('Poderes Administrativos', 'Poder discricionário'), ('Poderes Administrativos', 'Poder hierárquico'), ('Poderes Administrativos', 'Poder disciplinar'), ('Poderes Administrativos', 'Poder regulamentar'), ('Poderes Administrativos', 'Abuso de poder'), ('Poder de Polícia', 'Conceito e fundamento'), ('Poder de Polícia', 'Atributos'), ('Poder de Polícia', 'Limites'), ('Poder de Polícia', 'Polícia administrativa e judiciária'), ('Serviços Públicos', 'Conceito e princípios'), ('Serviços Públicos', 'Classificação'), ('Serviços Públicos', 'Delegação e concessão'), ('Serviços Públicos', 'Permissão e autorização'), ('Serviços Públicos', 'Parcerias público-privadas'), ('Agentes Públicos', 'Espécies'), ('Agentes Públicos', 'Cargos, empregos e funções'), ('Agentes Públicos', 'Provimento e vacância'), ('Agentes Públicos', 'Nomeação e posse'), ('Agentes Públicos', 'Acumulação e vedações'), ('Servidores Públicos', 'Regime estatutário e celetista'), ('Servidores Públicos', 'Direitos e deveres'), ('Servidores Públicos', 'Licenças e afastamentos'), ('Servidores Públicos', 'Aposentadoria'), ('Servidores Públicos', 'Sindicância e processo administrativo disciplinar'), ('Responsabilidade Civil do Estado', 'Responsabilidade objetiva e subjetiva'), ('Responsabilidade Civil do Estado', 'Ação regressiva'), ('Responsabilidade Civil do Estado', 'Culpa do Estado'), ('Responsabilidade Civil do Estado', 'Responsabilidade por omissão'), ('Responsabilidade Civil do Estado', 'Excludentes'), ('Bens Públicos', 'Classificação'), ('Bens Públicos', 'Características'), ('Bens Públicos', 'Utilização'), ('Bens Públicos', 'Alienação'), ('Licitações', 'Princípios'), ('Licitações', 'Modalidades'), ('Licitações', 'Procedimento'), ('Licitações', 'Contratação direta'), ('Licitações', 'Dispensa e inexigibilidade'), ('Licitações', 'Sanções e recursos'), ('Licitações', 'Nova Lei de Licitações (14.133/2021)'), ('Contratos Administrativos', 'Cláusulas exorbitantes'), ('Contratos Administrativos', 'Duração'), ('Contratos Administrativos', 'Alteração e extinção'), ('Contratos Administrativos', 'Equilíbrio econômico-financeiro'), ('Improbidade Administrativa', 'Atos de improbidade'), ('Improbidade Administrativa', 'Sanções'), ('Improbidade Administrativa', 'Prescrição'), ('Improbidade Administrativa', 'Lei 8.429/1992'), ('Processo Administrativo', 'Princípios'), ('Processo Administrativo', 'Fases'), ('Processo Administrativo', 'Recursos administrativos'), ('Processo Administrativo', 'Prescrição'), ('Processo Administrativo', 'Lei 9.784/1999'), ('Controle da Administração', 'Controle administrativo'), ('Controle da Administração', 'Controle legislativo'), ('Controle da Administração', 'Controle judicial'), ('Controle da Administração', 'Tribunal de Contas'), ('Controle da Administração', 'Ouvidoria e correição'), ('Intervenção do Estado na Propriedade', 'Desapropriação'), ('Intervenção do Estado na Propriedade', 'Requisição'), ('Intervenção do Estado na Propriedade', 'Servidão administrativa'), ('Intervenção do Estado na Propriedade', 'Ocupação temporária'), ('Intervenção do Estado na Propriedade', 'Limitações administrativas'), ('Intervenção do Estado na Propriedade', 'Tombamento'), ('Terceiro Setor', 'Organizações sociais'), ('Terceiro Setor', 'Organizações da sociedade civil de interesse público'), ('Terceiro Setor', 'Acordos e parcerias')) AS s(topic_name, name) ON true
WHERE public.normalize_text(tp.name) = public.normalize_text(s.topic_name)
ON CONFLICT DO NOTHING;

-- Direito Tributário (10 tópicos)
-- 5.1 Garante a disciplina (reutiliza a linha existente por nome/alias; só cria se não houver nenhuma)
INSERT INTO public.disciplines (name, area)
SELECT 'Direito Tributário', 'Direito'
WHERE NOT EXISTS (SELECT 1 FROM public.disciplines WHERE public.normalize_text(name) IN (public.normalize_text('Direito Tributário'), public.normalize_text('Tributário'), public.normalize_text('Legislação Tributária')));

-- 5.2 Tópicos padrão da disciplina
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Direito Tributário'), public.normalize_text('Tributário'), public.normalize_text('Legislação Tributária'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Direito Tributário') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.topics (discipline_id, name)
SELECT target.id, t.name
FROM target
JOIN (VALUES ('Sistema Tributário Nacional'), ('Princípios Tributários'), ('Competência Tributária'), ('Tributos'), ('Obrigação Tributária'), ('Crédito Tributário'), ('Imunidades'), ('Isenções'), ('Administração Tributária'), ('Processo Tributário')) AS t(name) ON true
ON CONFLICT DO NOTHING;

-- 5.3 Subtópicos dos tópicos
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Direito Tributário'), public.normalize_text('Tributário'), public.normalize_text('Legislação Tributária'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Direito Tributário') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.subtopics (topic_id, name)
SELECT tp.id, s.name
FROM target
JOIN public.topics tp ON tp.discipline_id = target.id
JOIN (VALUES ('Sistema Tributário Nacional', 'Estrutura constitucional'), ('Sistema Tributário Nacional', 'Fontes do direito tributário'), ('Sistema Tributário Nacional', 'Vigência e aplicação'), ('Princípios Tributários', 'Legalidade'), ('Princípios Tributários', 'Anterioridade'), ('Princípios Tributários', 'Irretroatividade'), ('Princípios Tributários', 'Igualdade'), ('Princípios Tributários', 'Capacidade contributiva'), ('Princípios Tributários', 'Vedação ao confisco'), ('Competência Tributária', 'Competência da União, Estados, Municípios e DF'), ('Competência Tributária', 'Competência residual'), ('Competência Tributária', 'Competência cumulativa'), ('Competência Tributária', 'Limites ao exercício'), ('Tributos', 'Impostos'), ('Tributos', 'Taxas'), ('Tributos', 'Contribuições de melhoria'), ('Tributos', 'Empréstimos compulsórios'), ('Tributos', 'Contribuições especiais'), ('Tributos', 'Espécies tributárias'), ('Obrigação Tributária', 'Obrigação principal e acessória'), ('Obrigação Tributária', 'Fato gerador'), ('Obrigação Tributária', 'Sujeito ativo e passivo'), ('Obrigação Tributária', 'Solidariedade'), ('Obrigação Tributária', 'Responsabilidade dos sucessores e terceiros'), ('Crédito Tributário', 'Constituição do crédito'), ('Crédito Tributário', 'Lançamento'), ('Crédito Tributário', 'Modalidades de lançamento'), ('Crédito Tributário', 'Notificação'), ('Crédito Tributário', 'Suspensão'), ('Crédito Tributário', 'Extinção'), ('Crédito Tributário', 'Exclusão'), ('Imunidades', 'Imunidades constitucionais'), ('Imunidades', 'Imunidade recíproca'), ('Imunidades', 'Imunidade de templos e livros'), ('Imunidades', 'Imunidade de entidades sem fins lucrativos'), ('Isenções', 'Conceito e espécies'), ('Isenções', 'Isenção e anistia'), ('Isenções', 'Revogação'), ('Administração Tributária', 'Fiscalização'), ('Administração Tributária', 'Dívida ativa'), ('Administração Tributária', 'Certidões'), ('Administração Tributária', 'Domicílio tributário'), ('Administração Tributária', 'Sigilo fiscal'), ('Processo Tributário', 'Processo administrativo fiscal'), ('Processo Tributário', 'Consultas'), ('Processo Tributário', 'Recursos'), ('Processo Tributário', 'Ação anulatória e repetição de indébito'), ('Processo Tributário', 'Mandado de segurança')) AS s(topic_name, name) ON true
WHERE public.normalize_text(tp.name) = public.normalize_text(s.topic_name)
ON CONFLICT DO NOTHING;

-- Direito Penal (15 tópicos)
-- 5.1 Garante a disciplina (reutiliza a linha existente por nome/alias; só cria se não houver nenhuma)
INSERT INTO public.disciplines (name, area)
SELECT 'Direito Penal', 'Direito'
WHERE NOT EXISTS (SELECT 1 FROM public.disciplines WHERE public.normalize_text(name) IN (public.normalize_text('Direito Penal'), public.normalize_text('Penal')));

-- 5.2 Tópicos padrão da disciplina
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Direito Penal'), public.normalize_text('Penal'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Direito Penal') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.topics (discipline_id, name)
SELECT target.id, t.name
FROM target
JOIN (VALUES ('Princípios do Direito Penal'), ('Aplicação da Lei Penal'), ('Crime'), ('Tipicidade'), ('Ilicitude'), ('Culpabilidade'), ('Concurso de Pessoas'), ('Concurso de Crimes'), ('Penas'), ('Extinção da Punibilidade'), ('Crimes Contra a Pessoa'), ('Crimes Contra o Patrimônio'), ('Crimes Contra a Administração Pública'), ('Crimes Contra a Fé Pública'), ('Crimes Sexuais')) AS t(name) ON true
ON CONFLICT DO NOTHING;

-- 5.3 Subtópicos dos tópicos
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Direito Penal'), public.normalize_text('Penal'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Direito Penal') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.subtopics (topic_id, name)
SELECT tp.id, s.name
FROM target
JOIN public.topics tp ON tp.discipline_id = target.id
JOIN (VALUES ('Princípios do Direito Penal', 'Legalidade'), ('Princípios do Direito Penal', 'Anterioridade'), ('Princípios do Direito Penal', 'Intervenção mínima'), ('Princípios do Direito Penal', 'Lesividade'), ('Princípios do Direito Penal', 'Humanidade'), ('Princípios do Direito Penal', 'Individualização da pena'), ('Aplicação da Lei Penal', 'Tempo do crime'), ('Aplicação da Lei Penal', 'Lugar do crime'), ('Aplicação da Lei Penal', 'Lei penal no tempo e no espaço'), ('Aplicação da Lei Penal', 'Contagem de prazo'), ('Aplicação da Lei Penal', 'Exclusão de antijuridicidade'), ('Crime', 'Conceito analítico'), ('Crime', 'Fato típico'), ('Crime', 'Antijuridicidade'), ('Crime', 'Culpabilidade'), ('Crime', 'Iter criminis'), ('Crime', 'Crime consumado e tentado'), ('Tipicidade', 'Tipo penal'), ('Tipicidade', 'Tipicidade formal e material'), ('Tipicidade', 'Dolo e culpa'), ('Tipicidade', 'Erro de tipo'), ('Tipicidade', 'Desistência voluntária e arrependimento eficaz'), ('Ilicitude', 'Legítima defesa'), ('Ilicitude', 'Estado de necessidade'), ('Ilicitude', 'Estrito cumprimento do dever legal'), ('Ilicitude', 'Exercício regular de direito'), ('Ilicitude', 'Excesso punível'), ('Culpabilidade', 'Imputabilidade'), ('Culpabilidade', 'Potencial consciência da ilicitude'), ('Culpabilidade', 'Exigibilidade de conduta diversa'), ('Culpabilidade', 'Inimputáveis'), ('Concurso de Pessoas', 'Autoria e participação'), ('Concurso de Pessoas', 'Concurso necessário'), ('Concurso de Pessoas', 'Cooperação dolosamente distinta'), ('Concurso de Crimes', 'Concurso material'), ('Concurso de Crimes', 'Concurso formal'), ('Concurso de Crimes', 'Crime continuado'), ('Penas', 'Espécies de pena'), ('Penas', 'Privativas de liberdade'), ('Penas', 'Restritivas de direitos'), ('Penas', 'Multa'), ('Penas', 'Regimes'), ('Penas', 'Sursis e livramento condicional'), ('Extinção da Punibilidade', 'Morte do agente'), ('Extinção da Punibilidade', 'Prescrição'), ('Extinção da Punibilidade', 'Anistia, graça e indulto'), ('Extinção da Punibilidade', 'Decadência e perempção'), ('Crimes Contra a Pessoa', 'Homicídio'), ('Crimes Contra a Pessoa', 'Lesões corporais'), ('Crimes Contra a Pessoa', 'Periclitação da vida e saúde'), ('Crimes Contra a Pessoa', 'Crimes contra a honra'), ('Crimes Contra a Pessoa', 'Crimes contra a liberdade individual'), ('Crimes Contra o Patrimônio', 'Furto e roubo'), ('Crimes Contra o Patrimônio', 'Extorsão'), ('Crimes Contra o Patrimônio', 'Estelionato'), ('Crimes Contra o Patrimônio', 'Apropriação indébita'), ('Crimes Contra o Patrimônio', 'Dano e receptação'), ('Crimes Contra a Administração Pública', 'Peculato'), ('Crimes Contra a Administração Pública', 'Concussão'), ('Crimes Contra a Administração Pública', 'Corrupção passiva e ativa'), ('Crimes Contra a Administração Pública', 'Prevaricação'), ('Crimes Contra a Administração Pública', 'Contrabando e descaminho'), ('Crimes Contra a Administração Pública', 'Abuso de autoridade'), ('Crimes Contra a Fé Pública', 'Falsificação de documentos'), ('Crimes Contra a Fé Pública', 'Falsidade ideológica'), ('Crimes Contra a Fé Pública', 'Uso de documento falso'), ('Crimes Sexuais', 'Estupro'), ('Crimes Sexuais', 'Corrupção de menores'), ('Crimes Sexuais', 'Crimes contra a dignidade sexual')) AS s(topic_name, name) ON true
WHERE public.normalize_text(tp.name) = public.normalize_text(s.topic_name)
ON CONFLICT DO NOTHING;

-- Direito Processual Penal (13 tópicos)
-- 5.1 Garante a disciplina (reutiliza a linha existente por nome/alias; só cria se não houver nenhuma)
INSERT INTO public.disciplines (name, area)
SELECT 'Direito Processual Penal', 'Direito'
WHERE NOT EXISTS (SELECT 1 FROM public.disciplines WHERE public.normalize_text(name) IN (public.normalize_text('Direito Processual Penal'), public.normalize_text('Processual Penal'), public.normalize_text('Processo Penal')));

-- 5.2 Tópicos padrão da disciplina
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Direito Processual Penal'), public.normalize_text('Processual Penal'), public.normalize_text('Processo Penal'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Direito Processual Penal') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.topics (discipline_id, name)
SELECT target.id, t.name
FROM target
JOIN (VALUES ('Princípios Processuais'), ('Inquérito Policial'), ('Ação Penal'), ('Competência'), ('Provas'), ('Prisões'), ('Procedimentos'), ('Recursos'), ('Habeas Corpus'), ('Tribunal do Júri'), ('Sentença'), ('Execução Penal'), ('Nulidades')) AS t(name) ON true
ON CONFLICT DO NOTHING;

-- 5.3 Subtópicos dos tópicos
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Direito Processual Penal'), public.normalize_text('Processual Penal'), public.normalize_text('Processo Penal'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Direito Processual Penal') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.subtopics (topic_id, name)
SELECT tp.id, s.name
FROM target
JOIN public.topics tp ON tp.discipline_id = target.id
JOIN (VALUES ('Princípios Processuais', 'Devido processo legal'), ('Princípios Processuais', 'Contraditório e ampla defesa'), ('Princípios Processuais', 'Presunção de inocência'), ('Princípios Processuais', 'Iniciativa probatória'), ('Princípios Processuais', 'Publicidade'), ('Inquérito Policial', 'Natureza e finalidade'), ('Inquérito Policial', 'Características'), ('Inquérito Policial', 'Início e encerramento'), ('Inquérito Policial', 'Prazos'), ('Inquérito Policial', 'Indiciamento'), ('Inquérito Policial', 'Valor probatório'), ('Ação Penal', 'Ação penal pública'), ('Ação Penal', 'Ação penal privada'), ('Ação Penal', 'Condições da ação'), ('Ação Penal', 'Querela e queixa'), ('Ação Penal', 'Ação penal nos crimes complexos'), ('Competência', 'Critérios de fixação'), ('Competência', 'Competência pelo lugar do crime'), ('Competência', 'Competência por prerrogativa de função'), ('Competência', 'Conflito de competência'), ('Provas', 'Meios de prova'), ('Provas', 'Interrogatório'), ('Provas', 'Confissão'), ('Provas', 'Perícias'), ('Provas', 'Testemunhas'), ('Provas', 'Provas ilícitas'), ('Provas', 'Cadeia de custódia'), ('Prisões', 'Prisão em flagrante'), ('Prisões', 'Prisão preventiva'), ('Prisões', 'Prisão temporária'), ('Prisões', 'Medidas cautelares'), ('Prisões', 'Liberdade provisória'), ('Prisões', 'Relaxamento da prisão'), ('Procedimentos', 'Procedimento comum ordinário, sumário e sumaríssimo'), ('Procedimentos', 'Procedimentos especiais'), ('Procedimentos', 'Citação e notificação'), ('Procedimentos', 'Alegações finais e sentença'), ('Recursos', 'Princípios dos recursos'), ('Recursos', 'Recursos em espécie'), ('Recursos', 'Apelação'), ('Recursos', 'Recurso em sentido estrito'), ('Recursos', 'Embargos'), ('Recursos', 'Recurso especial e extraordinário'), ('Habeas Corpus', 'Natureza e espécies'), ('Habeas Corpus', 'Legitimidade'), ('Habeas Corpus', 'Cabimento'), ('Habeas Corpus', 'Processamento'), ('Tribunal do Júri', 'Competência'), ('Tribunal do Júri', 'Plenitude de defesa'), ('Tribunal do Júri', 'Sigilo das votações'), ('Tribunal do Júri', 'Soberania dos veredictos'), ('Tribunal do Júri', 'Procedimento'), ('Sentença', 'Estrutura da sentença'), ('Sentença', 'Classificação'), ('Sentença', 'Publicação e intimação'), ('Sentença', 'Coisa julgada'), ('Execução Penal', 'Competência'), ('Execução Penal', 'Execução das penas privativas de liberdade'), ('Execução Penal', 'Progressão e regressão de regime'), ('Execução Penal', 'Execução das penas restritivas de direitos'), ('Nulidades', 'Nulidades absolutas e relativas'), ('Nulidades', 'Momentos de arguição'), ('Nulidades', 'Princípio da instrumentalidade das formas')) AS s(topic_name, name) ON true
WHERE public.normalize_text(tp.name) = public.normalize_text(s.topic_name)
ON CONFLICT DO NOTHING;

-- Direito Civil (7 tópicos)
-- 5.1 Garante a disciplina (reutiliza a linha existente por nome/alias; só cria se não houver nenhuma)
INSERT INTO public.disciplines (name, area)
SELECT 'Direito Civil', 'Direito'
WHERE NOT EXISTS (SELECT 1 FROM public.disciplines WHERE public.normalize_text(name) IN (public.normalize_text('Direito Civil'), public.normalize_text('Civil')));

-- 5.2 Tópicos padrão da disciplina
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Direito Civil'), public.normalize_text('Civil'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Direito Civil') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.topics (discipline_id, name)
SELECT target.id, t.name
FROM target
JOIN (VALUES ('Parte Geral'), ('Obrigações'), ('Contratos'), ('Responsabilidade Civil'), ('Direitos Reais'), ('Família'), ('Sucessões')) AS t(name) ON true
ON CONFLICT DO NOTHING;

-- 5.3 Subtópicos dos tópicos
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Direito Civil'), public.normalize_text('Civil'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Direito Civil') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.subtopics (topic_id, name)
SELECT tp.id, s.name
FROM target
JOIN public.topics tp ON tp.discipline_id = target.id
JOIN (VALUES ('Parte Geral', 'Lei de introdução'), ('Parte Geral', 'Pessoas naturais e jurídicas'), ('Parte Geral', 'Domicílio'), ('Parte Geral', 'Bens'), ('Parte Geral', 'Fatos jurídicos'), ('Parte Geral', 'Negócios jurídicos'), ('Parte Geral', 'Atos ilícitos'), ('Parte Geral', 'Prescrição e decadência'), ('Obrigações', 'Conceito e fontes'), ('Obrigações', 'Modalidades'), ('Obrigações', 'Transmissão'), ('Obrigações', 'Adimplemento e extinção'), ('Obrigações', 'Inadimplemento'), ('Obrigações', 'Pagamento indevido'), ('Contratos', 'Formação e validade'), ('Contratos', 'Classificação'), ('Contratos', 'Vícios'), ('Contratos', 'Espécies'), ('Contratos', 'Extinção'), ('Contratos', 'Função social'), ('Responsabilidade Civil', 'Responsabilidade subjetiva e objetiva'), ('Responsabilidade Civil', 'Dano material e moral'), ('Responsabilidade Civil', 'Excludentes'), ('Responsabilidade Civil', 'Indenização'), ('Direitos Reais', 'Posse'), ('Direitos Reais', 'Propriedade'), ('Direitos Reais', 'Usufruto e uso'), ('Direitos Reais', 'Hipoteca e penhor'), ('Direitos Reais', 'Condomínio'), ('Direitos Reais', 'Ações reais'), ('Família', 'Casamento'), ('Família', 'União estável'), ('Família', 'Parentesco'), ('Família', 'Alimentos'), ('Família', 'Regime de bens'), ('Família', 'Guarda e adoção'), ('Sucessões', 'Herança'), ('Sucessões', 'Sucessão legítima e testamentária'), ('Sucessões', 'Inventário e partilha'), ('Sucessões', 'Legado')) AS s(topic_name, name) ON true
WHERE public.normalize_text(tp.name) = public.normalize_text(s.topic_name)
ON CONFLICT DO NOTHING;

-- Contabilidade Geral (11 tópicos)
-- 5.1 Garante a disciplina (reutiliza a linha existente por nome/alias; só cria se não houver nenhuma)
INSERT INTO public.disciplines (name, area)
SELECT 'Contabilidade Geral', 'Contábil'
WHERE NOT EXISTS (SELECT 1 FROM public.disciplines WHERE public.normalize_text(name) IN (public.normalize_text('Contabilidade Geral'), public.normalize_text('Contabilidade'), public.normalize_text('Contabilidade Básica')));

-- 5.2 Tópicos padrão da disciplina
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Contabilidade Geral'), public.normalize_text('Contabilidade'), public.normalize_text('Contabilidade Básica'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Contabilidade Geral') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.topics (discipline_id, name)
SELECT target.id, t.name
FROM target
JOIN (VALUES ('Princípios Contábeis'), ('Patrimônio'), ('Escrituração'), ('Balanço Patrimonial'), ('DRE'), ('Demonstrações Contábeis'), ('Estoques'), ('Depreciação'), ('Provisões'), ('Custos'), ('Investimentos')) AS t(name) ON true
ON CONFLICT DO NOTHING;

-- 5.3 Subtópicos dos tópicos
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Contabilidade Geral'), public.normalize_text('Contabilidade'), public.normalize_text('Contabilidade Básica'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Contabilidade Geral') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.subtopics (topic_id, name)
SELECT tp.id, s.name
FROM target
JOIN public.topics tp ON tp.discipline_id = target.id
JOIN (VALUES ('Princípios Contábeis', 'Estrutura conceitual'), ('Princípios Contábeis', 'Postulados'), ('Princípios Contábeis', 'Convenções contábeis'), ('Patrimônio', 'Ativo'), ('Patrimônio', 'Passivo'), ('Patrimônio', 'Patrimônio líquido'), ('Patrimônio', 'Equação patrimonial'), ('Patrimônio', 'Origens e aplicações'), ('Escrituração', 'Método das partidas dobradas'), ('Escrituração', 'Contas'), ('Escrituração', 'Lançamentos'), ('Escrituração', 'Livros contábeis'), ('Escrituração', 'Razonetes e balancete'), ('Escrituração', 'Partidas de diário e razão'), ('Balanço Patrimonial', 'Estrutura'), ('Balanço Patrimonial', 'Circulante e não circulante'), ('Balanço Patrimonial', 'Apresentação'), ('Balanço Patrimonial', 'Notas explicativas'), ('DRE', 'Receitas e despesas'), ('DRE', 'Custo das mercadorias vendidas'), ('DRE', 'Lucro bruto e líquido'), ('DRE', 'Resultado do exercício'), ('Demonstrações Contábeis', 'DFC'), ('Demonstrações Contábeis', 'DMPL'), ('Demonstrações Contábeis', 'DVA'), ('Demonstrações Contábeis', 'Notas explicativas'), ('Estoques', 'Avaliação de estoques'), ('Estoques', 'Custo médio, PEPS e UEPS'), ('Estoques', 'Inventário permanente e periódico'), ('Estoques', 'Ajuste ao valor realizável'), ('Depreciação', 'Conceito e bases de cálculo'), ('Depreciação', 'Métodos'), ('Depreciação', 'Amortização'), ('Depreciação', 'Exaustão'), ('Depreciação', 'Reavaliação'), ('Provisões', 'Provisões e passivos contingentes'), ('Provisões', 'Perdas estimadas'), ('Provisões', 'Ajustes'), ('Custos', 'Custos diretos e indiretos'), ('Custos', 'Custeio por absorção'), ('Custos', 'Custeio variável'), ('Custos', 'Ponto de equilíbrio'), ('Custos', 'Margem de contribuição'), ('Investimentos', 'MEP e custo'), ('Investimentos', 'Consolidação'), ('Investimentos', 'Resultado de equivalência')) AS s(topic_name, name) ON true
WHERE public.normalize_text(tp.name) = public.normalize_text(s.topic_name)
ON CONFLICT DO NOTHING;

-- Contabilidade Pública (8 tópicos)
-- 5.1 Garante a disciplina (reutiliza a linha existente por nome/alias; só cria se não houver nenhuma)
INSERT INTO public.disciplines (name, area)
SELECT 'Contabilidade Pública', 'Contábil'
WHERE NOT EXISTS (SELECT 1 FROM public.disciplines WHERE public.normalize_text(name) IN (public.normalize_text('Contabilidade Pública'), public.normalize_text('Contabilidade Aplicada ao Setor Público'), public.normalize_text('CASP')));

-- 5.2 Tópicos padrão da disciplina
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Contabilidade Pública'), public.normalize_text('Contabilidade Aplicada ao Setor Público'), public.normalize_text('CASP'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Contabilidade Pública') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.topics (discipline_id, name)
SELECT target.id, t.name
FROM target
JOIN (VALUES ('Patrimônio Público'), ('Orçamento Público'), ('Receita Pública'), ('Despesa Pública'), ('Demonstrações Contábeis Públicas'), ('PCASP'), ('SIAFI'), ('Variações Patrimoniais')) AS t(name) ON true
ON CONFLICT DO NOTHING;

-- 5.3 Subtópicos dos tópicos
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Contabilidade Pública'), public.normalize_text('Contabilidade Aplicada ao Setor Público'), public.normalize_text('CASP'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Contabilidade Pública') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.subtopics (topic_id, name)
SELECT tp.id, s.name
FROM target
JOIN public.topics tp ON tp.discipline_id = target.id
JOIN (VALUES ('Patrimônio Público', 'Conceito e composição'), ('Patrimônio Público', 'Variações patrimoniais'), ('Patrimônio Público', 'Mensuração'), ('Orçamento Público', 'Conceito e princípios'), ('Orçamento Público', 'Ciclo orçamentário'), ('Orçamento Público', 'PPA, LDO e LOA'), ('Orçamento Público', 'Créditos adicionais'), ('Orçamento Público', 'Restos a pagar'), ('Receita Pública', 'Classificação'), ('Receita Pública', 'Estágios da receita'), ('Receita Pública', 'Receita orçamentária e extraorçamentária'), ('Receita Pública', 'Previsão e arrecadação'), ('Despesa Pública', 'Classificação'), ('Despesa Pública', 'Estágios da despesa'), ('Despesa Pública', 'Despesa orçamentária e extraorçamentária'), ('Despesa Pública', 'Empenho, liquidação e pagamento'), ('Demonstrações Contábeis Públicas', 'Balanço orçamentário'), ('Demonstrações Contábeis Públicas', 'Balanço financeiro'), ('Demonstrações Contábeis Públicas', 'Balanço patrimonial'), ('Demonstrações Contábeis Públicas', 'DFC e DMPL'), ('Demonstrações Contábeis Públicas', 'RREO e RGF'), ('PCASP', 'Estrutura'), ('PCASP', 'Classes de contas'), ('PCASP', 'Registro contábil'), ('PCASP', 'Procedimentos contábeis orçamentários e patrimoniais'), ('SIAFI', 'Conceito e características'), ('SIAFI', 'Operação'), ('SIAFI', 'Documentos e eventos'), ('Variações Patrimoniais', 'Qualitativas e quantitativas'), ('Variações Patrimoniais', 'Aumentativas e diminutivas'), ('Variações Patrimoniais', 'Resultado patrimonial')) AS s(topic_name, name) ON true
WHERE public.normalize_text(tp.name) = public.normalize_text(s.topic_name)
ON CONFLICT DO NOTHING;

-- Auditoria (10 tópicos)
-- 5.1 Garante a disciplina (reutiliza a linha existente por nome/alias; só cria se não houver nenhuma)
INSERT INTO public.disciplines (name, area)
SELECT 'Auditoria', 'Contábil'
WHERE NOT EXISTS (SELECT 1 FROM public.disciplines WHERE public.normalize_text(name) IN (public.normalize_text('Auditoria'), public.normalize_text('Auditoria Governamental'), public.normalize_text('Auditoria Contábil')));

-- 5.2 Tópicos padrão da disciplina
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Auditoria'), public.normalize_text('Auditoria Governamental'), public.normalize_text('Auditoria Contábil'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Auditoria') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.topics (discipline_id, name)
SELECT target.id, t.name
FROM target
JOIN (VALUES ('Conceitos de Auditoria'), ('Planejamento'), ('Risco de Auditoria'), ('Evidência'), ('Papéis de Trabalho'), ('Amostragem'), ('Procedimentos'), ('Controles Internos'), ('Relatórios'), ('Auditoria Governamental')) AS t(name) ON true
ON CONFLICT DO NOTHING;

-- 5.3 Subtópicos dos tópicos
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Auditoria'), public.normalize_text('Auditoria Governamental'), public.normalize_text('Auditoria Contábil'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Auditoria') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.subtopics (topic_id, name)
SELECT tp.id, s.name
FROM target
JOIN public.topics tp ON tp.discipline_id = target.id
JOIN (VALUES ('Conceitos de Auditoria', 'Objetivos'), ('Conceitos de Auditoria', 'Tipos de auditoria'), ('Conceitos de Auditoria', 'Normas profissionais'), ('Conceitos de Auditoria', 'Independência'), ('Planejamento', 'Estratégia global'), ('Planejamento', 'Plano de auditoria'), ('Planejamento', 'Materialidade'), ('Planejamento', 'Programa de auditoria'), ('Risco de Auditoria', 'Risco inerente'), ('Risco de Auditoria', 'Risco de controle'), ('Risco de Auditoria', 'Risco de detecção'), ('Risco de Auditoria', 'Matriz de risco'), ('Evidência', 'Tipos'), ('Evidência', 'Suficiência e adequação'), ('Evidência', 'Procedimentos de obtenção'), ('Papéis de Trabalho', 'Finalidade e conteúdo'), ('Papéis de Trabalho', 'Arquivo permanente e corrente'), ('Papéis de Trabalho', 'Documentação'), ('Amostragem', 'Amostragem estatística e não estatística'), ('Amostragem', 'Avaliação dos resultados'), ('Amostragem', 'Erro esperado'), ('Procedimentos', 'Testes de controle'), ('Procedimentos', 'Testes substantivos'), ('Procedimentos', 'Circularização'), ('Procedimentos', 'Análise documental'), ('Controles Internos', 'Componentes'), ('Controles Internos', 'Avaliação'), ('Controles Internos', 'Limitações'), ('Controles Internos', 'Testes de eficácia'), ('Relatórios', 'Tipos de parecer'), ('Relatórios', 'Opinião'), ('Relatórios', 'Comunicação de deficiências'), ('Relatórios', 'Relatórios especiais'), ('Auditoria Governamental', 'Controle externo e interno'), ('Auditoria Governamental', 'Tribunal de Contas'), ('Auditoria Governamental', 'Normas de auditoria do TCU'), ('Auditoria Governamental', 'Achados de auditoria')) AS s(topic_name, name) ON true
WHERE public.normalize_text(tp.name) = public.normalize_text(s.topic_name)
ON CONFLICT DO NOTHING;

-- AFO (11 tópicos)
-- 5.1 Garante a disciplina (reutiliza a linha existente por nome/alias; só cria se não houver nenhuma)
INSERT INTO public.disciplines (name, area)
SELECT 'AFO', 'Contábil'
WHERE NOT EXISTS (SELECT 1 FROM public.disciplines WHERE public.normalize_text(name) IN (public.normalize_text('AFO'), public.normalize_text('Administração Financeira e Orçamentária'), public.normalize_text('Orçamento Público (AFO)')));

-- 5.2 Tópicos padrão da disciplina
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('AFO'), public.normalize_text('Administração Financeira e Orçamentária'), public.normalize_text('Orçamento Público (AFO)'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('AFO') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.topics (discipline_id, name)
SELECT target.id, t.name
FROM target
JOIN (VALUES ('Princípios Orçamentários'), ('PPA'), ('LDO'), ('LOA'), ('Receita Pública'), ('Despesa Pública'), ('Créditos Adicionais'), ('Restos a Pagar'), ('Despesas de Exercícios Anteriores'), ('Dívida Pública'), ('Lei de Responsabilidade Fiscal')) AS t(name) ON true
ON CONFLICT DO NOTHING;

-- 5.3 Subtópicos dos tópicos
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('AFO'), public.normalize_text('Administração Financeira e Orçamentária'), public.normalize_text('Orçamento Público (AFO)'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('AFO') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.subtopics (topic_id, name)
SELECT tp.id, s.name
FROM target
JOIN public.topics tp ON tp.discipline_id = target.id
JOIN (VALUES ('Princípios Orçamentários', 'Universalidade'), ('Princípios Orçamentários', 'Unidade'), ('Princípios Orçamentários', 'Anualidade'), ('Princípios Orçamentários', 'Exclusividade'), ('Princípios Orçamentários', 'Especificação'), ('PPA', 'Conceito e vigência'), ('PPA', 'Programas e metas'), ('PPA', 'Avaliação'), ('LDO', 'Conteúdo'), ('LDO', 'Metas fiscais'), ('LDO', 'Critérios e formas de limitação de empenho'), ('LOA', 'Conteúdo'), ('LOA', 'Orçamento fiscal, da seguridade e de investimentos'), ('LOA', 'Emendas'), ('Receita Pública', 'Previsão'), ('Receita Pública', 'Lançamento, arrecadação e recolhimento'), ('Receita Pública', 'Classificação econômica'), ('Despesa Pública', 'Fixação'), ('Despesa Pública', 'Empenho, liquidação e pagamento'), ('Despesa Pública', 'Despesa de capital e corrente'), ('Despesa Pública', 'Suprimento de fundos'), ('Créditos Adicionais', 'Suplementares'), ('Créditos Adicionais', 'Especiais'), ('Créditos Adicionais', 'Extraordinários'), ('Restos a Pagar', 'Processados e não processados'), ('Restos a Pagar', 'Inscrição e cancelamento'), ('Despesas de Exercícios Anteriores', 'Conceito'), ('Despesas de Exercícios Anteriores', 'Requisitos'), ('Dívida Pública', 'Divida flutuante e fundada'), ('Dívida Pública', 'Operações de crédito'), ('Dívida Pública', 'Limites'), ('Lei de Responsabilidade Fiscal', 'Limites de pessoal'), ('Lei de Responsabilidade Fiscal', 'Limites da dívida'), ('Lei de Responsabilidade Fiscal', 'Renúncia de receita'), ('Lei de Responsabilidade Fiscal', 'Transparência'), ('Lei de Responsabilidade Fiscal', 'Sanções')) AS s(topic_name, name) ON true
WHERE public.normalize_text(tp.name) = public.normalize_text(s.topic_name)
ON CONFLICT DO NOTHING;

-- Administração (18 tópicos)
-- 5.1 Garante a disciplina (reutiliza a linha existente por nome/alias; só cria se não houver nenhuma)
INSERT INTO public.disciplines (name, area)
SELECT 'Administração', 'Gestão'
WHERE NOT EXISTS (SELECT 1 FROM public.disciplines WHERE public.normalize_text(name) IN (public.normalize_text('Administração'), public.normalize_text('Administração Geral'), public.normalize_text('Administração Pública (Gestão)')));

-- 5.2 Tópicos padrão da disciplina
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Administração'), public.normalize_text('Administração Geral'), public.normalize_text('Administração Pública (Gestão)'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Administração') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.topics (discipline_id, name)
SELECT target.id, t.name
FROM target
JOIN (VALUES ('Teorias da Administração'), ('Planejamento'), ('Organização'), ('Direção'), ('Controle'), ('Administração Estratégica'), ('Gestão de Pessoas'), ('Liderança'), ('Motivação'), ('Comunicação'), ('Cultura Organizacional'), ('Gestão por Competências'), ('Gestão da Qualidade'), ('Gestão de Processos'), ('Gestão de Projetos'), ('Gestão de Riscos'), ('Governança'), ('Administração Pública')) AS t(name) ON true
ON CONFLICT DO NOTHING;

-- 5.3 Subtópicos dos tópicos
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Administração'), public.normalize_text('Administração Geral'), public.normalize_text('Administração Pública (Gestão)'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Administração') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.subtopics (topic_id, name)
SELECT tp.id, s.name
FROM target
JOIN public.topics tp ON tp.discipline_id = target.id
JOIN (VALUES ('Teorias da Administração', 'Administração científica'), ('Teorias da Administração', 'Teoria clássica'), ('Teorias da Administração', 'Escola das relações humanas'), ('Teorias da Administração', 'Teoria burocrática'), ('Teorias da Administração', 'Teoria neoclássica'), ('Teorias da Administração', 'Teoria sistêmica e contingencial'), ('Planejamento', 'Níveis de planejamento'), ('Planejamento', 'Planejamento estratégico'), ('Planejamento', 'Análise SWOT'), ('Planejamento', 'Missão, visão e valores'), ('Organização', 'Estruturas organizacionais'), ('Organização', 'Desenho organizacional'), ('Organização', 'Departamentalização'), ('Organização', 'Autoridade e responsabilidade'), ('Direção', 'Processo decisório'), ('Direção', 'Liderança'), ('Direção', 'Motivação'), ('Direção', 'Comunicação'), ('Controle', 'Processo de controle'), ('Controle', 'Tipos de controle'), ('Controle', 'Ferramentas de controle'), ('Administração Estratégica', 'Estratégias competitivas'), ('Administração Estratégica', 'Vantagem competitiva'), ('Administração Estratégica', 'Gestão da mudança'), ('Gestão de Pessoas', 'Recrutamento e seleção'), ('Gestão de Pessoas', 'Treinamento e desenvolvimento'), ('Gestão de Pessoas', 'Avaliação de desempenho'), ('Gestão de Pessoas', 'Remuneração e benefícios'), ('Gestão de Pessoas', 'Qualidade de vida no trabalho'), ('Liderança', 'Teorias de liderança'), ('Liderança', 'Estilos de liderança'), ('Liderança', 'Liderança e poder'), ('Motivação', 'Teorias motivacionais'), ('Motivação', 'Hierarquia de necessidades'), ('Motivação', 'Higiene e motivacionais'), ('Motivação', 'Expectativa e equidade'), ('Comunicação', 'Processo de comunicação'), ('Comunicação', 'Barreiras'), ('Comunicação', 'Comunicação organizacional'), ('Cultura Organizacional', 'Elementos da cultura'), ('Cultura Organizacional', 'Clima organizacional'), ('Cultura Organizacional', 'Mudança cultural'), ('Gestão por Competências', 'Conceito de competência'), ('Gestão por Competências', 'Mapeamento'), ('Gestão por Competências', 'Gestão do conhecimento'), ('Gestão da Qualidade', 'Ferramentas da qualidade'), ('Gestão da Qualidade', 'Ciclo PDCA'), ('Gestão da Qualidade', 'Normas ISO'), ('Gestão da Qualidade', 'Excelência em gestão'), ('Gestão de Processos', 'Mapeamento de processos'), ('Gestão de Processos', 'Modelagem BPMN'), ('Gestão de Processos', 'Melhoria contínua'), ('Gestão de Projetos', 'Ciclo de vida do projeto'), ('Gestão de Projetos', 'Cronograma e custos'), ('Gestão de Projetos', 'Riscos em projetos'), ('Gestão de Projetos', 'Metodologias ágeis'), ('Gestão de Riscos', 'Identificação e avaliação'), ('Gestão de Riscos', 'Matriz de riscos'), ('Gestão de Riscos', 'Respostas aos riscos'), ('Governança', 'Governança corporativa'), ('Governança', 'Governança pública'), ('Governança', 'Compliance'), ('Administração Pública', 'Modelos de gestão pública'), ('Administração Pública', 'Nova gestão pública'), ('Administração Pública', 'Governo digital')) AS s(topic_name, name) ON true
WHERE public.normalize_text(tp.name) = public.normalize_text(s.topic_name)
ON CONFLICT DO NOTHING;

-- Informática (9 tópicos)
-- 5.1 Garante a disciplina (reutiliza a linha existente por nome/alias; só cria se não houver nenhuma)
INSERT INTO public.disciplines (name, area)
SELECT 'Informática', 'Tecnologia'
WHERE NOT EXISTS (SELECT 1 FROM public.disciplines WHERE public.normalize_text(name) IN (public.normalize_text('Informática'), public.normalize_text('Noções de Informática'), public.normalize_text('Informática Básica'), public.normalize_text('Tecnologia da Informação'), public.normalize_text('TI')));

-- 5.2 Tópicos padrão da disciplina
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Informática'), public.normalize_text('Noções de Informática'), public.normalize_text('Informática Básica'), public.normalize_text('Tecnologia da Informação'), public.normalize_text('TI'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Informática') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.topics (discipline_id, name)
SELECT target.id, t.name
FROM target
JOIN (VALUES ('Sistemas Operacionais'), ('Internet'), ('Correio Eletrônico'), ('Pacote Office'), ('Segurança da Informação'), ('Redes'), ('Computação em Nuvem'), ('Banco de Dados'), ('Sistemas de Informação')) AS t(name) ON true
ON CONFLICT DO NOTHING;

-- 5.3 Subtópicos dos tópicos
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Informática'), public.normalize_text('Noções de Informática'), public.normalize_text('Informática Básica'), public.normalize_text('Tecnologia da Informação'), public.normalize_text('TI'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Informática') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.subtopics (topic_id, name)
SELECT tp.id, s.name
FROM target
JOIN public.topics tp ON tp.discipline_id = target.id
JOIN (VALUES ('Sistemas Operacionais', 'Windows'), ('Sistemas Operacionais', 'Linux'), ('Sistemas Operacionais', 'Gerenciamento de arquivos'), ('Sistemas Operacionais', 'Processos e memória'), ('Internet', 'Navegadores'), ('Internet', 'URL e protocolos'), ('Internet', 'Ferramentas de busca'), ('Internet', 'Redes sociais e colaboração'), ('Correio Eletrônico', 'Protocolos de e-mail'), ('Correio Eletrônico', 'Webmail e clientes'), ('Correio Eletrônico', 'Boas práticas'), ('Pacote Office', 'Word'), ('Pacote Office', 'Excel'), ('Pacote Office', 'PowerPoint'), ('Pacote Office', 'Fórmulas e funções'), ('Pacote Office', 'Atalhos e formatação'), ('Segurança da Informação', 'Malware'), ('Segurança da Informação', 'Phishing e engenharia social'), ('Segurança da Informação', 'Firewall e antivírus'), ('Segurança da Informação', 'Autenticação e senhas'), ('Segurança da Informação', 'Backup'), ('Segurança da Informação', 'Criptografia básica'), ('Segurança da Informação', 'Certificado digital'), ('Redes', 'Modelo OSI e TCP/IP'), ('Redes', 'Equipamentos de rede'), ('Redes', 'Protocolos'), ('Redes', 'Wi-Fi e cabeamento'), ('Computação em Nuvem', 'Modelos de serviço'), ('Computação em Nuvem', 'Provedores'), ('Computação em Nuvem', 'Armazenamento em nuvem'), ('Banco de Dados', 'Conceitos básicos'), ('Banco de Dados', 'SGBDs'), ('Banco de Dados', 'Consulta e estrutura'), ('Sistemas de Informação', 'Tipos de sistemas'), ('Sistemas de Informação', 'ERP e CRM'), ('Sistemas de Informação', 'Sistemas corporativos')) AS s(topic_name, name) ON true
WHERE public.normalize_text(tp.name) = public.normalize_text(s.topic_name)
ON CONFLICT DO NOTHING;

-- Tecnologia da Informação (11 tópicos)
-- 5.1 Garante a disciplina (reutiliza a linha existente por nome/alias; só cria se não houver nenhuma)
INSERT INTO public.disciplines (name, area)
SELECT 'Tecnologia da Informação', 'Tecnologia'
WHERE NOT EXISTS (SELECT 1 FROM public.disciplines WHERE public.normalize_text(name) IN (public.normalize_text('Tecnologia da Informação'), public.normalize_text('TI'), public.normalize_text('Tecnologia da Informação e Comunicação'), public.normalize_text('TIC')));

-- 5.2 Tópicos padrão da disciplina
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Tecnologia da Informação'), public.normalize_text('TI'), public.normalize_text('Tecnologia da Informação e Comunicação'), public.normalize_text('TIC'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Tecnologia da Informação') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.topics (discipline_id, name)
SELECT target.id, t.name
FROM target
JOIN (VALUES ('Engenharia de Software'), ('Desenvolvimento de Sistemas'), ('Banco de Dados'), ('Engenharia de Dados'), ('Ciência de Dados'), ('Redes'), ('Segurança da Informação'), ('Computação em Nuvem'), ('DevOps'), ('Governança de TI'), ('Arquitetura de Sistemas')) AS t(name) ON true
ON CONFLICT DO NOTHING;

-- 5.3 Subtópicos dos tópicos
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Tecnologia da Informação'), public.normalize_text('TI'), public.normalize_text('Tecnologia da Informação e Comunicação'), public.normalize_text('TIC'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Tecnologia da Informação') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.subtopics (topic_id, name)
SELECT tp.id, s.name
FROM target
JOIN public.topics tp ON tp.discipline_id = target.id
JOIN (VALUES ('Engenharia de Software', 'Ciclo de vida'), ('Engenharia de Software', 'Modelos de processo'), ('Engenharia de Software', 'Requisitos'), ('Engenharia de Software', 'Qualidade de software'), ('Desenvolvimento de Sistemas', 'Programação'), ('Desenvolvimento de Sistemas', 'Algoritmos'), ('Desenvolvimento de Sistemas', 'Estruturas de dados'), ('Desenvolvimento de Sistemas', 'Paradigmas'), ('Desenvolvimento de Sistemas', 'Testes de software'), ('Banco de Dados', 'Modelagem de dados'), ('Banco de Dados', 'SQL'), ('Banco de Dados', 'Normalização'), ('Banco de Dados', 'Sistemas de gerenciamento de bancos de dados'), ('Engenharia de Dados', 'Pipelines de dados'), ('Engenharia de Dados', 'ETL'), ('Engenharia de Dados', 'Data lakes e warehouses'), ('Ciência de Dados', 'Inteligência Artificial'), ('Ciência de Dados', 'Machine Learning'), ('Ciência de Dados', 'Big Data'), ('Ciência de Dados', 'Business Intelligence'), ('Ciência de Dados', 'Visualização de dados'), ('Redes', 'Protocolos e modelos'), ('Redes', 'Infraestrutura'), ('Redes', 'Segurança de redes'), ('Segurança da Informação', 'Criptografia'), ('Segurança da Informação', 'Gestão de identidade e acesso'), ('Segurança da Informação', 'Segurança de aplicações'), ('Segurança da Informação', 'Incidentes e resposta'), ('Computação em Nuvem', 'IaaS, PaaS e SaaS'), ('Computação em Nuvem', 'Virtualização'), ('Computação em Nuvem', 'Contêineres e orquestração'), ('DevOps', 'Integração e entrega contínua'), ('DevOps', 'Infraestrutura como código'), ('DevOps', 'DevSecOps'), ('Governança de TI', 'ITIL'), ('Governança de TI', 'COBIT'), ('Governança de TI', 'ISO 27001'), ('Governança de TI', 'Continuidade de negócio'), ('Arquitetura de Sistemas', 'Microserviços'), ('Arquitetura de Sistemas', 'APIs'), ('Arquitetura de Sistemas', 'Sistemas distribuídos'), ('Arquitetura de Sistemas', 'Arquitetura em camadas')) AS s(topic_name, name) ON true
WHERE public.normalize_text(tp.name) = public.normalize_text(s.topic_name)
ON CONFLICT DO NOTHING;

-- Conhecimentos Bancários (9 tópicos)
-- 5.1 Garante a disciplina (reutiliza a linha existente por nome/alias; só cria se não houver nenhuma)
INSERT INTO public.disciplines (name, area)
SELECT 'Conhecimentos Bancários', 'Finanças'
WHERE NOT EXISTS (SELECT 1 FROM public.disciplines WHERE public.normalize_text(name) IN (public.normalize_text('Conhecimentos Bancários'), public.normalize_text('Conhecimentos Bancários e Atualidades'), public.normalize_text('Mercado Financeiro')));

-- 5.2 Tópicos padrão da disciplina
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Conhecimentos Bancários'), public.normalize_text('Conhecimentos Bancários e Atualidades'), public.normalize_text('Mercado Financeiro'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Conhecimentos Bancários') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.topics (discipline_id, name)
SELECT target.id, t.name
FROM target
JOIN (VALUES ('Sistema Financeiro Nacional'), ('Mercado Monetário'), ('Mercado de Crédito'), ('Mercado de Capitais'), ('Mercado Cambial'), ('Produtos Bancários'), ('Lavagem de Dinheiro'), ('Compliance'), ('Atendimento e Negociação')) AS t(name) ON true
ON CONFLICT DO NOTHING;

-- 5.3 Subtópicos dos tópicos
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Conhecimentos Bancários'), public.normalize_text('Conhecimentos Bancários e Atualidades'), public.normalize_text('Mercado Financeiro'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Conhecimentos Bancários') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.subtopics (topic_id, name)
SELECT tp.id, s.name
FROM target
JOIN public.topics tp ON tp.discipline_id = target.id
JOIN (VALUES ('Sistema Financeiro Nacional', 'Estrutura do SFN'), ('Sistema Financeiro Nacional', 'Conselho Monetário Nacional'), ('Sistema Financeiro Nacional', 'Banco Central'), ('Sistema Financeiro Nacional', 'Comitê de Política Monetária'), ('Sistema Financeiro Nacional', 'Órgãos normativos'), ('Mercado Monetário', 'Operações de mercado aberto'), ('Mercado Monetário', 'Taxa Selic'), ('Mercado Monetário', 'Redesconto'), ('Mercado de Crédito', 'Operações de crédito'), ('Mercado de Crédito', 'Taxas de juros'), ('Mercado de Crédito', 'Risco de crédito'), ('Mercado de Capitais', 'Bolsa de valores'), ('Mercado de Capitais', 'Comissão de Valores Mobiliários'), ('Mercado de Capitais', 'Ações e debêntures'), ('Mercado de Capitais', 'Fundos de investimento'), ('Mercado Cambial', 'Câmbio comercial e turismo'), ('Mercado Cambial', 'Taxa de câmbio'), ('Mercado Cambial', 'Operações cambiais'), ('Produtos Bancários', 'Contas e cartões'), ('Produtos Bancários', 'Crédito e financiamento'), ('Produtos Bancários', 'Investimentos'), ('Produtos Bancários', 'Previdência'), ('Produtos Bancários', 'Seguros'), ('Produtos Bancários', 'Tesouro direto'), ('Produtos Bancários', 'Renda fixa e variável'), ('Lavagem de Dinheiro', 'Conceito e fases'), ('Lavagem de Dinheiro', 'Prevenção e combate'), ('Lavagem de Dinheiro', 'Comunicação de operações'), ('Lavagem de Dinheiro', 'Lei 9.613/1998'), ('Compliance', 'Conceito'), ('Compliance', 'Programas de compliance'), ('Compliance', 'Integridade e ética'), ('Atendimento e Negociação', 'Atendimento ao cliente'), ('Atendimento e Negociação', 'Técnicas de negociação'), ('Atendimento e Negociação', 'Comunicação institucional')) AS s(topic_name, name) ON true
WHERE public.normalize_text(tp.name) = public.normalize_text(s.topic_name)
ON CONFLICT DO NOTHING;

-- Estatística (7 tópicos)
-- 5.1 Garante a disciplina (reutiliza a linha existente por nome/alias; só cria se não houver nenhuma)
INSERT INTO public.disciplines (name, area)
SELECT 'Estatística', 'Exatas'
WHERE NOT EXISTS (SELECT 1 FROM public.disciplines WHERE public.normalize_text(name) IN (public.normalize_text('Estatística'), public.normalize_text('Estatística Descritiva'), public.normalize_text('Estatística Aplicada')));

-- 5.2 Tópicos padrão da disciplina
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Estatística'), public.normalize_text('Estatística Descritiva'), public.normalize_text('Estatística Aplicada'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Estatística') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.topics (discipline_id, name)
SELECT target.id, t.name
FROM target
JOIN (VALUES ('Estatística Descritiva'), ('Probabilidade'), ('Amostragem'), ('Intervalo de Confiança'), ('Testes de Hipótese'), ('Correlação e Regressão'), ('Estatística Inferencial')) AS t(name) ON true
ON CONFLICT DO NOTHING;

-- 5.3 Subtópicos dos tópicos
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Estatística'), public.normalize_text('Estatística Descritiva'), public.normalize_text('Estatística Aplicada'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Estatística') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.subtopics (topic_id, name)
SELECT tp.id, s.name
FROM target
JOIN public.topics tp ON tp.discipline_id = target.id
JOIN (VALUES ('Estatística Descritiva', 'Tabelas e gráficos'), ('Estatística Descritiva', 'Média'), ('Estatística Descritiva', 'Mediana'), ('Estatística Descritiva', 'Moda'), ('Estatística Descritiva', 'Variância e desvio padrão'), ('Estatística Descritiva', 'Percentis e quartis'), ('Probabilidade', 'Espaço amostral'), ('Probabilidade', 'Probabilidade condicional'), ('Probabilidade', 'Variáveis aleatórias'), ('Probabilidade', 'Distribuições discretas e contínuas'), ('Amostragem', 'Tipos de amostragem'), ('Amostragem', 'Erro amostral'), ('Amostragem', 'Tamanho da amostra'), ('Intervalo de Confiança', 'Conceito'), ('Intervalo de Confiança', 'Intervalos para média e proporção'), ('Testes de Hipótese', 'Hipótese nula e alternativa'), ('Testes de Hipótese', 'Erros tipo I e II'), ('Testes de Hipótese', 'Nível de significância'), ('Correlação e Regressão', 'Coeficiente de correlação'), ('Correlação e Regressão', 'Regressão linear'), ('Correlação e Regressão', 'Ajuste de modelos'), ('Estatística Inferencial', 'Estimação'), ('Estatística Inferencial', 'Teorema central do limite'), ('Estatística Inferencial', 'Distribuições amostrais')) AS s(topic_name, name) ON true
WHERE public.normalize_text(tp.name) = public.normalize_text(s.topic_name)
ON CONFLICT DO NOTHING;

-- Economia (4 tópicos)
-- 5.1 Garante a disciplina (reutiliza a linha existente por nome/alias; só cria se não houver nenhuma)
INSERT INTO public.disciplines (name, area)
SELECT 'Economia', 'Humanas'
WHERE NOT EXISTS (SELECT 1 FROM public.disciplines WHERE public.normalize_text(name) IN (public.normalize_text('Economia'), public.normalize_text('Economia do Setor Público'), public.normalize_text('Economia Brasileira')));

-- 5.2 Tópicos padrão da disciplina
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Economia'), public.normalize_text('Economia do Setor Público'), public.normalize_text('Economia Brasileira'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Economia') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.topics (discipline_id, name)
SELECT target.id, t.name
FROM target
JOIN (VALUES ('Microeconomia'), ('Macroeconomia'), ('Economia Internacional'), ('Economia Brasileira')) AS t(name) ON true
ON CONFLICT DO NOTHING;

-- 5.3 Subtópicos dos tópicos
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Economia'), public.normalize_text('Economia do Setor Público'), public.normalize_text('Economia Brasileira'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Economia') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.subtopics (topic_id, name)
SELECT tp.id, s.name
FROM target
JOIN public.topics tp ON tp.discipline_id = target.id
JOIN (VALUES ('Microeconomia', 'Oferta e demanda'), ('Microeconomia', 'Elasticidade'), ('Microeconomia', 'Teoria do consumidor'), ('Microeconomia', 'Teoria da firma'), ('Microeconomia', 'Estruturas de mercado'), ('Microeconomia', 'Custos de produção'), ('Macroeconomia', 'Contas nacionais'), ('Macroeconomia', 'PIB'), ('Macroeconomia', 'Inflação'), ('Macroeconomia', 'Desemprego'), ('Macroeconomia', 'Política fiscal'), ('Macroeconomia', 'Política monetária'), ('Macroeconomia', 'Multiplicadores'), ('Economia Internacional', 'Câmbio'), ('Economia Internacional', 'Balanço de pagamentos'), ('Economia Internacional', 'Comércio internacional'), ('Economia Internacional', 'Integração econômica'), ('Economia Brasileira', 'História econômica'), ('Economia Brasileira', 'Planos econômicos'), ('Economia Brasileira', 'Setor público brasileiro'), ('Economia Brasileira', 'Reforma tributária')) AS s(topic_name, name) ON true
WHERE public.normalize_text(tp.name) = public.normalize_text(s.topic_name)
ON CONFLICT DO NOTHING;

-- Criminologia (4 tópicos)
-- 5.1 Garante a disciplina (reutiliza a linha existente por nome/alias; só cria se não houver nenhuma)
INSERT INTO public.disciplines (name, area)
SELECT 'Criminologia', 'Segurança Pública'
WHERE NOT EXISTS (SELECT 1 FROM public.disciplines WHERE public.normalize_text(name) IN (public.normalize_text('Criminologia'), public.normalize_text('Criminologia e Política Criminal')));

-- 5.2 Tópicos padrão da disciplina
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Criminologia'), public.normalize_text('Criminologia e Política Criminal'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Criminologia') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.topics (discipline_id, name)
SELECT target.id, t.name
FROM target
JOIN (VALUES ('Conceitos de Criminologia'), ('Teorias Criminológicas'), ('Controle Social'), ('Prevenção da Criminalidade')) AS t(name) ON true
ON CONFLICT DO NOTHING;

-- 5.3 Subtópicos dos tópicos
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Criminologia'), public.normalize_text('Criminologia e Política Criminal'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Criminologia') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.subtopics (topic_id, name)
SELECT tp.id, s.name
FROM target
JOIN public.topics tp ON tp.discipline_id = target.id
JOIN (VALUES ('Conceitos de Criminologia', 'Objeto e método'), ('Conceitos de Criminologia', 'Criminologia e política criminal'), ('Conceitos de Criminologia', 'Vitimologia'), ('Teorias Criminológicas', 'Escola clássica'), ('Teorias Criminológicas', 'Escola positiva'), ('Teorias Criminológicas', 'Teorias do consenso'), ('Teorias Criminológicas', 'Teorias do conflito'), ('Teorias Criminológicas', 'Teorias críticas'), ('Controle Social', 'Controle formal e informal'), ('Controle Social', 'Polícia e sistema penal'), ('Controle Social', 'Eficácia do controle'), ('Prevenção da Criminalidade', 'Prevenção primária, secundária e terciária'), ('Prevenção da Criminalidade', 'Programas de prevenção')) AS s(topic_name, name) ON true
WHERE public.normalize_text(tp.name) = public.normalize_text(s.topic_name)
ON CONFLICT DO NOTHING;

-- Criminalística (5 tópicos)
-- 5.1 Garante a disciplina (reutiliza a linha existente por nome/alias; só cria se não houver nenhuma)
INSERT INTO public.disciplines (name, area)
SELECT 'Criminalística', 'Segurança Pública'
WHERE NOT EXISTS (SELECT 1 FROM public.disciplines WHERE public.normalize_text(name) IN (public.normalize_text('Criminalística'), public.normalize_text('Perícia Criminal')));

-- 5.2 Tópicos padrão da disciplina
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Criminalística'), public.normalize_text('Perícia Criminal'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Criminalística') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.topics (discipline_id, name)
SELECT target.id, t.name
FROM target
JOIN (VALUES ('Perícia e Peritos'), ('Local de Crime'), ('Cadeia de Custódia'), ('Balística'), ('Papiloscopia')) AS t(name) ON true
ON CONFLICT DO NOTHING;

-- 5.3 Subtópicos dos tópicos
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Criminalística'), public.normalize_text('Perícia Criminal'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Criminalística') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.subtopics (topic_id, name)
SELECT tp.id, s.name
FROM target
JOIN public.topics tp ON tp.discipline_id = target.id
JOIN (VALUES ('Perícia e Peritos', 'Conceito e espécies'), ('Perícia e Peritos', 'Perito oficial'), ('Perícia e Peritos', 'Achados periciais'), ('Local de Crime', 'Isolamento e preservação'), ('Local de Crime', 'Levantamento do local'), ('Local de Crime', 'Vestígios e indícios'), ('Cadeia de Custódia', 'Conceito'), ('Cadeia de Custódia', 'Etapas'), ('Cadeia de Custódia', 'Registro e documentação'), ('Balística', 'Armas e munições'), ('Balística', 'Trajetória e distância'), ('Balística', 'Exames balísticos'), ('Papiloscopia', 'Impressões digitais'), ('Papiloscopia', 'Classificação'), ('Papiloscopia', 'Identificação humana')) AS s(topic_name, name) ON true
WHERE public.normalize_text(tp.name) = public.normalize_text(s.topic_name)
ON CONFLICT DO NOTHING;

-- Medicina Legal (4 tópicos)
-- 5.1 Garante a disciplina (reutiliza a linha existente por nome/alias; só cria se não houver nenhuma)
INSERT INTO public.disciplines (name, area)
SELECT 'Medicina Legal', 'Segurança Pública'
WHERE NOT EXISTS (SELECT 1 FROM public.disciplines WHERE public.normalize_text(name) IN (public.normalize_text('Medicina Legal'), public.normalize_text('Medicina Legal e Criminalística')));

-- 5.2 Tópicos padrão da disciplina
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Medicina Legal'), public.normalize_text('Medicina Legal e Criminalística'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Medicina Legal') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.topics (discipline_id, name)
SELECT target.id, t.name
FROM target
JOIN (VALUES ('Conceitos de Medicina Legal'), ('Traumatologia'), ('Identificação'), ('Sexologia Forense')) AS t(name) ON true
ON CONFLICT DO NOTHING;

-- 5.3 Subtópicos dos tópicos
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Medicina Legal'), public.normalize_text('Medicina Legal e Criminalística'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Medicina Legal') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.subtopics (topic_id, name)
SELECT tp.id, s.name
FROM target
JOIN public.topics tp ON tp.discipline_id = target.id
JOIN (VALUES ('Conceitos de Medicina Legal', 'Perícias e laudos'), ('Conceitos de Medicina Legal', 'Tanatologia'), ('Conceitos de Medicina Legal', 'Cronotanatognose'), ('Traumatologia', 'Traumas e lesões'), ('Traumatologia', 'Energias de ordem física'), ('Traumatologia', 'Asfixias'), ('Identificação', 'Identidade e identificação'), ('Identificação', 'Métodos identificadores'), ('Sexologia Forense', 'Crimes sexuais'), ('Sexologia Forense', 'Perícias correlatas')) AS s(topic_name, name) ON true
WHERE public.normalize_text(tp.name) = public.normalize_text(s.topic_name)
ON CONFLICT DO NOTHING;

-- Legislação Penal Especial (8 tópicos)
-- 5.1 Garante a disciplina (reutiliza a linha existente por nome/alias; só cria se não houver nenhuma)
INSERT INTO public.disciplines (name, area)
SELECT 'Legislação Penal Especial', 'Segurança Pública'
WHERE NOT EXISTS (SELECT 1 FROM public.disciplines WHERE public.normalize_text(name) IN (public.normalize_text('Legislação Penal Especial'), public.normalize_text('Legislação Especial Penal')));

-- 5.2 Tópicos padrão da disciplina
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Legislação Penal Especial'), public.normalize_text('Legislação Especial Penal'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Legislação Penal Especial') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.topics (discipline_id, name)
SELECT target.id, t.name
FROM target
JOIN (VALUES ('Lei de Drogas'), ('Crimes Organizados'), ('Lavagem de Dinheiro'), ('Abuso de Autoridade'), ('Execução Penal'), ('Direitos Humanos'), ('Legislação de Trânsito'), ('Legislação Institucional')) AS t(name) ON true
ON CONFLICT DO NOTHING;

-- 5.3 Subtópicos dos tópicos
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Legislação Penal Especial'), public.normalize_text('Legislação Especial Penal'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Legislação Penal Especial') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.subtopics (topic_id, name)
SELECT tp.id, s.name
FROM target
JOIN public.topics tp ON tp.discipline_id = target.id
JOIN (VALUES ('Lei de Drogas', 'Crimes de tráfico e uso'), ('Lei de Drogas', 'Apreensão e destruição'), ('Lei de Drogas', 'Procedimento'), ('Crimes Organizados', 'Organização criminosa'), ('Crimes Organizados', 'Colaboração premiada'), ('Crimes Organizados', 'Lei 12.850/2013'), ('Lavagem de Dinheiro', 'Crime de lavagem'), ('Lavagem de Dinheiro', 'Fases'), ('Lavagem de Dinheiro', 'Comunicação de operações'), ('Abuso de Autoridade', 'Condutas típicas'), ('Abuso de Autoridade', 'Sanções'), ('Abuso de Autoridade', 'Lei 13.869/2019'), ('Execução Penal', 'Progressão e regressão'), ('Execução Penal', 'Trabalho e assistência'), ('Execução Penal', 'Faltas disciplinares'), ('Execução Penal', 'Lei 7.210/1984'), ('Direitos Humanos', 'Declaração Universal'), ('Direitos Humanos', 'Sistema interamericano'), ('Direitos Humanos', 'Proteção de grupos vulneráveis'), ('Legislação de Trânsito', 'Infrações e crimes de trânsito'), ('Legislação de Trânsito', 'CTB'), ('Legislação de Trânsito', 'Alcoolemia'), ('Legislação Institucional', 'Estatutos das polícias'), ('Legislação Institucional', 'Disciplina e corregedoria')) AS s(topic_name, name) ON true
WHERE public.normalize_text(tp.name) = public.normalize_text(s.topic_name)
ON CONFLICT DO NOTHING;

-- Segurança Pública (4 tópicos)
-- 5.1 Garante a disciplina (reutiliza a linha existente por nome/alias; só cria se não houver nenhuma)
INSERT INTO public.disciplines (name, area)
SELECT 'Segurança Pública', 'Segurança Pública'
WHERE NOT EXISTS (SELECT 1 FROM public.disciplines WHERE public.normalize_text(name) IN (public.normalize_text('Segurança Pública'), public.normalize_text('Polícia e Segurança Pública'), public.normalize_text('Sistema de Segurança Pública')));

-- 5.2 Tópicos padrão da disciplina
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Segurança Pública'), public.normalize_text('Polícia e Segurança Pública'), public.normalize_text('Sistema de Segurança Pública'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Segurança Pública') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.topics (discipline_id, name)
SELECT target.id, t.name
FROM target
JOIN (VALUES ('Inteligência Policial'), ('Investigação Criminal'), ('Sistema de Segurança Pública'), ('Atendimento à População')) AS t(name) ON true
ON CONFLICT DO NOTHING;

-- 5.3 Subtópicos dos tópicos
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Segurança Pública'), public.normalize_text('Polícia e Segurança Pública'), public.normalize_text('Sistema de Segurança Pública'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Segurança Pública') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.subtopics (topic_id, name)
SELECT tp.id, s.name
FROM target
JOIN public.topics tp ON tp.discipline_id = target.id
JOIN (VALUES ('Inteligência Policial', 'Ciclo de inteligência'), ('Inteligência Policial', 'Fontes de informação'), ('Inteligência Policial', 'Contrainteligência'), ('Investigação Criminal', 'Técnicas investigativas'), ('Investigação Criminal', 'Infiltração e vigilância'), ('Investigação Criminal', 'Interceptação de comunicações'), ('Sistema de Segurança Pública', 'Organização policial'), ('Sistema de Segurança Pública', 'Sistema Único de Segurança Pública'), ('Sistema de Segurança Pública', 'Política nacional de segurança'), ('Atendimento à População', 'Polícia cidadã'), ('Atendimento à População', 'Mediação de conflitos'), ('Atendimento à População', 'Direitos do cidadão')) AS s(topic_name, name) ON true
WHERE public.normalize_text(tp.name) = public.normalize_text(s.topic_name)
ON CONFLICT DO NOTHING;

-- Saúde Pública (6 tópicos)
-- 5.1 Garante a disciplina (reutiliza a linha existente por nome/alias; só cria se não houver nenhuma)
INSERT INTO public.disciplines (name, area)
SELECT 'Saúde Pública', 'Saúde'
WHERE NOT EXISTS (SELECT 1 FROM public.disciplines WHERE public.normalize_text(name) IN (public.normalize_text('Saúde Pública'), public.normalize_text('Saúde Coletiva'), public.normalize_text('Saúde Pública (SUS)')));

-- 5.2 Tópicos padrão da disciplina
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Saúde Pública'), public.normalize_text('Saúde Coletiva'), public.normalize_text('Saúde Pública (SUS)'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Saúde Pública') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.topics (discipline_id, name)
SELECT target.id, t.name
FROM target
JOIN (VALUES ('SUS'), ('Epidemiologia'), ('Vigilância Sanitária'), ('Saúde da Família'), ('Políticas de Saúde'), ('Biossegurança')) AS t(name) ON true
ON CONFLICT DO NOTHING;

-- 5.3 Subtópicos dos tópicos
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Saúde Pública'), public.normalize_text('Saúde Coletiva'), public.normalize_text('Saúde Pública (SUS)'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Saúde Pública') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.subtopics (topic_id, name)
SELECT tp.id, s.name
FROM target
JOIN public.topics tp ON tp.discipline_id = target.id
JOIN (VALUES ('SUS', 'Princípios e diretrizes'), ('SUS', 'Lei 8.080/1990'), ('SUS', 'Lei 8.142/1990'), ('SUS', 'Organização e gestão'), ('Epidemiologia', 'Vigilância epidemiológica'), ('Epidemiologia', 'Indicadores de saúde'), ('Epidemiologia', 'Prevenção e controle de doenças'), ('Vigilância Sanitária', 'Controle sanitário'), ('Vigilância Sanitária', 'Produtos e serviços'), ('Vigilância Sanitária', 'Legislação sanitária'), ('Saúde da Família', 'Estratégia Saúde da Família'), ('Saúde da Família', 'Atenção primária'), ('Saúde da Família', 'Territorialização'), ('Políticas de Saúde', 'Política Nacional de Saúde'), ('Políticas de Saúde', 'Programas do Ministério da Saúde'), ('Políticas de Saúde', 'Financiamento da saúde'), ('Biossegurança', 'Normas de biossegurança'), ('Biossegurança', 'Equipamentos de proteção'), ('Biossegurança', 'Descarte de resíduos')) AS s(topic_name, name) ON true
WHERE public.normalize_text(tp.name) = public.normalize_text(s.topic_name)
ON CONFLICT DO NOTHING;

-- Educação (10 tópicos)
-- 5.1 Garante a disciplina (reutiliza a linha existente por nome/alias; só cria se não houver nenhuma)
INSERT INTO public.disciplines (name, area)
SELECT 'Educação', 'Educação'
WHERE NOT EXISTS (SELECT 1 FROM public.disciplines WHERE public.normalize_text(name) IN (public.normalize_text('Educação'), public.normalize_text('Legislação Educacional'), public.normalize_text('Conhecimentos Pedagógicos')));

-- 5.2 Tópicos padrão da disciplina
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Educação'), public.normalize_text('Legislação Educacional'), public.normalize_text('Conhecimentos Pedagógicos'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Educação') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.topics (discipline_id, name)
SELECT target.id, t.name
FROM target
JOIN (VALUES ('LDB'), ('Legislação Educacional'), ('Fundamentos da Educação'), ('Didática'), ('Psicologia da Educação'), ('Educação Especial e Inclusiva'), ('Avaliação'), ('Currículo'), ('Alfabetização'), ('Gestão Escolar')) AS t(name) ON true
ON CONFLICT DO NOTHING;

-- 5.3 Subtópicos dos tópicos
WITH target AS (
  SELECT d.id
  FROM public.disciplines d
  WHERE public.normalize_text(d.name) IN (public.normalize_text('Educação'), public.normalize_text('Legislação Educacional'), public.normalize_text('Conhecimentos Pedagógicos'))
  ORDER BY CASE WHEN public.normalize_text(d.name) = public.normalize_text('Educação') THEN 0 ELSE 1 END
  LIMIT 1
)
INSERT INTO public.subtopics (topic_id, name)
SELECT tp.id, s.name
FROM target
JOIN public.topics tp ON tp.discipline_id = target.id
JOIN (VALUES ('LDB', 'Estrutura da educação nacional'), ('LDB', 'Níveis e modalidades'), ('LDB', 'Educação básica'), ('LDB', 'Financiamento'), ('Legislação Educacional', 'BNCC'), ('Legislação Educacional', 'Fundef/Fundeb'), ('Legislação Educacional', 'ECA na educação'), ('Legislação Educacional', 'Plano Nacional de Educação'), ('Fundamentos da Educação', 'Filosofia da educação'), ('Fundamentos da Educação', 'Sociologia da educação'), ('Fundamentos da Educação', 'História da educação'), ('Didática', 'Processo de ensino-aprendizagem'), ('Didática', 'Metodologias ativas'), ('Didática', 'Planejamento de aula'), ('Psicologia da Educação', 'Desenvolvimento humano'), ('Psicologia da Educação', 'Teorias de aprendizagem'), ('Psicologia da Educação', 'Avaliação psicopedagógica'), ('Educação Especial e Inclusiva', 'Educação inclusiva'), ('Educação Especial e Inclusiva', 'Atendimento educacional especializado'), ('Educação Especial e Inclusiva', 'AEE e salas de recursos'), ('Avaliação', 'Avaliação da aprendizagem'), ('Avaliação', 'Avaliação institucional'), ('Avaliação', 'Instrumentos avaliativos'), ('Currículo', 'Teorias de currículo'), ('Currículo', 'Organização curricular'), ('Currículo', 'Currículo e BNCC'), ('Alfabetização', 'Processos de alfabetização'), ('Alfabetização', 'Letramento'), ('Alfabetização', 'Métodos e abordagens'), ('Gestão Escolar', 'Projeto político-pedagógico'), ('Gestão Escolar', 'Conselhos escolares'), ('Gestão Escolar', 'Gestão democrática')) AS s(topic_name, name) ON true
WHERE public.normalize_text(tp.name) = public.normalize_text(s.topic_name)
ON CONFLICT DO NOTHING;

-- Fim da migração do catálogo.