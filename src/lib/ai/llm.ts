/**
 * Server-side AI client.
 *
 * Configuration is read from environment variables and never leaves the server:
 *   WAYFINDER_AI_API_KEY   — credential for an OpenAI-compatible endpoint
 *   WAYFINDER_AI_BASE_URL  — endpoint base, e.g. https://api.openai.com/v1
 *   WAYFINDER_AI_MODEL     — model identifier
 *
 * The key is deliberately NOT a NEXT_PUBLIC_ variable, so it can never be
 * bundled into client JavaScript. When configuration is absent the caller falls
 * back to deterministic guidance rather than failing.
 */

import "server-only";

import { HttpError } from "@/lib/core/http";

export interface AiConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/** Returns the AI configuration, or undefined when the deployment has none. */
export function getAiConfig(): AiConfig | undefined {
  const apiKey = process.env.WAYFINDER_AI_API_KEY?.trim();
  if (!apiKey) return undefined;

  const baseUrl = (
    process.env.WAYFINDER_AI_BASE_URL?.trim() || "https://api.openai.com/v1"
  ).replace(/\/+$/, "");
  const model = process.env.WAYFINDER_AI_MODEL?.trim() || "gpt-4o-mini";

  return { apiKey, baseUrl, model };
}

export function isAiConfigured(): boolean {
  return getAiConfig() !== undefined;
}

export interface AiMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiCallOptions {
  messages: AiMessage[];
  /** Ask the endpoint for a JSON object response where supported. */
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

/**
 * Calls an OpenAI-compatible chat completion endpoint and returns the raw text
 * content. Any failure surfaces as `AiUnavailableError` so callers can fall back
 * deterministically instead of showing a broken page.
 */
export async function callAi(options: AiCallOptions): Promise<string> {
  const config = getAiConfig();
  if (!config) throw new AiUnavailableError("No AI provider is configured.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 25_000);

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: options.messages,
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens ?? 1_400,
        ...(options.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      // Never echo the upstream body: it can contain credential hints.
      throw new AiUnavailableError(
        `AI provider returned HTTP ${response.status}`,
      );
    }

    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) throw new AiUnavailableError("AI provider returned an empty response.");
    return content;
  } catch (error) {
    if (error instanceof AiUnavailableError) throw error;
    if (error instanceof HttpError) {
      throw new AiUnavailableError("AI provider could not be reached.");
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiUnavailableError("AI provider did not respond in time.");
    }
    throw new AiUnavailableError("AI provider call failed.");
  } finally {
    clearTimeout(timer);
  }
}
