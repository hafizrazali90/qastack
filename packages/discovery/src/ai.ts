import type { AiConfig } from '@qastack/core';

/**
 * Call an AI provider to generate a response from a prompt.
 * Supports Anthropic (Claude) and OpenAI (GPT) via optional peer dependencies.
 */
export async function callAi(
  config: AiConfig,
  prompt: string,
): Promise<string> {
  if (config.provider === 'anthropic') {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: config.apiKey });
    const response = await client.messages.create({
      model: config.model,
      max_tokens: 8192,
      messages: [{ role: 'user', content: prompt }],
    });
    const textBlock = response.content.find(
      (b: { type: string }) => b.type === 'text',
    );
    return (textBlock as { type: 'text'; text: string } | undefined)?.text ?? '';
  }

  if (config.provider === 'openai') {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey: config.apiKey });
    const response = await client.chat.completions.create({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 8192,
    });
    return response.choices[0]?.message?.content ?? '';
  }

  throw new Error(`Unsupported AI provider: ${config.provider}`);
}
