const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf-8');
const envVars = {};
envContent.split('\n').forEach(line => {
  if (line.includes('=')) {
    const [key, ...rest] = line.split('=');
    envVars[key.trim()] = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
  }
});

const supabaseUrl = envVars['NEXT_PUBLIC_SUPABASE_URL'];
const supabaseKey = envVars['NEXT_PUBLIC_SUPABASE_ANON_KEY'];

const serviceKey = envVars['SUPABASE_SERVICE_ROLE_KEY'] || supabaseKey;

const supabase = createClient(supabaseUrl, serviceKey);

const disciplinesList = [
  "Administração de Recursos Materiais",
  "Administração Geral e Pública",
  "AFO, Direito Financeiro e Contabilidade Pública",
  "Análise das Demonstrações Contábeis",
  "Antropologia",
  "Arqueologia",
  "Arquitetura",
  "Arquivologia",
  "Artes e Música",
  "Atualidades e Conhecimentos Gerais",
  "Auditoria Governamental e Controle",
  "Auditoria Privada",
  "Bancos - Atendimento, Vendas, História, etc.",
  "Biblioteconomia",
  "Biologia e Biomedicina",
  "Ciências Atuariais (Atuária)",
  "Ciências Políticas",
  "Ciências Sociais",
  "Comunicação Social",
  "Contabilidade de Custos",
  "Contabilidade de Instituições Financeiras e Atuariais",
  "Contabilidade Geral",
  "Criminalística e Medicina Legal",
  "Criminologia",
  "Defesa Civil",
  "Desenho Técnico e Modelagem da Construção",
  "Design e Artes Gráficas",
  "Direito Administrativo",
  "Direito Agrário",
  "Direito Ambiental",
  "Direito Civil",
  "Direito Constitucional",
  "Direito Constitucional (CF/1988 e Doutrina)",
  "Direito do Consumidor",
  "Direito do Trabalho",
  "Direito Eleitoral",
  "Direito Empresarial",
  "Direito Financeiro",
  "Direito Internacional",
  "Direito Militar",
  "Direito Penal",
  "Direito Penal Militar",
  "Direito Previdenciário",
  "Direito Processual Civil",
  "Direito Processual do Trabalho",
  "Direito Processual Penal",
  "Direito Processual Penal Militar",
  "Direito Tributário",
  "Direitos Humanos",
  "Economia",
  "Educação",
  "Educação Física",
  "Enfermagem",
  "Engenharia Agronômica",
  "Engenharia Ambiental",
  "Engenharia Civil",
  "Engenharia de Segurança do Trabalho",
  "Engenharia Elétrica",
  "Engenharia Mecânica",
  "Estatística",
  "Farmácia",
  "Filosofia",
  "Física",
  "Fisioterapia",
  "Fonoaudiologia",
  "Geografia",
  "História",
  "Informática",
  "Legislação de Trânsito",
  "Legislação Estadual",
  "Legislação Federal",
  "Legislação Municipal",
  "Língua Espanhola",
  "Língua Francesa",
  "Língua Inglesa",
  "Língua Portuguesa",
  "Matemática",
  "Matemática Financeira",
  "Medicina",
  "Medicina Veterinária",
  "Nutrição",
  "Odontologia",
  "Psicologia",
  "Química",
  "Raciocínio Lógico",
  "Redação",
  "Saúde Pública",
  "Serviço Social",
  "Sociologia",
  "Tecnologia da Informação (TI)",
  "Teologia"
];

async function seed() {
  console.log("Seeding disciplines...");
  
  // Try to insert each to avoid a bulk insert failure if one already exists
  let count = 0;
  for (const name of disciplinesList) {
    const { data: existing } = await supabase.from('disciplines').select('id').eq('name', name).maybeSingle();
    
    if (!existing) {
      const { error } = await supabase.from('disciplines').insert({ name, area: 'Geral' });
      if (error) {
        console.error(`Failed to insert ${name}:`, error.message);
      } else {
        count++;
        console.log(`+ Added: ${name}`);
      }
    }
  }
  
  console.log(`Done! Added ${count} new disciplines.`);
}

seed();
