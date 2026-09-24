import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { MessageParam } from '@anthropic-ai/sdk/resources';
import type { ResponseInput } from 'openai/resources/responses/responses';

type AnthropicChatMessage = MessageParam;

export interface OpenAIClientConfig {
  embeddings_model: EmbeddingModelNames;
  quantization_decimals: number;
};

export const OPENAI_PROVIDER = 'openai';
export const ANTHROPIC_PROVIDER = 'anthropic';

export type EmbeddingsProvider = typeof OPENAI_PROVIDER;

export const OPENAI_EMBEDDING_3_SMALL = 'text-embedding-3-small';
export const OPENAI_EMBEDDING_3_LARGE = 'text-embedding-3-large';
export type EmbeddingModelNames = typeof OPENAI_EMBEDDING_3_SMALL | typeof OPENAI_EMBEDDING_3_LARGE;

interface EmbeddingModel {
  provider: EmbeddingsProvider;
  name: EmbeddingModelNames;
  displayName: string;
  available: boolean;
};

export function availableEmbeddingModels(openAIKey: string): EmbeddingModel[] {
  return [
    {
      provider: OPENAI_PROVIDER,
      name: OPENAI_EMBEDDING_3_SMALL,
      displayName: 'OpenAI: text-embedding-3-small',
      available: !!openAIKey,
    },
    {
      provider: OPENAI_PROVIDER,
      name: OPENAI_EMBEDDING_3_LARGE,
      displayName: 'OpenAI: text-embedding-3-large',
      available: !!openAIKey,
    },
  ];
};

export const unlabelledEmbeddingModel = OPENAI_EMBEDDING_3_SMALL;
export const quantizationDecimals = 3;

const defaultOpenAIConfig: OpenAIClientConfig = {
  embeddings_model: OPENAI_EMBEDDING_3_SMALL,
  quantization_decimals: quantizationDecimals,
};

export const CLAUDE_OPUS_5 = 'claude-opus-5';
export const CLAUDE_SONNET_5 = 'claude-sonnet-5';
export const CLAUDE_HAIKU_4_5 = 'claude-haiku-4-5';

export class AnthropicClient {
  anthropic: Anthropic;
  defaultModel = CLAUDE_HAIKU_4_5;

  constructor(apiKey: string) {
    this.anthropic = new Anthropic({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true, // for obsidian, all API keys are provided by the user
    });
  }

  async createMessage(system_prompt: string, msgs: ChatMessage[], modelName?: string) {
    const model = modelName || this.defaultModel;
    let formattedMessages: AnthropicChatMessage[];
    formattedMessages = msgs.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content
    }));
    const msg = await this.anthropic.messages.create({
      model: model,
      max_tokens: 1024,
      messages: formattedMessages,
      system: system_prompt,
    });
    return msg;
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class OpenAIClient {
  openai: OpenAI;
  config: OpenAIClientConfig;

  constructor(apiKey: string, config?: OpenAIClientConfig) {
    this.config = { ...defaultOpenAIConfig, ...config };
    this.openai = new OpenAI({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true, // for obsidian, all API keys are provided by the user
    });
  }

  async createMessage(system_prompt: string, msgs: ChatMessage[], modelName?: string) {
    const model = modelName || OPENAI_GPT4o_MINI;

    // The Responses API takes the system prompt as `instructions` and the conversation
    // as input items, so each turn keeps its own role.
    const input: ResponseInput = msgs.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));

    // max_output_tokens is deliberately unset: the cap that would suit gpt-4o-mini is
    // below what a reasoning model spends before it emits any text, and the ceiling
    // differs per model (gpt-3.5-turbo caps at 4k). Copilot replies are short anyway.
    const response = await this.openai.responses.create({
      model: model,
      instructions: system_prompt,
      input,
    });

    if (response.status === 'incomplete') {
      const reason = response.incomplete_details?.reason ?? 'unknown reason';
      if (response.output_text) {
        return `${response.output_text}\n\n[Response was cut off: ${reason}]`;
      }
      throw new Error(`OpenAI returned an incomplete response (${reason}) with no text.`);
    }

    return response.output_text;
  }

  async generateOpenAiEmbeddings(docs: Array<string>) {
    const model = this.config.embeddings_model;
    let dimensions;
    if (model === OPENAI_EMBEDDING_3_SMALL) {
      dimensions = 256;
    }
    const embeddings = await this.openai.embeddings.create({
      model,
      input: docs,
      dimensions
    });
    return embeddings.data.map((entry: any) =>
      entry.embedding.map((value: number) =>
        Number(value.toFixed(this.config.quantization_decimals))
      )
    )[0];
  };
}

export async function generateEmbeddings(
  text: string,
  modelName: EmbeddingModelNames,
  openaiClient?: OpenAIClient,
): Promise<number[]> {
  if (!text) {
    throw new Error('No text provided for embedding generation');
  }

  switch (modelName) {
    case OPENAI_EMBEDDING_3_SMALL:
    case OPENAI_EMBEDDING_3_LARGE:
      if (!openaiClient) throw new Error('OpenAI client not initialized');
      return await openaiClient.generateOpenAiEmbeddings([text]);
    default:
      throw new Error(`Unknown embedding model: ${modelName}`);
  }
}

export const OPENAI_GPT4o = 'gpt-4o';
export const OPENAI_GPT4o_MINI = 'gpt-4o-mini';
export const OPENAI_GPT35 = 'gpt-3.5-turbo';

// Model ids are plain strings rather than a closed union: both providers add models
// far more often than this plugin ships, and the dropdown is populated from their
// /models endpoints at runtime. The constants above and the hardcoded lists below
// exist only as a fallback for when those endpoints can't be reached.
export type ChatModelNames = string;

