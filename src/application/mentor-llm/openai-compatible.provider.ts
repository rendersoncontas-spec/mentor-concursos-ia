import { MentorLLMError, type MentorLLMGeneration, type MentorLLMProvider, type MentorLLMRequest } from "@/domain/mentor/mentor-ai"

import type { MentorLLMApiStyle } from "./mentor-llm.config"

/**
 * G2.16/G2.17 — adapter MÍNIMO para APIs no formato "chat completions"
 * compatível com OpenAI (vale para vários fornecedores via MENTOR_AI_BASE_URL).
 * Sem SDK, sem dependência nova: `fetch` do servidor. A chave, o endpoint, os
 * headers e o timeout ficam aqui dentro — o serviço do Mentor não os conhece.
 * Nunca registra a chave, o prompt ou a resposta.
 *
 * G2.17 (revisão para provedor real):
 * - o timeout cobre TAMBÉM a leitura do corpo (antes só até os headers: um
 *   corpo lento podia passar do limite);
 * - devolve `usage` (tokens) e `finish_reason` quando o fornecedor informa —
 *   senão null, nunca estimado;
 * - em erro HTTP guarda só o CÓDIGO curto do fornecedor (ex.:
 *   "invalid_request_error", "unsupported_parameter"), saneado; nunca a
 *   mensagem livre (que pode ecoar o pedido);
 * - `apiStyle: "reasoning"` usa `max_completion_tokens` e omite `temperature`
 *   (modelos de raciocínio recusam `max_tokens`/`temperature` com 400).
 */

export interface OpenAICompatibleOptions {
  baseUrl: string
  apiKey: string
  model: string
  apiStyle?: MentorLLMApiStyle
}

const SAFE_CODE = /^[a-z0-9_.-]{1,64}$/i

/** Só códigos curtos e conhecidos do corpo de erro; mensagens livres são descartadas. */
function providerErrorCode(body: unknown): string | null {
  const err = (body as { error?: { code?: unknown; type?: unknown; param?: unknown } } | null)?.error
  if (!err || typeof err !== "object") return null
  const parts = [err.type, err.code, err.param].filter((v): v is string => typeof v === "string" && SAFE_CODE.test(v))
  return parts.length > 0 ? parts.join(":").slice(0, 120) : null
}

function tokenCount(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : null
}

export class OpenAICompatibleMentorProvider implements MentorLLMProvider {
  readonly name = "openai-compatible"

  constructor(
    private readonly options: OpenAICompatibleOptions,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get model(): string {
    return this.options.model
  }

  /** Corpo do pedido (exportado para teste de contrato; não contém a chave). */
  buildBody(request: MentorLLMRequest): Record<string, unknown> {
    const reasoning = this.options.apiStyle === "reasoning"
    return {
      model: this.options.model,
      ...(reasoning ? { max_completion_tokens: request.maxOutputTokens } : { temperature: 0.2, max_tokens: request.maxOutputTokens }),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: request.system },
        { role: "user", content: request.user },
      ],
    }
  }

  async generate(request: MentorLLMRequest): Promise<MentorLLMGeneration> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), request.timeoutMs)
    const isAbort = (e: unknown) => (e as { name?: string })?.name === "AbortError" || controller.signal.aborted
    try {
      let response: Response
      try {
        response = await this.fetchImpl(`${this.options.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.options.apiKey}`,
          },
          body: JSON.stringify(this.buildBody(request)),
          signal: controller.signal,
          cache: "no-store",
        })
      } catch (e) {
        if (isAbort(e)) throw new MentorLLMError("TIMEOUT")
        throw new MentorLLMError("NETWORK")
      }

      let body: unknown = null
      try {
        body = await response.json()
      } catch (e) {
        if (isAbort(e)) throw new MentorLLMError("TIMEOUT")
        body = null
      }

      if (response.status === 429) throw new MentorLLMError("RATE_LIMITED", 429, providerErrorCode(body))
      if (response.status >= 500) throw new MentorLLMError("HTTP_5XX", response.status, providerErrorCode(body))
      if (response.status >= 400) throw new MentorLLMError("HTTP_4XX", response.status, providerErrorCode(body))

      const ok = body as {
        choices?: { message?: { content?: unknown }; finish_reason?: unknown }[]
        usage?: { prompt_tokens?: unknown; completion_tokens?: unknown }
      } | null
      const choice = ok?.choices?.[0]
      const finishReason = typeof choice?.finish_reason === "string" && SAFE_CODE.test(choice.finish_reason) ? choice.finish_reason : null
      const usage = ok?.usage
        ? { inputTokens: tokenCount(ok.usage.prompt_tokens), outputTokens: tokenCount(ok.usage.completion_tokens) }
        : null
      const content = choice?.message?.content
      if (typeof content !== "string" || content.trim() === "") {
        throw new MentorLLMError("EMPTY_RESPONSE", response.status, finishReason)
      }
      return { text: content, usage, finishReason }
    } finally {
      clearTimeout(timer)
    }
  }
}
