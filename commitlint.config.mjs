/** @type {import('@commitlint/types').UserConfig} */
const config = {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "type-enum": [
      2,
      "always",
      [
        "feat",     // Nova funcionalidade
        "fix",      // Correção de bug
        "docs",     // Documentação
        "style",    // Formatação, sem mudança de lógica
        "refactor", // Refatoração sem correção nem feature
        "perf",     // Melhoria de performance
        "test",     // Testes
        "build",    // Build e dependências
        "ci",       // CI/CD
        "chore",    // Tarefas de manutenção
        "revert",   // Reverter commit
        "db",       // Migrations de banco
        "infra",    // Infraestrutura
      ],
    ],
    "subject-max-length": [2, "always", 100],
    "subject-case": [2, "always", "lower-case"],
    "body-max-line-length": [2, "always", 200],
  },
}

export default config