export interface ChatModel {
  provider: typeof OPENAI_PROVIDER | typeof ANTHROPIC_PROVIDER;
  name: ChatModelNames;
  displayName: string;
  available: boolean;
}

function openAIFallbackModels(openAIKey: string): ChatModel[] {
  return [
    {
      provider: OPENAI_PROVIDER,
      name: OPENAI_GPT4o,
      displayName: 'OpenAI: GPT-4o',
      available: !!openAIKey,
    },
    {
      provider: OPENAI_PROVIDER,
      name: OPENAI_GPT4o_MINI,
      displayName: 'OpenAI: GPT-4o Mini',
      available: !!openAIKey,
    },
    {
      provider: OPENAI_PROVIDER,
      name: OPENAI_GPT35,
      displayName: 'OpenAI: GPT-3.5 Turbo',
      available: !!openAIKey,
    },
  ];
}

function anthropicFallbackModels(anthropicKey: string): ChatModel[] {
  return [
    {
      provider: ANTHROPIC_PROVIDER,
      name: CLAUDE_OPUS_5,
      displayName: 'Anthropic: Claude Opus 5',
      available: !!anthropicKey,
    },
    {
      provider: ANTHROPIC_PROVIDER,
      name: CLAUDE_SONNET_5,
      displayName: 'Anthropic: Claude Sonnet 5',
      available: !!anthropicKey,
    },
    {
      provider: ANTHROPIC_PROVIDER,
      name: CLAUDE_HAIKU_4_5,
      displayName: 'Anthropic: Claude Haiku 4.5',
      available: !!anthropicKey,
    },
  ];
}

// Synchronous fallback list, used when a provider's /models endpoint is unreachable
// (offline, proxy, revoked key). Prefer fetchAvailableChatModels.
export function availableChatModels(openAIKey: string, anthropicKey: string): ChatModel[] {
  return [
    ...openAIFallbackModels(openAIKey),
    ...anthropicFallbackModels(anthropicKey),
  ];
}

// OpenAI's /models lists everything the key can touch, including embeddings, audio
// and moderation endpoints. Keep the families that can serve a chat completion.
const OPENAI_CHAT_MODEL_PREFIXES = ['gpt-', 'ft:gpt-', 'o1', 'o3', 'o4', 'chatgpt-'];
const OPENAI_NON_CHAT_MARKERS = [
  'instruct', 'realtime', 'audio', 'transcribe', 'tts', 'whisper',
  'embedding', 'moderation', 'dall-e', 'image', 'search', 'computer-use',
];

function isOpenAIChatModel(modelId: string): boolean {
  if (!modelId) { return false; }
  const matchesPrefix = OPENAI_CHAT_MODEL_PREFIXES.some(prefix => modelId.startsWith(prefix));
  const matchesNonChat = OPENAI_NON_CHAT_MARKERS.some(marker => modelId.includes(marker));
  return matchesPrefix && !matchesNonChat;
}

async function fetchOpenAIModels(openAIKey: string): Promise<ChatModel[]> {
  if (!openAIKey) { return []; }

  const openai = new OpenAI({
    apiKey: openAIKey,
    dangerouslyAllowBrowser: true, // for obsidian, all API keys are provided by the user
  });

  const response = await openai.models.list();
  return (response.data || [])
    .filter(model => isOpenAIChatModel(model.id))
    .sort((a, b) => (b.created || 0) - (a.created || 0))
    .map(model => ({
      provider: OPENAI_PROVIDER,
      name: model.id,
      displayName: `OpenAI: ${model.id}`,
      available: true,
    }));
}

async function fetchAnthropicModels(anthropicKey: string): Promise<ChatModel[]> {
  if (!anthropicKey) { return []; }

  const anthropic = new Anthropic({
    apiKey: anthropicKey,
    dangerouslyAllowBrowser: true, // for obsidian, all API keys are provided by the user
  });

  // Returned newest-first; every model the Messages API lists can chat.
  const response = await anthropic.models.list({ limit: 100 });
  return response.data.map(model => ({
    provider: ANTHROPIC_PROVIDER,
    name: model.id,
    displayName: `Anthropic: ${model.display_name || model.id}`,
    available: true,
  }));
}

// Asks each provider which models the user's key can actually reach, so the dropdown
// keeps up with new releases without a plugin update. A provider that errors falls
// back to its hardcoded list rather than dropping out of the dropdown entirely.
export async function fetchAvailableChatModels(
  openAIKey: string,
  anthropicKey: string
): Promise<ChatModel[]> {
  const [openAIModels, anthropicModels] = await Promise.all([
    fetchOpenAIModels(openAIKey).catch(error => {
      console.error('Could not list OpenAI models, falling back to built-in list:', error);
      return openAIFallbackModels(openAIKey);
    }),
    fetchAnthropicModels(anthropicKey).catch(error => {
      console.error('Could not list Anthropic models, falling back to built-in list:', error);
      return anthropicFallbackModels(anthropicKey);
    }),
  ]);

  return [...openAIModels, ...anthropicModels];
}

// The dropdown offers models from both providers, so the send path has to dispatch on
// the model's provider. Matching on the id prefix silently sent o-series and fine-tuned
// OpenAI models to the Anthropic client.
export function providerForModel(modelName: string, models: ChatModel[]): typeof OPENAI_PROVIDER | typeof ANTHROPIC_PROVIDER {
  const known = models.find(model => model.name === modelName);
  if (known) { return known.provider; }
  return isOpenAIChatModel(modelName) ? OPENAI_PROVIDER : ANTHROPIC_PROVIDER;
}
