import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { MessageParam } from '@anthropic-ai/sdk/resources';
import type { ChatCompletionMessageParam } from 'openai/resources';

type OpenAIChatMessage = ChatCompletionMessageParam;
type AnthropicChatMessage = MessageParam;

export interface OpenAIClientConfig {
  embeddings_model: EmbeddingModelNames;
  quantization_decimals: number;
}

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
}

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

export const CLAUDE_3_5_SONNET = 'claude-3-5-sonnet-latest';
export const CLAUDE_3_5_HAIKU = 'claude-3-5-haiku-latest';

export class AnthropicClient {
  anthropic: Anthropic;
  defaultModel = CLAUDE_3_5_SONNET;

  constructor(apiKey: string) {
    this.anthropic = new Anthropic({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true, // for obsidian, all API keys are provided by the user
    });
  }

  async createMessage(system_prompt: string, msgs: ChatMessage[], modelName?: string) {
    const model = modelName || this.defaultModel;
    const msg = await this.anthropic.messages.create({
      model: model,
      max_tokens: 1024,
      messages: msgs.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      } as AnthropicChatMessage)),
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

    // Convert messages to OpenAI format
    const formattedMessages: OpenAIChatMessage[] = [
      { role: 'system', content: system_prompt },
      ...msgs.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      } as OpenAIChatMessage))
    ];

    const response = await this.openai.chat.completions.create({
      model: model,
      messages: formattedMessages,
      max_tokens: 1024,
    });

    return response.choices[0].message.content || '';
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
export type ChatModelNames =
  | typeof OPENAI_GPT4o
  | typeof OPENAI_GPT4o_MINI
  | typeof OPENAI_GPT35
  | typeof CLAUDE_3_5_SONNET
  | typeof CLAUDE_3_5_HAIKU;

export interface ChatModel {
  provider: typeof OPENAI_PROVIDER | typeof ANTHROPIC_PROVIDER;
  name: ChatModelNames;
  displayName: string;
  available: boolean;
}

export function availableChatModels(openAIKey: string, anthropicKey: string): ChatModel[] {
  return [
    {
      provider: OPENAI_PROVIDER,
      name: OPENAI_GPT4o,
      displayName: 'GPT-4o',
      available: !!openAIKey,
    },
    {
      provider: OPENAI_PROVIDER,
      name: OPENAI_GPT4o_MINI,
      displayName: 'GPT-4o Mini',
      available: !!openAIKey,
    },
    {
      provider: OPENAI_PROVIDER,
      name: OPENAI_GPT35,
      displayName: 'GPT-3.5 Turbo',
      available: !!openAIKey,
    },
    {
      provider: ANTHROPIC_PROVIDER,
      name: CLAUDE_3_5_SONNET,
      displayName: 'Claude 3.5 Sonnet',
      available: !!anthropicKey,
    },
    {
      provider: ANTHROPIC_PROVIDER,
      name: CLAUDE_3_5_HAIKU,
      displayName: 'Claude 3.5 Haiku',
      available: !!anthropicKey,
    },
  ];
}
