/**
 * G1.1 (G-27) — este módulo agora delega ao helper canônico compartilhado
 * (`@/domain/disciplines/discipline-naming`). A API é preservada para não
 * quebrar os chamadores existentes; a regra de comparação passa a ser única
 * em todo o sistema (resolve/busca/insert/dedupe).
 */
export {
  canonicalDisciplineKey as normalizeForMatch,
  sameCanonicalDisciplineName as sameNormalized,
} from "@/domain/disciplines/discipline-naming"
