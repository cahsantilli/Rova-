import Anthropic from "@anthropic-ai/sdk";

/** Anything that can turn a system prompt + user message into text. Swappable for tests or other providers. */
export interface LlmProvider {
  complete(input: { system: string; user: string }): Promise<string>;
}

export class LlmError extends Error {
  constructor(message: string, readonly userMessage: string) {
    super(message);
  }
}

export const MODEL = process.env.ROVA_MODEL ?? "claude-opus-5-5";

export function anthropicProvider(apiKey: string): LlmProvider {
  const client = new Anthropic({ apiKey });
  return {
    async complete({ system, user }) {
      try {
        const response = await client.beta.messages.create({
          model: MODEL,
          max_tokens: 16000,
          // Short, factual answers about a small table: low effort is enough.
          output_config: { effort: "low" },
          // Server-side fallback if the primary model declines.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system,
          messages: [{ role: "user", content: user }],
        });
        if (response.stop_reason === "refusal") {
          throw new LlmError("model refusal", "Rova can't answer that question about your data.");
        }
        const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
        if (!text) throw new LlmError("empty response", "Rova didn't produce an answer. Please try again.");
        return text;
      } catch (error) {
        if (error instanceof LlmError) throw error;
        if (error instanceof Anthropic.AuthenticationError) {
          throw new LlmError("auth", "The AI service isn't configured correctly on the server.");
        } else if (error instanceof Anthropic.RateLimitError) {
          throw new LlmError("rate limit", "Rova is busy right now. Please try again in a moment.");
        } else if (error instanceof Anthropic.APIError) {
          throw new LlmError(`api ${error.status}: ${error.message}`, "Rova couldn't answer right now. Please try again.");
        }
        throw new LlmError(String(error), "Rova couldn't answer right now. Please try again.");
      }
    },
  };
}
