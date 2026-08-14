import type { ImportCompletedStats, StudyReminderDetails, WeeklySummaryStats } from "./email.types"

interface BaseTemplateOptions {
  title: string
  preheader?: string
  contentHtml: string
  ctaText?: string
  ctaUrl?: string
  appUrl: string
  securityNotice?: string
}

/**
 * Layout Base compartilhado por todos os e-mails do Nomeia.
 * Estrutura 100% responsiva (HTML table-based), com estilo profissional e clean.
 */
export function getBaseEmailLayout({
  title,
  preheader = "Nomeia — Sua preparação rumo à nomeação",
  contentHtml,
  ctaText,
  ctaUrl,
  appUrl,
  securityNotice,
}: BaseTemplateOptions): string {
  const currentYear = new Date().getFullYear()

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      -webkit-font-smoothing: antialiased;
    }
    table {
      border-spacing: 0;
    }
    td {
      padding: 0;
    }
    img {
      border: 0;
    }
    .wrapper {
      width: 100%;
      table-layout: fixed;
      background-color: #f8fafc;
      padding-bottom: 40px;
    }
    .main {
      background-color: #ffffff;
      margin: 0 auto;
      width: 100%;
      max-width: 600px;
      border-spacing: 0;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05);
      border: 1px solid #e2e8f0;
    }
    .header {
      background: linear-gradient(135deg, #1e40af 0%, #2563eb 100%);
      padding: 32px 24px;
      text-align: center;
      color: #ffffff;
    }
    .header-logo {
      font-size: 26px;
      font-weight: 900;
      letter-spacing: -0.5px;
      color: #ffffff;
      text-decoration: none;
      display: inline-block;
    }
    .header-tagline {
      font-size: 13px;
      font-weight: 500;
      color: #bfdbfe;
      margin-top: 4px;
      letter-spacing: 0.2px;
    }
    .content {
      padding: 32px 28px;
      font-size: 15px;
      line-height: 1.6;
      color: #334155;
    }
    .btn-container {
      text-align: center;
      margin: 30px 0;
    }
    .btn {
      background-color: #2563eb;
      color: #ffffff !important;
      padding: 13px 28px;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 700;
      font-size: 14px;
      display: inline-block;
      box-shadow: 0 2px 4px rgba(37, 99, 235, 0.25);
    }
    .stats-card {
      background-color: #f1f5f9;
      border-radius: 8px;
      padding: 18px;
      margin: 20px 0;
      border: 1px solid #e2e8f0;
    }
    .footer {
      text-align: center;
      padding: 24px 20px;
      font-size: 12px;
      color: #64748b;
      line-height: 1.5;
    }
    .footer a {
      color: #2563eb;
      text-decoration: none;
    }
    .security-badge {
      background-color: #f8fafc;
      border-left: 3px solid #2563eb;
      padding: 10px 14px;
      margin-top: 24px;
      font-size: 12px;
      color: #475569;
      border-radius: 0 6px 6px 0;
    }
    @media only screen and (max-width: 600px) {
      .content {
        padding: 24px 18px !important;
      }
      .header {
        padding: 24px 16px !important;
      }
      .btn {
        width: 85% !important;
        text-align: center !important;
      }
    }
  </style>
</head>
<body>
  <!-- Preheader oculto para preview no cliente de email -->
  <div style="display: none; font-size: 1px; color: #f8fafc; line-height: 1px; max-height: 0px; max-width: 0px; opacity: 0; overflow: hidden;">
    ${preheader}
  </div>

  <center class="wrapper">
    <table style="width: 100%; max-width: 600px; margin: 30px auto 0;">
      <tr>
        <td>
          <div class="main">
            <!-- Header -->
            <div class="header">
              <div class="header-logo">⚡ NomeIA</div>
              <div class="header-tagline">Sua preparação rumo à nomeação.</div>
            </div>

            <!-- Content Body -->
            <div class="content">
              ${contentHtml}

              ${
                ctaText && ctaUrl
                  ? `
              <div class="btn-container">
                <a href="${ctaUrl}" class="btn" target="_blank" rel="noopener noreferrer">${ctaText}</a>
              </div>
              `
                  : ""
              }

              ${
                securityNotice
                  ? `
              <div class="security-badge">
                🔒 <strong>Aviso de Segurança:</strong> ${securityNotice}
              </div>
              `
                  : ""
              }
            </div>
          </div>

          <!-- Footer -->
          <div class="footer">
            <p style="margin: 0 0 8px 0;">
              Você recebeu este e-mail porque possui uma conta ativa no <strong>NomeIA</strong>.
            </p>
            <p style="margin: 0 0 12px 0;">
              <a href="${appUrl}/profile">Preferências de Notificação</a> &nbsp;•&nbsp; 
              <a href="${appUrl}/dashboard">Acessar Painel</a> &nbsp;•&nbsp; 
              <a href="${appUrl}">NomeIA</a>
            </p>
            <p style="margin: 0; color: #94a3b8; font-size: 11px;">
              © ${currentYear} NomeIA. Todos os direitos reservados.
            </p>
          </div>
        </td>
      </tr>
    </table>
  </center>
</body>
</html>
`
}

/**
 * 1. Template: E-mail de Teste
 */
export function getTestEmailTemplate({
  name = "Estudante",
  email,
  appUrl,
}: {
  name?: string
  email: string
  appUrl: string
}): { subject: string; html: string; text: string } {
  const subject = "⚡ Teste de e-mail — NomeIA"

  const contentHtml = `
    <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 800; color: #0f172a;">
      Olá, ${name}!
    </h2>
    <p style="margin: 0 0 16px 0;">
      Este é um e-mail de teste para confirmar que a integração do <strong>Resend</strong> com o <strong>NomeIA</strong> está funcionando com sucesso.
    </p>
    <div class="stats-card">
      <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 8px;">
        Detalhes do Teste
      </div>
      <table style="width: 100%; font-size: 13px; color: #334155;">
        <tr>
          <td style="padding: 4px 0; font-weight: 600;">Destinatário:</td>
          <td style="padding: 4px 0; text-align: right; font-family: monospace;">${email}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; font-weight: 600;">Data do Envio:</td>
          <td style="padding: 4px 0; text-align: right;">${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; font-weight: 600;">Status do Serviço:</td>
          <td style="padding: 4px 0; text-align: right; color: #16a34a; font-weight: 700;">✓ Operacional</td>
        </tr>
      </table>
    </div>
    <p style="margin: 0;">
      A infraestrutura central de e-mails está pronta para notificações inteligentes, resumos semanais e atualizações da sua preparação.
    </p>
  `

  const html = getBaseEmailLayout({
    title: subject,
    preheader: "Seu sistema de e-mails do NomeIA está funcionando corretamente.",
    contentHtml,
    ctaText: "Abrir o NomeIA",
    ctaUrl: `${appUrl}/dashboard`,
    appUrl,
    securityNotice: "Este teste foi disparado a partir da sua conta de usuário no NomeIA.",
  })

  const text = `Olá, ${name}!\n\nEste é um e-mail de teste confirmando que a infraestrutura do Resend no NomeIA está funcionando.\nDestinatário: ${email}\nData: ${new Date().toISOString()}\n\nAcesse: ${appUrl}/dashboard`

  return { subject, html, text }
}

/**
 * 2. Template: Boas-vindas
 */
export function getWelcomeEmailTemplate({
  name = "Estudante",
  appUrl,
}: {
  name?: string
  appUrl: string
}): { subject: string; html: string; text: string } {
  const subject = "Bem-vindo ao NomeIA! 🚀 Sua preparação começa agora"

  const contentHtml = `
    <h2 style="margin: 0 0 16px 0; font-size: 22px; font-weight: 800; color: #0f172a;">
      Bem-vindo ao NomeIA, ${name}!
    </h2>
    <p style="margin: 0 0 16px 0;">
      Sua conta foi criada com sucesso. A partir de agora, você conta com um ecossistema completo para acelerar sua preparação rumo à nomeação.
    </p>
    
    <div class="stats-card">
      <div style="font-size: 13px; font-weight: 800; color: #2563eb; margin-bottom: 12px;">
        O que você pode fazer agora:
      </div>
      <ul style="margin: 0; padding-left: 20px; font-size: 14px; line-height: 1.8; color: #334155;">
        <li><strong>Montar seu Plano de Estudos:</strong> Planeje sua rotina semanal com ciclos personalizados.</li>
        <li><strong>Registrar Sessões:</strong> Acompanhe tempo real, questões resolvidas e percentual de acertos.</li>
        <li><strong>Importar Histórico:</strong> Traga seus dados de outras plataformas (Aprovado, etc.) em segundos.</li>
        <li><strong>Revisões Inteligentes:</strong> Fixe o conteúdo com algoritmos de repetição espaçada.</li>
      </ul>
    </div>

    <p style="margin: 0;">
      Estamos prontos para caminhar com você até o dia da sua posse. Bom estudo!
    </p>
  `

  const html = getBaseEmailLayout({
    title: subject,
    preheader: "Sua conta no NomeIA está pronta. Acesse e comece a estudar com estratégia.",
    contentHtml,
    ctaText: "Acessar o NomeIA",
    ctaUrl: `${appUrl}/dashboard`,
    appUrl,
  })

  const text = `Bem-vindo ao NomeIA, ${name}!\n\nSua conta foi criada com sucesso. Acesse ${appUrl}/dashboard para planejar seus estudos e acompanhar seu desempenho.`

  return { subject, html, text }
}

/**
 * 3. Template: Resumo Semanal
 */
export function getWeeklySummaryEmailTemplate({
  name = "Estudante",
  stats,
  appUrl,
}: {
  name?: string
  stats: WeeklySummaryStats
  appUrl: string
}): { subject: string; html: string; text: string } {
  const hours = Math.floor(stats.totalMinutes / 60)
  const minutes = stats.totalMinutes % 60
  const timeFormatted = `${hours}h${minutes < 10 ? "0" : ""}${minutes}m`
  const accuracy =
    stats.accuracyPercentage ??
    (stats.totalQuestions > 0
      ? Math.round((stats.correctQuestions / stats.totalQuestions) * 100)
      : 0)

  const subject = `📊 Seu Relatório Semanal de Estudos: ${timeFormatted} e ${accuracy}% de acerto`

  const contentHtml = `
    <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 800; color: #0f172a;">
      Olá, ${name}!
    </h2>
    <p style="margin: 0 0 20px 0;">
      Confira o resumo da sua dedicação aos estudos nos últimos 7 dias:
    </p>

    <!-- Grid de métricas -->
    <table style="width: 100%; border-collapse: separate; border-spacing: 8px; margin-bottom: 16px;">
      <tr>
        <td style="background-color: #eff6ff; border: 1px solid #dbeafe; border-radius: 10px; padding: 14px; text-align: center; width: 50%;">
          <div style="font-size: 11px; font-weight: 800; color: #2563eb; text-transform: uppercase;">Tempo Estudado</div>
          <div style="font-size: 22px; font-weight: 900; color: #1e3a8a; margin-top: 4px;">${timeFormatted}</div>
        </td>
        <td style="background-color: #f0fdf4; border: 1px solid #dcfce7; border-radius: 10px; padding: 14px; text-align: center; width: 50%;">
          <div style="font-size: 11px; font-weight: 800; color: #16a34a; text-transform: uppercase;">Taxa de Acerto</div>
          <div style="font-size: 22px; font-weight: 900; color: #14532d; margin-top: 4px;">${accuracy}%</div>
        </td>
      </tr>
      <tr>
        <td style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; text-align: center; width: 50%;">
          <div style="font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase;">Questões Feitas</div>
          <div style="font-size: 20px; font-weight: 900; color: #0f172a; margin-top: 4px;">${stats.totalQuestions} <span style="font-size: 12px; font-weight: 600; color: #16a34a;">(${stats.correctQuestions} ✓)</span></div>
        </td>
        <td style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px; text-align: center; width: 50%;">
          <div style="font-size: 11px; font-weight: 800; color: #64748b; text-transform: uppercase;">Disciplinas</div>
          <div style="font-size: 20px; font-weight: 900; color: #0f172a; margin-top: 4px;">${stats.disciplinesCount} matérias</div>
        </td>
      </tr>
    </table>

    <div class="stats-card">
      <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 8px;">
        Destaques da Semana
      </div>
      <p style="margin: 4px 0; font-size: 14px;">🔥 <strong>Sequência:</strong> ${stats.consecutiveDays} dia${stats.consecutiveDays !== 1 ? "s" : ""} consecutivo${stats.consecutiveDays !== 1 ? "s" : ""}</p>
      ${stats.bestTimeSlot ? `<p style="margin: 4px 0; font-size: 14px;">⏰ <strong>Melhor Horário:</strong> ${stats.bestTimeSlot}</p>` : ""}
      ${stats.priorityDiscipline ? `<p style="margin: 4px 0; font-size: 14px;">🎯 <strong>Disciplina em foco:</strong> ${stats.priorityDiscipline}</p>` : ""}
    </div>

    <p style="margin: 0;">
      A constância é a chave para a nomeação. Continue firme na próxima semana!
    </p>
  `

  const html = getBaseEmailLayout({
    title: subject,
    preheader: `Você estudou ${timeFormatted} e fez ${stats.totalQuestions} questões esta semana no NomeIA.`,
    contentHtml,
    ctaText: "Ver Relatório Completo",
    ctaUrl: `${appUrl}/estatisticas`,
    appUrl,
  })

  const text = `Relatório Semanal de Estudos — NomeIA\n\nOlá, ${name}!\nTempo estudado: ${timeFormatted}\nQuestões: ${stats.totalQuestions} (${stats.correctQuestions} acertos, ${accuracy}%)\nDisciplinas: ${stats.disciplinesCount}\nSequência: ${stats.consecutiveDays} dias\n\nVer estatísticas: ${appUrl}/estatisticas`

  return { subject, html, text }
}

/**
 * 4. Template: Importação Concluída
 */
export function getImportCompletedEmailTemplate({
  name = "Estudante",
  stats,
  appUrl,
}: {
  name?: string
  stats: ImportCompletedStats
  appUrl: string
}): { subject: string; html: string; text: string } {
  const subject = `📥 Histórico importado com sucesso (${stats.importedCount} sessões)`

  const contentHtml = `
    <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 800; color: #0f172a;">
      Olá, ${name}!
    </h2>
    <p style="margin: 0 0 16px 0;">
      A importação do seu histórico de estudos da plataforma <strong>${stats.platformName}</strong> foi concluída e processada no NomeIA.
    </p>

    <div class="stats-card">
      <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #64748b; margin-bottom: 8px;">
        Resumo do Processamento
      </div>
      <table style="width: 100%; font-size: 13px; color: #334155;">
        <tr>
          <td style="padding: 4px 0;">Sessões Processadas:</td>
          <td style="padding: 4px 0; text-align: right; font-weight: 700;">${stats.processedCount.toLocaleString("pt-BR")}</td>
        </tr>
        <tr>
          <td style="padding: 4px 0; color: #16a34a; font-weight: 600;">Novas Importadas:</td>
          <td style="padding: 4px 0; text-align: right; color: #16a34a; font-weight: 800;">${stats.importedCount.toLocaleString("pt-BR")}</td>
        </tr>
        ${
          stats.existingCount > 0
            ? `
        <tr>
          <td style="padding: 4px 0; color: #64748b;">Já Existentes (Ignoradas):</td>
          <td style="padding: 4px 0; text-align: right; color: #64748b; font-weight: 700;">${stats.existingCount.toLocaleString("pt-BR")}</td>
        </tr>
        `
            : ""
        }
        ${
          stats.errorCount > 0
            ? `
        <tr>
          <td style="padding: 4px 0; color: #dc2626;">Erros / Inconsistências:</td>
          <td style="padding: 4px 0; text-align: right; color: #dc2626; font-weight: 700;">${stats.errorCount}</td>
        </tr>
        `
            : ""
        }
      </table>
    </div>

    <p style="margin: 0;">
      Todos os registros já estão sincronizados no seu Histórico e Calendário de estudos.
    </p>
  `

  const html = getBaseEmailLayout({
    title: subject,
    preheader: `Importação de ${stats.importedCount} sessões do ${stats.platformName} concluída com sucesso.`,
    contentHtml,
    ctaText: "Ver Histórico no NomeIA",
    ctaUrl: `${appUrl}/dashboard/history`,
    appUrl,
  })

  const text = `Importação Concluída — NomeIA\n\nOlá, ${name}!\nSua importação do ${stats.platformName} terminou com sucesso.\nSessões importadas: ${stats.importedCount}\n\nAcesse: ${appUrl}/dashboard/history`

  return { subject, html, text }
}

/**
 * 5. Template: Lembrete de Estudo / Revisões
 */
export function getStudyReminderEmailTemplate({
  name = "Estudante",
  details,
  appUrl,
}: {
  name?: string
  details: StudyReminderDetails
  appUrl: string
}): { subject: string; html: string; text: string } {
  let subject = "⏰ Lembrete de Estudo — NomeIA"
  let message = "Sua meta de estudos de hoje está pronta no seu plano semanal."
  let ctaText = "Iniciar Sessão de Estudo"
  let ctaUrl = `${appUrl}/dashboard/study-session`

  if (details.reason === "pending_review") {
    subject = `📚 Você tem ${details.pendingCount || "revisões"} pendentes no NomeIA`
    message = `Você possui <strong>${details.pendingCount ?? "alguns"} flashcards/tópicos</strong> aguardando revisão hoje para fixação na memória de longo prazo.`
    ctaText = "Fazer Revisões Agora"
    ctaUrl = `${appUrl}/dashboard/reviews`
  } else if (details.reason === "streak_protection") {
    subject = "🔥 Não perca sua sequência de estudos no NomeIA!"
    message =
      "Você ainda não registrou estudos hoje. Dedique alguns minutos para manter sua constância e ritmo de preparação."
  } else if (details.reason === "inactive_discipline" && details.disciplineName) {
    subject = `🎯 Atenção: você não estuda ${details.disciplineName} há ${details.daysInactive ?? 3} dias`
    message = `Para manter o equilíbrio do seu edital, reserve uma sessão para <strong>${details.disciplineName}</strong>.`
  }

  const contentHtml = `
    <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 800; color: #0f172a;">
      Olá, ${name}!
    </h2>
    <p style="margin: 0 0 16px 0; font-size: 15px;">
      ${message}
    </p>
    <div class="stats-card">
      <p style="margin: 0; font-size: 13px; color: #475569;">
        💡 <em>Dica de Estudo:</em> Sessões curtas e diárias têm retenção superior a maratonas esporádicas. 25 a 50 minutos de estudo focado já fazem toda a diferença.
      </p>
    </div>
  `

  const html = getBaseEmailLayout({
    title: subject,
    preheader: message.replace(/<[^>]*>?/gm, ""),
    contentHtml,
    ctaText,
    ctaUrl,
    appUrl,
  })

  const text = `Lembrete — NomeIA\n\nOlá, ${name}!\n${message.replace(/<[^>]*>?/gm, "")}\n\nAcesse: ${ctaUrl}`

  return { subject, html, text }
}
