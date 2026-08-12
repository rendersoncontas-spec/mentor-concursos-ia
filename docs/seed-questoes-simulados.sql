-- ========================================================================================
-- SEED DE QUESTÕES PARA O MÓDULO SIMULADOS (Mentor Concursos IA)
-- Popula: question_topics + questions (com alternatives JSONB, gabarito e explicação)
-- Idempotente e seguro: pula disciplinas não encontradas e disciplinas já populadas.
-- Executar no SQL Editor do Supabase (pode rodar quantas vezes quiser).
-- ========================================================================================

DO $$
DECLARE
  v_disc uuid;
  v_t1 uuid; v_t2 uuid; v_t3 uuid;
  v_count integer;
BEGIN
  -- Helper: garante que o tópico existe e retorna o id
  -- (usado dentro de cada bloco via variável)

  -- ========================================================================
  -- DISCIPLINA 1: Língua Portuguesa
  -- ========================================================================
  SELECT id INTO v_disc FROM public.disciplines WHERE name = 'Língua Portuguesa' LIMIT 1;
  IF v_disc IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM public.questions WHERE discipline_id = v_disc;
    IF v_count = 0 THEN
      SELECT id INTO v_t1 FROM public.question_topics WHERE discipline_id = v_disc AND name = 'Interpretação de Textos';
      IF v_t1 IS NULL THEN
        INSERT INTO public.question_topics (discipline_id, name) VALUES (v_disc, 'Interpretação de Textos') RETURNING id INTO v_t1;
      END IF;
      SELECT id INTO v_t2 FROM public.question_topics WHERE discipline_id = v_disc AND name = 'Crase e Regência';
      IF v_t2 IS NULL THEN
        INSERT INTO public.question_topics (discipline_id, name) VALUES (v_disc, 'Crase e Regência') RETURNING id INTO v_t2;
      END IF;
      SELECT id INTO v_t3 FROM public.question_topics WHERE discipline_id = v_disc AND name = 'Concordância';
      IF v_t3 IS NULL THEN
        INSERT INTO public.question_topics (discipline_id, name) VALUES (v_disc, 'Concordância') RETURNING id INTO v_t3;
      END IF;

      INSERT INTO public.questions (discipline_id, topic_id, statement, correct_answer, alternatives, explanation, difficulty_level, difficulty_label, exam_board, exam_name, exam_year, question_status)
      VALUES
      (v_disc, v_t1,
       E'A leitura de mundo precede a leitura da palavra, por isso a alfabetização não deve ser um simples ato mecânico. A ideia central defendida no texto é:',
       'B',
       '[{"label":"A","text":"A alfabetização independe da experiência de vida do aluno."},{"label":"B","text":"A compreensão da realidade antecede e sustenta a aprendizagem da escrita."},{"label":"C","text":"A leitura da palavra é condição para a compreensão do mundo."},{"label":"D","text":"O letramento deve ocorrer apenas na fase adulta."},{"label":"E","text":"A escola deve priorizar a técnica em detrimento do contexto social."}]'::jsonb,
       E'O texto afirma que a leitura do mundo vem antes da leitura da palavra, ou seja, a vivência do aluno fundamenta o aprendizado da leitura e da escrita.',
       2, 'Fácil', 'FCC', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t1,
       E'No trecho "O projeto foi aprovado pelo comitê, não obstante as críticas recebidas", a expressão "não obstante" pode ser substituída, sem alteração de sentido, por:',
       'C',
       '[{"label":"A","text":"devido às"},{"label":"B","text":"em razão das"},{"label":"C","text":"apesar das"},{"label":"D","text":"graças às"},{"label":"E","text":"portanto as"}]'::jsonb,
       E'"Não obstante" é locução concessiva que equivale a "apesar de", introduzindo ideia de oposição.',
       2, 'Fácil', 'FGV', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t1,
       E'Assinale a alternativa em que a reescrita do trecho "O crescimento econômico reduz a pobreza, contudo amplia as desigualdades regionais" mantém o sentido original:',
       'D',
       '[{"label":"A","text":"O crescimento econômico reduz a pobreza, portanto amplia as desigualdades regionais."},{"label":"B","text":"O crescimento econômico reduz a pobreza, porque amplia as desigualdades regionais."},{"label":"C","text":"O crescimento econômico reduz a pobreza, assim amplia as desigualdades regionais."},{"label":"D","text":"O crescimento econômico reduz a pobreza, porém amplia as desigualdades regionais."},{"label":"E","text":"O crescimento econômico reduz a pobreza, bem como amplia as desigualdades regionais."}]'::jsonb,
       E'"Contudo" é conjunção adversativa; a única opção com mesmo valor é "porém".',
       3, 'Média', 'CEBRASPE', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t1,
       E'Segundo o texto: "A tecnologia aproxima os que estão longe e distancia os que estão perto." Tal afirmação sugere que:',
       'E',
       '[{"label":"A","text":"a tecnologia é sempre prejudicial às relações humanas."},{"label":"B","text":"as relações presenciais deixaram de existir."},{"label":"C","text":"a tecnologia elimina a necessidade de convivência."},{"label":"D","text":"os vínculos reais são impossíveis na era digital."},{"label":"E","text":"a tecnologia transforma a forma de convivência, com efeitos positivos e negativos."}]'::jsonb,
       E'A frase aponta um paradoxo: embora aproxime pessoas distantes, pode afastar as que convivem presencialmente — efeito ambivalente.',
       3, 'Média', 'FGV', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t2,
       E'Assinale a alternativa em que o uso do acento grave indicativo de crase está correto:',
       'A',
       '[{"label":"A","text":"Entreguei o relatório à diretora assim que cheguei."},{"label":"B","text":"Paguei o boleto à vista com o cartão de crédito."},{"label":"C","text":"Refiro-me a aluna que passou no concurso."},{"label":"D","text":"Chegamos a casa após a reunião e jantamos."},{"label":"E","text":"Obedeceu a regras rígidas durante o estágio."}]'::jsonb,
       E'A crase correta ocorre com a fusão da preposição "a" com o artigo "a" (à diretora = a + a). Nas demais: "à vista" é locução sem artigo; antes de palavras femininas indeterminadas ou sem artigo não há crase.',
       2, 'Fácil', 'VUNESP', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t2,
       E'Em "Chegou ___ escola atrasado, pois fora pego no trânsito", a lacuna deve ser preenchida com:',
       'B',
       '[{"label":"A","text":"a"},{"label":"B","text":"à"},{"label":"C","text":"as"},{"label":"D","text":"às"},{"label":"E","text":"há"}]'::jsonb,
       E'Verbo "chegar" pede a preposição "a"; "escola" admite artigo "a" → "à escola".',
       1, 'Muito Fácil', 'FCC', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t2,
       E'Assinale a frase em que NÃO há crase:',
       'C',
       '[{"label":"A","text":"Assistimos à peça no teatro municipal."},{"label":"B","text":"Fez menção à portaria publicada ontem."},{"label":"C","text":"Já se referiu a você diversas vezes."},{"label":"D","text":"Compareceu à solenidade de formatura."},{"label":"E","text":"Entregou o documento à secretária."}]'::jsonb,
       E'Não há crase antes de pronome pessoal ("a você"), pois não há artigo.
        Nas demais há fusão da preposição pedida (assistir a, fazer menção a, comparecer a, entregar a) com o artigo definido feminino.',
       3, 'Média', 'VUNESP', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t2,
       E'O verbo assistir, no sentido de presenciar, é empregado corretamente em:',
       'D',
       '[{"label":"A","text":"Assistimos o jogo inteiro no estádio."},{"label":"B","text":"O fiscal assistiu o candidato se machucar."},{"label":"C","text":"Os jurados assistem cada cena do documentário."},{"label":"D","text":"Assistimos ao documentário sobre educação."},{"label":"E","text":"Assistiu o repórter durante a entrevista."}]'::jsonb,
       E'No sentido de ver/presenciar, "assistir" é transitivo indireto (assistir a algo) → "assistimos ao documentário".',
       3, 'Média', 'CEBRASPE', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t3,
       E'Assinale a alternativa que atende à norma-padrão de concordância verbal:',
       'B',
       '[{"label":"A","text":"Fazem cinco anos que trabalho nesta empresa."},{"label":"B","text":"Faz cinco anos que trabalho nesta empresa."},{"label":"C","text":"Houveram muitas inscrições para a vaga."},{"label":"D","text":"Existia muitas vagas para o cargo."},{"label":"E","text":"Haviam candidatos suficientes na sala."}]'::jsonb,
       E'"Fazer" com sentido de tempo decorrido e "haver" no sentido de existir são impessoais e permanecem no singular.',
       2, 'Fácil', 'FCC', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t3,
       E'Em "Mais de um aluno ___ reprovado na prova objetiva", a forma verbal correta é:',
       'A',
       '[{"label":"A","text":"foi"},{"label":"B","text":"foram"},{"label":"C","text":"foram-se"},{"label":"D","text":"serão"},{"label":"E","text":"haveriam sido"}]'::jsonb,
       E'A expressão "mais de um" exige verbo no singular: "mais de um aluno foi reprovado".',
       1, 'Muito Fácil', 'VUNESP', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t3,
       E'Assinale a alternativa gramaticalmente correta:',
       'C',
       '[{"label":"A","text":"A maioria dos candidatos chegou, mas desistiram da prova."},{"label":"B","text":"Devem haver soluções para o problema apresentado."},{"label":"C","text":"A maioria dos candidatos chegou e permaneceu na sala."},{"label":"D","text":"Bastam os dias de prova para terminar o curso."},{"label":"E","text":"Precisa-se de novos colaboradores, mas bastou poucas vagas."}]'::jsonb,
       E'A concordância com núcleo coletivo ("a maioria") fica no singular quando não se quer destacar o quantificador: "chegou", "permaneceu". "Devem haver" é incorreto (haver impessoal).
        Em "Bastam os dias" deveria ser "bastam", mas a frase muda o sentido.',
       3, 'Média', 'FGV', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t3,
       E'Assinale a opção em que há ERRO de concordância:',
       'E',
       '[{"label":"A","text":"Havia muitas pessoas na fila da matrícula."},{"label":"B","text":"Existem muitas pessoas na fila da matrícula."},{"label":"C","text":"Faz dez anos que estudo para concursos."},{"label":"D","text":"Devem haver muitas pessoas na fila."},{"label":"E","text":"Houveram muitas pessoas na fila da matrícula."}]'::jsonb,
       E'"Haver" no sentido de existir é impessoal e invariável: "houve muitas pessoas". O correto seria "Havia"/"Houve".',
       2, 'Fácil', 'VUNESP', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t1,
       E'Na frase "O resultado da pesquisa revelou um paradoxo: quanto mais informação, menos conhecimento", a figura de linguagem predominante é a:',
       'D',
       '[{"label":"A","text":"metáfora"},{"label":"B","text":"hipérbole"},{"label":"C","text":"metonímia"},{"label":"D","text":"antítese"},{"label":"E","text":"eufemismo"}]'::jsonb,
       E'"Mais informação × menos conhecimento" expressa oposição de ideias no mesmo enunciado — antítese.',
       4, 'Difícil', 'FGV', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t2,
       E'Assinale a alternativa em que o emprego de "onde" está correto para a norma-padrão:',
       'B',
       '[{"label":"A","text":"Onde estiver, avise-me por telefone."},{"label":"B","text":"A cidade onde nasceu fica no interior do estado."},{"label":"C","text":"O projeto onde trabalhamos será entregue amanhã."},{"label":"D","text":"Não sei onde ele contratou o plano de saúde."},{"label":"E","text":"Essa é a empresa onde o diretor mencionou."}]'::jsonb,
       E'"Onde" só deve ser usado para lugar físico: "a cidade onde nasceu".',
       3, 'Média', 'FCC', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t1,
       E'Considere o trecho: "Ao ler o edital com atenção, percebeu o equívoco." O sujeito da oração do verbo "percebeu" é:',
       'E',
       '[{"label":"A","text":"edital"},{"label":"B","text":"equívoco"},{"label":"C","text":"atenção"},{"label":"D","text":"inexistente"},{"label":"E","text":"oculto (ele)"}]'::jsonb,
       E'O sujeito de "percebeu" é elíptico/oculto (ele, referindo-se a uma pessoa citada em contexto anterior).',
       3, 'Média', 'VUNESP', 'Adaptações de prova', 2023, 'ACTIVE');
    END IF;
  END IF;

  -- ========================================================================
  -- DISCIPLINA 2: Direito Constitucional
  -- ========================================================================
  SELECT id INTO v_disc FROM public.disciplines WHERE name = 'Direito Constitucional' LIMIT 1;
  IF v_disc IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM public.questions WHERE discipline_id = v_disc;
    IF v_count = 0 THEN
      SELECT id INTO v_t1 FROM public.question_topics WHERE discipline_id = v_disc AND name = 'Direitos e Garantias Fundamentais';
      IF v_t1 IS NULL THEN
        INSERT INTO public.question_topics (discipline_id, name) VALUES (v_disc, 'Direitos e Garantias Fundamentais') RETURNING id INTO v_t1;
      END IF;
      SELECT id INTO v_t2 FROM public.question_topics WHERE discipline_id = v_disc AND name = 'Organização do Estado';
      IF v_t2 IS NULL THEN
        INSERT INTO public.question_topics (discipline_id, name) VALUES (v_disc, 'Organização do Estado') RETURNING id INTO v_t2;
      END IF;
      SELECT id INTO v_t3 FROM public.question_topics WHERE discipline_id = v_disc AND name = 'Controle de Constitucionalidade';
      IF v_t3 IS NULL THEN
        INSERT INTO public.question_topics (discipline_id, name) VALUES (v_disc, 'Controle de Constitucionalidade') RETURNING id INTO v_t3;
      END IF;

      INSERT INTO public.questions (discipline_id, topic_id, statement, correct_answer, alternatives, explanation, difficulty_level, difficulty_label, exam_board, exam_name, exam_year, question_status)
      VALUES
      (v_disc, v_t1,
       E'O princípio constitucional que assegura que "todos são iguais perante a lei, sem distinção de qualquer natureza" é o princípio da:',
       'C',
       '[{"label":"A","text":"legalidade"},{"label":"B","text":"moralidade"},{"label":"C","text":"igualdade"},{"label":"D","text":"publicidade"},{"label":"E","text":"eficiência"}]'::jsonb,
       E'Art. 5º, caput, da CF/88: "Todos são iguais perante a lei, sem distinção de qualquer natureza..." — princípio da isonomia/igualdade.',
       1, 'Muito Fácil', 'CEBRASPE', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t1,
       E'O habeas corpus é o remédio constitucional destinado a proteger:',
       'B',
       '[{"label":"A","text":"a liberdade de expressão"},{"label":"B","text":"a liberdade de locomoção"},{"label":"C","text":"a inviolabilidade do domicílio"},{"label":"D","text":"a propriedade privada"},{"label":"E","text":"o sigilo de correspondência"}]'::jsonb,
       E'Art. 5º, LXVIII: "conceder-se-á habeas corpus sempre que alguém sofrer ou se achar ameaçado de sofrer violência ou coação em sua liberdade de locomoção".',
       1, 'Muito Fácil', 'FCC', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t1,
       E'Conforme o art. 60, § 4º, da CF/88, NÃO é considerada cláusula pétrea a:',
       'D',
       '[{"label":"A","text":"forma federativa de Estado"},{"label":"B","text":"separação dos Poderes"},{"label":"C","text":"voto direto, secreto, universal e periódico"},{"label":"D","text":"presidencialismo como forma de governo"},{"label":"E","text":"garantia dos direitos e garantias individuais"}]'::jsonb,
       E'As cláusulas pétreas são: forma federativa de Estado; voto direto, secreto, universal e periódico; separação dos Poderes; direitos e garantias individuais. O presidencialismo não é imutável.',
       3, 'Média', 'FGV', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t1,
       E'O mandado de injunção será concedido quando:',
       'E',
       '[{"label":"A","text":"houver abuso de autoridade por agente público."},{"label":"B","text":"o administrado sofrer ilegalidade em processo administrativo."},{"label":"C","text":"houver ato lesivo ao patrimônio público."},{"label":"D","text":"existir conflito de competência entre entes federativos."},{"label":"E","text":"faltar norma regulamentadora que torne inviável o exercício de direitos."}]'::jsonb,
       E'Art. 5º, LXXI: "conceder-se-á mandado de injunção sempre que a falta de norma regulamentadora torne inviável o exercício dos direitos e liberdades constitucionais".',
       3, 'Média', 'CEBRASPE', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t1,
       E'São brasileiros natos, segundo a CF/88:',
       'C',
       '[{"label":"A","text":"os nascidos no estrangeiro de pai brasileiro, ainda que não registrados."},{"label":"B","text":"os que adquiriram a nacionalidade pelo processo de naturalização comum."},{"label":"C","text":"os nascidos no Brasil, ainda que de pais estrangeiros, desde que estes não estejam a serviço de seu país."},{"label":"D","text":"os nascidos no estrangeiro de mãe brasileira em missão de serviço, desde que optem pela nacionalidade em qualquer idade."},{"label":"E","text":"todos os nascidos em território nacional, inclusive filhos de diplomatas estrangeiros."}]'::jsonb,
       E'Art. 12, I: são brasileiros natos os nascidos no Brasil, ainda que de pais estrangeiros, desde que não estejam a serviço de seu país (critério do jus soli).',
       3, 'Média', 'FCC', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t1,
       E'Em relação à extradição, a CF/88 determina que:',
       'A',
       '[{"label":"A","text":"o brasileiro nato nunca será extraditado pelo Brasil."},{"label":"B","text":"o brasileiro naturalizado poderá ser extraditado em qualquer caso."},{"label":"C","text":"o estrangeiro nunca será extraditado."},{"label":"D","text":"será admitida a extradição de brasileiro nato por crime comum."},{"label":"E","text":"a extradição independe de tratado internacional."}]'::jsonb,
       E'Art. 5º, LI: "nenhum brasileiro será extraditado, salvo o naturalizado, em caso de crime comum praticado antes da naturalização, ou de comprovado envolvimento em tráfico ilícito de entorpecentes". O nato jamais é extraditado.',
       3, 'Média', 'VUNESP', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t2,
       E'São entes que compõem a organização político-administrativa da República Federativa do Brasil:',
       'B',
       '[{"label":"A","text":"União, Estados, Municípios e Territórios."},{"label":"B","text":"União, Estados, Distrito Federal e Municípios."},{"label":"C","text":"União, Estados e Distrito Federal apenas."},{"label":"D","text":"União, Estados, Territórios e Distrito Federal."},{"label":"E","text":"Estados, Distrito Federal e Municípios apenas."}]'::jsonb,
       E'Art. 18 da CF/88: "A organização político-administrativa da República Federativa do Brasil compreende a União, os Estados, o Distrito Federal e os Municípios, todos autônomos".',
       1, 'Muito Fácil', 'CEBRASPE', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t2,
       E'É competência privativa da União:',
       'D',
       '[{"label":"A","text":"organizar e manter a polícia civil."},{"label":"B","text":"legislar sobre educação e ensino."},{"label":"C","text":"criar, organizar e suprimir distritos."},{"label":"D","text":"emitir moeda."},{"label":"E","text":"organizar os serviços locais de transporte."}]'::jsonb,
       E'Art. 21, VII: compete à União "emitir moeda". Polícia civil e distritos são temas dos estados e municípios; educação é competência concorrente.',
       3, 'Média', 'FGV', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t2,
       E'Sobre o Distrito Federal, é correto afirmar que:',
       'C',
       '[{"label":"A","text":"pode ser dividido em municípios por lei ordinária."},{"label":"B","text":"sua organização político-administrativa é feita por lei federal."},{"label":"C","text":"a ele se aplicam as competências legislativas reservadas aos estados e municípios."},{"label":"D","text":"elege prefeitos em cada região administrativa."},{"label":"E","text":"é regido exclusivamente por lei orgânica aprovada pelo Congresso Nacional."}]'::jsonb,
       E'Art. 32: "O Distrito Federal, vedada sua divisão em Municípios, reger-se-á por lei orgânica, votada em dois turnos... cabendo-lhe as competências legislativas reservadas aos Estados e Municípios".',
       4, 'Difícil', 'FCC', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t2,
       E'Conforme a CF/88, a criação de Município depende de:',
       'E',
       '[{"label":"A","text":"emenda constitucional e plebiscito estadual."},{"label":"B","text":"lei federal e estudo de viabilidade municipal."},{"label":"C","text":"decisão exclusiva da Assembleia Legislativa."},{"label":"D","text":"consulta prévia ao Tribunal de Contas do Estado."},{"label":"E","text":"lei estadual e consulta prévia à população interessada."}]'::jsonb,
       E'Art. 18, § 4º: "A criação, a incorporação, a fusão e o desmembramento de Municípios far-se-ão por lei estadual, dentro do período determinado por lei complementar federal, e dependerão de consulta prévia, mediante plebiscito, às populações dos Municípios envolvidos".',
       3, 'Média', 'VUNESP', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t1,
       E'Quanto aos direitos sociais, julgue como se o enunciado fosse uma assertiva de prova: "A educação, a saúde, a alimentação, o trabalho e a previdência social estão entre os direitos sociais previstos na CF/88."',
       'CERTO',
       NULL,
       E'Art. 6º da CF/88: "São direitos sociais a educação, a saúde, a alimentação, o trabalho, a moradia, o transporte, o lazer, a segurança, a previdência social, a proteção à maternidade e à infância, a assistência aos desamparados".',
       2, 'Fácil', 'CEBRASPE', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t3,
       E'A Ação Direta de Inconstitucionalidade (ADI) é de competência originária do:',
       'C',
       '[{"label":"A","text":"Supremo Tribunal de Justiça"},{"label":"B","text":"Superior Tribunal de Justiça"},{"label":"C","text":"Supremo Tribunal Federal"},{"label":"D","text":"Tribunal Superior Eleitoral"},{"label":"E","text":"Tribunal Regional Federal"}]'::jsonb,
       E'Art. 102, I, "a": compete ao STF "a ação direta de inconstitucionalidade de lei ou ato normativo federal ou estadual".',
       1, 'Muito Fácil', 'CEBRASPE', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t3,
       E'São legitimados a propor a ação direta de inconstitucionalidade, entre outros:',
       'D',
       '[{"label":"A","text":"qualquer cidadão, desde que vítima."},{"label":"B","text":"qualquer partido político."},{"label":"C","text":"qualquer associação de classe de âmbito estadual."},{"label":"D","text":"o Presidente da República e o Procurador-Geral da República."},{"label":"E","text":"apenas os tribunais superiores e o Congresso Nacional."}]'::jsonb,
       E'Art. 103: são legitimados, entre outros, o Presidente da República e o PGR. Partido só com representação no Congresso; associações devem ser de âmbito nacional.',
       3, 'Média', 'FGV', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t3,
       E'No controle difuso de constitucionalidade:',
       'B',
       '[{"label":"A","text":"a questão é decidida exclusivamente pelo STF em ação direta."},{"label":"B","text":"a inconstitucionalidade é declarada incidentalmente, no caso concreto, por qualquer juiz ou tribunal."},{"label":"C","text":"a decisão tem eficácia erga omnes imediata."},{"label":"D","text":"apenas o Ministério Público pode suscitá-la."},{"label":"E","text":"a declaração é feita apenas pelos órgãos de cúpula do Judiciário."}]'::jsonb,
       E'O controle difuso ocorre incidentalmente nos casos concretos, cabendo a qualquer órgão do Judiciário, com eficácia inter partes (art. 97: reserva de plenário, maioria absoluta).',
       3, 'Média', 'FCC', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t3,
       E'Julgue a assertiva: "A norma constitucional de eficácia plena é aquela que produz seus efeitos desde a entrada em vigor da Constituição, não dependendo de regulamentação."',
       'CERTO',
       NULL,
       E'As normas de eficácia plena têm aplicabilidade imediata, sem necessidade de norma integradora (ex.: art. 2º, separação dos Poderes).',
       2, 'Fácil', 'CEBRASPE', 'Adaptações de prova', 2023, 'ACTIVE');
    END IF;
  END IF;

  -- ========================================================================
  -- DISCIPLINA 3: Direito Administrativo
  -- ========================================================================
  SELECT id INTO v_disc FROM public.disciplines WHERE name = 'Direito Administrativo' LIMIT 1;
  IF v_disc IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM public.questions WHERE discipline_id = v_disc;
    IF v_count = 0 THEN
      SELECT id INTO v_t1 FROM public.question_topics WHERE discipline_id = v_disc AND name = 'Atos Administrativos';
      IF v_t1 IS NULL THEN
        INSERT INTO public.question_topics (discipline_id, name) VALUES (v_disc, 'Atos Administrativos') RETURNING id INTO v_t1;
      END IF;
      SELECT id INTO v_t2 FROM public.question_topics WHERE discipline_id = v_disc AND name = 'Poderes Administrativos';
      IF v_t2 IS NULL THEN
        INSERT INTO public.question_topics (discipline_id, name) VALUES (v_disc, 'Poderes Administrativos') RETURNING id INTO v_t2;
      END IF;
      SELECT id INTO v_t3 FROM public.question_topics WHERE discipline_id = v_disc AND name = 'Licitações e Contratos';
      IF v_t3 IS NULL THEN
        INSERT INTO public.question_topics (discipline_id, name) VALUES (v_disc, 'Licitações e Contratos') RETURNING id INTO v_t3;
      END IF;

      INSERT INTO public.questions (discipline_id, topic_id, statement, correct_answer, alternatives, explanation, difficulty_level, difficulty_label, exam_board, exam_name, exam_year, question_status)
      VALUES
      (v_disc, v_t1,
       E'São atributos do ato administrativo:',
       'A',
       '[{"label":"A","text":"presunção de legitimidade, imperatividade, autoexecutoriedade e tipicidade."},{"label":"B","text":"legalidade, impessoalidade, moralidade e publicidade."},{"label":"C","text":"competência, finalidade, forma, motivo e objeto."},{"label":"D","text":"ampla defesa, contraditório, duplo grau e publicidade."},{"label":"E","text":"razoabilidade, proporcionalidade, eficiência e celeridade."}]'::jsonb,
       E'Os atributos (características) do ato administrativo são: presunção de legitimidade, imperatividade, autoexecutoriedade e tipicidade.',
       2, 'Fácil', 'FCC', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t1,
       E'A anulação e a revogação do ato administrativo distinguem-se porque:',
       'C',
       '[{"label":"A","text":"a revogação decorre de ilegalidade e a anulação de conveniência."},{"label":"B","text":"a anulação é privativa do Poder Judiciário."},{"label":"C","text":"a anulação ocorre por ilegalidade e a revogação por razões de mérito."},{"label":"D","text":"a revogação produz efeitos retroativos."},{"label":"E","text":"ambas decorrem sempre de vício de legalidade."}]'::jsonb,
       E'Anulação: ato ilegal, efeito ex tunc. Revogação: ato válido, por conveniência/oportunidade (mérito), efeito ex nunc (em regra).',
       3, 'Média', 'VUNESP', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t1,
       E'São elementos ou requisitos de validade do ato administrativo:',
       'D',
       '[{"label":"A","text":"finalidade, mérito, oportunidade e conveniência."},{"label":"B","text":"forma, objeto, finalidade e imperatividade."},{"label":"C","text":"competência, presunção e tipicidade."},{"label":"D","text":"competência, finalidade, forma, motivo e objeto."},{"label":"E","text":"objeto, motivo, legalidade e autoexecutoriedade."}]'::jsonb,
       E'Os elementos do ato administrativo (teoria de Hely Lopes Meirelles) são: competência, finalidade, forma, motivo e objeto.',
       1, 'Muito Fácil', 'CEBRASPE', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t1,
       E'Na desconcentração administrativa, ocorre:',
       'E',
       '[{"label":"A","text":"a criação de pessoa jurídica distinta da Administração."},{"label":"B","text":"a transferência de competências para entes privados."},{"label":"C","text":"a outorga de serviço a concessionária."},{"label":"D","text":"a delegação a sociedade de economia mista."},{"label":"E","text":"a distribuição interna de competências dentro da mesma pessoa jurídica."}]'::jsonb,
       E'Desconcentração = distribuição interna de competências (órgãos), dentro da mesma pessoa jurídica. Descentralização = criação/transferência para outra pessoa jurídica.',
       4, 'Difícil', 'FGV', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t1,
       E'Julgue a assertiva: "O ato administrativo vinculado é aquele praticado sem margem de escolha quanto ao seu conteúdo, pois a lei define todos os requisitos."',
       'CERTO',
       NULL,
       E'No ato vinculado, a Administração não tem liberdade de escolha: a lei predetermina os requisitos (ex.: licença para construir quando cumpridos os requisitos legais).',
       2, 'Fácil', 'CEBRASPE', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t2,
       E'O poder administrativo que permite à Administração punir os servidores por infrações funcionais é o poder:',
       'B',
       '[{"label":"A","text":"hierárquico"},{"label":"B","text":"disciplinar"},{"label":"C","text":"regulamentar"},{"label":"D","text":"de polícia"},{"label":"E","text":"de autotutela"}]'::jsonb,
       E'Poder disciplinar: apuração de infrações e aplicação de penalidades aos servidores e demais pessoas sujeitas à disciplina administrativa.',
       1, 'Muito Fácil', 'FCC', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t2,
       E'A faculdade de a Administração delegar e avocar competências decorre do poder:',
       'C',
       '[{"label":"A","text":"disciplinar"},{"label":"B","text":"de polícia"},{"label":"C","text":"hierárquico"},{"label":"D","text":"regulamentar"},{"label":"E","text":"de tutela"}]'::jsonb,
       E'Poder hierárquico: escalonamento de competências, com possibilidade de delegação, avocação, edição de ordens e fiscalização.',
       2, 'Fácil', 'VUNESP', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t2,
       E'O poder de polícia administrativa consiste na:',
       'D',
       '[{"label":"A","text":"capacidade de punir servidores por infrações."},{"label":"B","text":"competência para organizar os órgãos internos."},{"label":"C","text":"faculdade de editar normas delegadas."},{"label":"D","text":"atividade de limitar e condicionar o exercício de direitos em prol do interesse público."},{"label":"E","text":"prerrogativa de contratar sem licitação."}]'::jsonb,
       E'Poder de polícia: condicionar/limitar o exercício de direitos individuais em benefício do interesse público (segurança, saúde, ordem, moralidade).',
       2, 'Fácil', 'FGV', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t2,
       E'Quando o agente público pratica ato dentro da competência, mas com finalidade diversa da prevista em lei, há:',
       'A',
       '[{"label":"A","text":"desvio de poder (desvio de finalidade)."},{"label":"B","text":"excesso de poder."},{"label":"C","text":"abuso de autoridade caracterizado apenas por violência."},{"label":"D","text":"ato inexistente."},{"label":"E","text":"convalidação do ato."}]'::jsonb,
       E'Excesso de poder: ato fora dos limites da competência. Desvio de poder: finalidade diversa da prevista em lei. Ambos são formas de abuso de poder.',
       3, 'Média', 'CEBRASPE', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t3,
       E'São princípios expressos da Administração Pública no art. 37 da CF/88:',
       'B',
       '[{"label":"A","text":"legalidade, razoabilidade, proporcionalidade e eficiência."},{"label":"B","text":"legalidade, impessoalidade, moralidade, publicidade e eficiência."},{"label":"C","text":"impessoalidade, moralidade, transparência e motivação."},{"label":"D","text":"legalidade, segurança jurídica, supremacia e indisponibilidade."},{"label":"E","text":"publicidade, eficiência, continuidade e autotutela."}]'::jsonb,
       E'Art. 37, caput: "A administração pública direta e indireta obedecerá aos princípios de legalidade, impessoalidade, moralidade, publicidade e eficiência". (LIMPE)',
       1, 'Muito Fácil', 'FCC', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t3,
       E'Conforme a Lei nº 14.133/2021 (nova Lei de Licitações), a modalidade de licitação para aquisição de bens e serviços comuns, qualquer que seja o valor estimado, é o(a):',
       'D',
       '[{"label":"A","text":"concorrência"},{"label":"B","text":"leilão"},{"label":"C","text":"concurso"},{"label":"D","text":"pregão"},{"label":"E","text":"diálogo competitivo"}]'::jsonb,
       E'Art. 6º, XLI e art. 28 da Lei 14.133/2021: o pregão é obrigatório para bens e serviços comuns, cujos padrões possam ser definidos objetivamente.',
       3, 'Média', 'FGV', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t3,
       E'São modalidades de licitação previstas na Lei nº 14.133/2021:',
       'C',
       '[{"label":"A","text":"tomada de preços, pregão e convite."},{"label":"B","text":"concorrência, convite e concurso."},{"label":"C","text":"pregão, concorrência, concurso, leilão e diálogo competitivo."},{"label":"D","text":"pregão, convite, tomada de preços e leilão."},{"label":"E","text":"concorrência, pregão, tomada de preços e leilão."}]'::jsonb,
       E'A Lei 14.133/2021 unificou os regimes e manteve cinco modalidades: pregão, concorrência, concurso, leilão e diálogo competitivo. Extinguiu convite e tomada de preços.',
       3, 'Média', 'VUNESP', 'Adaptações de prova', 2023, 'ACTIVE');

    END IF;
  END IF;

  -- ========================================================================
  -- DISCIPLINA 4: Raciocínio Lógico
  -- ========================================================================
  SELECT id INTO v_disc FROM public.disciplines WHERE name = 'Raciocínio Lógico' LIMIT 1;
  IF v_disc IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM public.questions WHERE discipline_id = v_disc;
    IF v_count = 0 THEN
      SELECT id INTO v_t1 FROM public.question_topics WHERE discipline_id = v_disc AND name = 'Sequências e Padrões';
      IF v_t1 IS NULL THEN
        INSERT INTO public.question_topics (discipline_id, name) VALUES (v_disc, 'Sequências e Padrões') RETURNING id INTO v_t1;
      END IF;
      SELECT id INTO v_t2 FROM public.question_topics WHERE discipline_id = v_disc AND name = 'Lógica Proposicional';
      IF v_t2 IS NULL THEN
        INSERT INTO public.question_topics (discipline_id, name) VALUES (v_disc, 'Lógica Proposicional') RETURNING id INTO v_t2;
      END IF;

      INSERT INTO public.questions (discipline_id, topic_id, statement, correct_answer, alternatives, explanation, difficulty_level, difficulty_label, exam_board, exam_name, exam_year, question_status)
      VALUES
      (v_disc, v_t1,
       E'Considere a sequência: 2, 4, 8, 16, 32, ... O próximo termo é:',
       'C',
       '[{"label":"A","text":"34"},{"label":"B","text":"36"},{"label":"C","text":"64"},{"label":"D","text":"48"},{"label":"E","text":"96"}]'::jsonb,
       E'Cada termo é o dobro do anterior: 32 × 2 = 64.',
       1, 'Muito Fácil', 'FCC', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t1,
       E'Na sequência 1, 1, 2, 3, 5, 8, 13, ... (Fibonacci), o próximo número é:',
       'D',
       '[{"label":"A","text":"15"},{"label":"B","text":"18"},{"label":"C","text":"20"},{"label":"D","text":"21"},{"label":"E","text":"24"}]'::jsonb,
       E'Na sequência de Fibonacci, cada termo é a soma dos dois anteriores: 8 + 13 = 21.',
       2, 'Fácil', 'VUNESP', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t1,
       E'Qual é o próximo termo da sequência B, D, F, H, ... ?',
       'B',
       '[{"label":"A","text":"I"},{"label":"B","text":"J"},{"label":"C","text":"K"},{"label":"D","text":"L"},{"label":"E","text":"M"}]'::jsonb,
       E'As letras seguem a ordem alfabética pulando uma letra: B, D, F, H, J.',
       1, 'Muito Fácil', 'CEBRASPE', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t1,
       E'Em uma sequência em que cada termo é o anterior subtraído de 5, começando por 50, o 4º termo é:',
       'A',
       '[{"label":"A","text":"35"},{"label":"B","text":"30"},{"label":"C","text":"40"},{"label":"D","text":"45"},{"label":"E","text":"25"}]'::jsonb,
       E'Termos: 50, 45, 40, 35. O 4º termo é 35.',
       2, 'Fácil', 'FGV', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t1,
       E'Em um campeonato com 8 times, cada time joga contra todos os outros uma única vez. O total de jogos é:',
       'C',
       '[{"label":"A","text":"16"},{"label":"B","text":"24"},{"label":"C","text":"28"},{"label":"D","text":"32"},{"label":"E","text":"56"}]'::jsonb,
       E'Combinação de 8 elementos 2 a 2: C(8,2) = 8×7/2 = 28 jogos.',
       4, 'Difícil', 'FCC', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t2,
       E'Considere a proposição P: "Se chover, então a rua fica molhada." A negação correta de P é:',
       'E',
       '[{"label":"A","text":"Se não chover, então a rua não fica molhada."},{"label":"B","text":"Se chover, então a rua não fica molhada."},{"label":"C","text":"Não choveu."},{"label":"D","text":"A rua ficou molhada."},{"label":"E","text":"Choveu e a rua não ficou molhada."}]'::jsonb,
       E'A negação de "Se A, então B" é "A e não B": choveu e a rua NÃO ficou molhada.',
       4, 'Difícil', 'CEBRASPE', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t2,
       E'Das proposições abaixo, é uma contingência (nem sempre verdadeira nem sempre falsa):',
       'D',
       '[{"label":"A","text":"Chove ou não chove."},{"label":"B","text":"Se choveu, então choveu."},{"label":"C","text":"Chove e não chove."},{"label":"D","text":"Choveu ontem ou o trânsito estava normalizado."},{"label":"E","text":"Todo efeito tem uma causa."}]'::jsonb,
       E'Contingência: proposição cujo valor de verdade depende do mundo. "A" e "B" são tautologias; "C" é contradição. "D" depende dos fatos.',
       4, 'Difícil', 'FGV', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t2,
       E'Todos os engenheiros usam calculadora. João não usa calculadora. Logo, conclui-se que:',
       'B',
       '[{"label":"A","text":"João é engenheiro."},{"label":"B","text":"João não é engenheiro."},{"label":"C","text":"João é técnico."},{"label":"D","text":"Todos os engenheiros são João."},{"label":"E","text":"Nenhum engenheiro existe."}]'::jsonb,
       E'Silogismo: se todos os engenheiros usam calculadora e João não usa, João não pode ser engenheiro (modus tollens).',
       2, 'Fácil', 'FCC', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t2,
       E'Pedro diz: "Se eu estudar, passo no concurso." Pedro estudou e passou. Considerando apenas as premissas, a conclusão é:',
       'A',
       '[{"label":"A","text":"uma dedução válida pela regra modus ponens."},{"label":"B","text":"inválida, pois estudar não garante passar."},{"label":"C","text":"válida somente se houver segundo concurso."},{"label":"D","text":"uma falácia de afirmação do consequente."},{"label":"E","text":"indeterminada, pois faltam premissas."}]'::jsonb,
       E'Modus ponens: se P → Q e P é verdadeiro, então Q é verdadeiro. A argumentação é logicamente válida (independentemente de opiniões sobre o mundo).',
       3, 'Média', 'VUNESP', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t2,
       E'Em uma urna há 3 bolas vermelhas e 2 azuis. Retirando-se uma bola ao acaso, a probabilidade de ela ser vermelha é:',
       'B',
       '[{"label":"A","text":"1/5"},{"label":"B","text":"3/5"},{"label":"C","text":"2/5"},{"label":"D","text":"1/2"},{"label":"E","text":"3/2"}]'::jsonb,
       E'Probabilidade = casos favoráveis / total = 3/5.',
       1, 'Muito Fácil', 'CEBRASPE', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t1,
       E'Um produto custava R$ 80,00 e sofreu aumento de 25%. O novo preço é:',
       'C',
       '[{"label":"A","text":"R$ 85,00"},{"label":"B","text":"R$ 90,00"},{"label":"C","text":"R$ 100,00"},{"label":"D","text":"R$ 105,00"},{"label":"E","text":"R$ 120,00"}]'::jsonb,
       E'25% de 80 = 20; 80 + 20 = R$ 100,00.',
       1, 'Muito Fácil', 'FGV', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t1,
       E'Maria é mais velha que Ana. Ana é mais velha que Carla. Logo:',
       'D',
       '[{"label":"A","text":"Carla é mais velha que Maria."},{"label":"B","text":"Maria e Carla têm a mesma idade."},{"label":"C","text":"Ana é mais velha que Maria."},{"label":"D","text":"Maria é mais velha que Carla."},{"label":"E","text":"Não é possível concluir nada."}]'::jsonb,
       E'A relação "mais velha que" é transitiva: Maria > Ana > Carla, logo Maria é mais velha que Carla.',
       1, 'Muito Fácil', 'VUNESP', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t2,
       E'Em uma sala, 6 pessoas se cumprimentam com um aperto de mãos. Cada par se cumprimenta uma única vez. O total de apertos de mãos é:',
       'E',
       '[{"label":"A","text":"12"},{"label":"B","text":"18"},{"label":"C","text":"20"},{"label":"D","text":"24"},{"label":"E","text":"15"}]'::jsonb,
       E'C(6,2) = 6×5/2 = 15 apertos de mão.',
       3, 'Média', 'FCC', 'Adaptações de prova', 2023, 'ACTIVE');
    END IF;
  END IF;

  -- ========================================================================
  -- DISCIPLINA 5: Informática
  -- ========================================================================
  SELECT id INTO v_disc FROM public.disciplines WHERE name = 'Informática' LIMIT 1;
  IF v_disc IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM public.questions WHERE discipline_id = v_disc;
    IF v_count = 0 THEN
      SELECT id INTO v_t1 FROM public.question_topics WHERE discipline_id = v_disc AND name = 'Noções de Sistemas';
      IF v_t1 IS NULL THEN
        INSERT INTO public.question_topics (discipline_id, name) VALUES (v_disc, 'Noções de Sistemas') RETURNING id INTO v_t1;
      END IF;
      SELECT id INTO v_t2 FROM public.question_topics WHERE discipline_id = v_disc AND name = 'Segurança da Informação';
      IF v_t2 IS NULL THEN
        INSERT INTO public.question_topics (discipline_id, name) VALUES (v_disc, 'Segurança da Informação') RETURNING id INTO v_t2;
      END IF;

      INSERT INTO public.questions (discipline_id, topic_id, statement, correct_answer, alternatives, explanation, difficulty_level, difficulty_label, exam_board, exam_name, exam_year, question_status)
      VALUES
      (v_disc, v_t1,
       E'No Windows, o atalho de teclado usado para copiar um arquivo selecionado é:',
       'B',
       '[{"label":"A","text":"Ctrl + X"},{"label":"B","text":"Ctrl + C"},{"label":"C","text":"Ctrl + V"},{"label":"D","text":"Ctrl + Z"},{"label":"E","text":"Ctrl + A"}]'::jsonb,
       E'Ctrl+C copia; Ctrl+X recorta; Ctrl+V cola; Ctrl+Z desfaz; Ctrl+A seleciona tudo.',
       1, 'Muito Fácil', 'FCC', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t1,
       E'Em uma planilha eletrônica (Excel), a fórmula que soma os valores do intervalo A1 até A10 é:',
       'C',
       '[{"label":"A","text":"=SUMAR(A1;A10)"},{"label":"B","text":"=SOMA A1-A10"},{"label":"C","text":"=SOMA(A1:A10)"},{"label":"D","text":"=TOTAL(A1:A10)"},{"label":"E","text":"+SOMA(A1,A10)"}]'::jsonb,
       E'A sintaxe correta é =SOMA(A1:A10), usando o operador de intervalo ":" entre as células.',
       1, 'Muito Fácil', 'VUNESP', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t1,
       E'Na linguagem HTML, a tag utilizada para criar um parágrafo é:',
       'A',
       '[{"label":"A","text":"<p>"},{"label":"B","text":"<h1>"},{"label":"C","text":"<b>"},{"label":"D","text":"<link>"},{"label":"E","text":"<title>"}]'::jsonb,
       E'A tag <p> define um parágrafo. <h1> é título, <b> é negrito, <link> referencia folhas de estilo.',
       2, 'Fácil', 'FGV', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t1,
       E'No correio eletrônico, o campo "Cco" (cópia oculta) serve para:',
       'D',
       '[{"label":"A","text":"enviar anexos adicionais."},{"label":"B","text":"marcar o e-mail como resposta."},{"label":"C","text":"enviar cópia visível a todos os destinatários."},{"label":"D","text":"enviar cópia sem que os demais destinatários vejam o endereço."},{"label":"E","text":"desfazer o envio do e-mail."}]'::jsonb,
       E'"Cco" (com cópia oculta) oculta os destinatários uns dos outros. "Cc" mostra a todos.',
       2, 'Fácil', 'CEBRASPE', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t1,
       E'Um navegador (browser) é um programa cuja principal função é:',
       'C',
       '[{"label":"A","text":"editar planilhas e documentos."},{"label":"B","text":"proteger o computador contra vírus."},{"label":"C","text":"acessar e exibir páginas da internet."},{"label":"D","text":"gerenciar o hardware do computador."},{"label":"E","text":"criar apresentações de slides."}]'::jsonb,
       E'Navegadores (Chrome, Firefox, Edge) interpretam HTML e exibem sites ao usuário.',
       1, 'Muito Fácil', 'FCC', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t2,
       E'Golpe em que um e-mail falso, que parece vir de uma instituição confiável, solicita dados pessoais ou bancários é conhecido como:',
       'B',
       '[{"label":"A","text":"spyware"},{"label":"B","text":"phishing"},{"label":"C","text":"ransomware"},{"label":"D","text":"firewall"},{"label":"E","text":"backup"}]'::jsonb,
       E'Phishing: fraude via mensagens falsas que induzem a vítima a informar dados sensíveis.',
       2, 'Fácil', 'VUNESP', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t2,
       E'Programa malicioso que sequestra os arquivos do usuário e exige pagamento (resgate) para liberá-los é o:',
       'D',
       '[{"label":"A","text":"phishing"},{"label":"B","text":"adware"},{"label":"C","text":"trojan"},{"label":"D","text":"ransomware"},{"label":"E","text":"worm"}]'::jsonb,
       E'Ransomware criptografa dados e exige resgate (ransom) para descriptografar.',
       2, 'Fácil', 'FGV', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t2,
       E'A prática de fazer cópias periódicas dos dados em outro dispositivo, para recuperação em caso de perda, é denominada:',
       'A',
       '[{"label":"A","text":"backup"},{"label":"B","text":"firewall"},{"label":"C","text":"compactação"},{"label":"D","text":"criptografia"},{"label":"E","text":"sincronização"}]'::jsonb,
       E'Backup (cópia de segurança) protege contra perda de dados.',
       1, 'Muito Fácil', 'CEBRASPE', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t2,
       E'Sobre senhas e segurança, a conduta mais segura é:',
       'E',
       '[{"label":"A","text":"usar a mesma senha em todos os serviços."},{"label":"B","text":"anotar as senhas em post-its no monitor."},{"label":"C","text":"usar datas de nascimento."},{"label":"D","text":"compartilhar senhas com colegas de confiança."},{"label":"E","text":"usar senhas longas, com letras, números e símbolos, e ativar a verificação em duas etapas."}]'::jsonb,
       E'Senhas fortes e exclusivas, com autenticação de múltiplos fatores, reduzem o risco de invasões.',
       2, 'Fácil', 'FCC', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t1,
       E'O endereço de um site na internet, como https://www.bancobrasil.com.br, é chamado de:',
       'C',
       '[{"label":"A","text":"IP interno"},{"label":"B","text":"servidor proxy"},{"label":"C","text":"URL"},{"label":"D","text":"cookie"},{"label":"E","text":"cache"}]'::jsonb,
       E'URL (Uniform Resource Locator) é o endereço que identifica um recurso na web.',
       2, 'Fácil', 'VUNESP', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t1,
       E'Amazenar arquivos em servidores remotos acessíveis pela internet, em vez de no disco local, é conhecido como:',
       'B',
       '[{"label":"A","text":"hardware"},{"label":"B","text":"computação em nuvem"},{"label":"C","text":"processamento offline"},{"label":"D","text":"rede privada local"},{"label":"E","text":"sistema operacional"}]'::jsonb,
       E'Cloud computing: uso de recursos de computação pela internet, sob demanda.',
       1, 'Muito Fácil', 'FGV', 'Adaptações de prova', 2023, 'ACTIVE'),

      (v_disc, v_t1,
       E'"https" presente em muitos endereços de sites indica:',
       'D',
       '[{"label":"A","text":"que o site é gratuito."},{"label":"B","text":"que o site contém anúncios."},{"label":"C","text":"que a página foi compartilhada nas redes sociais."},{"label":"D","text":"que a comunicação entre navegador e servidor é criptografada."},{"label":"E","text":"que o site está fora do ar."}]'::jsonb,
       E'HTTPS (HyperText Transfer Protocol Secure) usa criptografia SSL/TLS para proteger o tráfego.',
       3, 'Média', 'FCC', 'Adaptações de prova', 2023, 'ACTIVE');
    END IF;
  END IF;

  RAISE NOTICE 'Seed de questões concluído.';
END $$;