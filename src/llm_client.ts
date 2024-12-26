import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { MessageParam } from '@anthropic-ai/sdk/resources';

interface OpenAIClientConfig {
  embeddings_model: EmbeddingModelNames;
  quantization_decimals: number;
}

// interface EmbeddingsModels {
//   v2: string;
//   v3_small: string;
// }
// export const availableEmbeddingsModels: EmbeddingsModels = {
//   "v2": "text-embedding-ada-002",
//   "v3_small": "text-embedding-3-small"
// };
// export type EmbeddingModelNames = keyof typeof availableEmbeddingsModels;
// export const defaultEmbeddingModel = "v3_small"; // default for new vector stores
// export const unlabelledEmbeddingModel = "v2"; // version used if vector store existed prior to label
export const OPENAI_PROVIDER = 'openai';
export const ANTHROPIC_PROVIDER = 'anthropic';

export type EmbeddingsProvider = typeof OPENAI_PROVIDER | typeof ANTHROPIC_PROVIDER;

export const OPENAI_EMBEDDING_3_SMALL = 'text-embedding-3-small';
export const OPENAI_EMBEDDING_3_LARGE = 'text-embedding-3-large';
export const ANTHROPIC_CLAUDE_3_HAIKU = 'claude-3-haiku';
export type EmbeddingModelNames = typeof OPENAI_EMBEDDING_3_SMALL | typeof OPENAI_EMBEDDING_3_LARGE | typeof ANTHROPIC_CLAUDE_3_HAIKU;

interface EmbeddingModel {
  provider: EmbeddingsProvider;
  name: EmbeddingModelNames;
  displayName: string;
  available: boolean;
}

export function availableEmbeddingModels(openAIKey: string, anthropicKey: string): EmbeddingModel[] {
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
    {
      provider: ANTHROPIC_PROVIDER,
      name: ANTHROPIC_CLAUDE_3_HAIKU,
      displayName: 'Anthropic: claude-3-haiku',
      available: !!anthropicKey,
    },
  ];
}

export const unlabelledEmbeddingModel = OPENAI_EMBEDDING_3_SMALL;
export const quantizationDecimals = 3;

const defaultOpenAIConfig = (): OpenAIClientConfig => ({
  embeddings_model: OPENAI_EMBEDDING_3_SMALL,
  quantization_decimals: quantizationDecimals,
});

const modelNameLookup: { [name: string]: string } = {
  "sonnet": "claude-3-5-sonnet-20241022",
  "haiku": "claude-3-haiku-20240307",
};

export class AnthropicClient {
  anthropic: Anthropic;
  defaultModel = "sonnet"

  constructor(apiKey: string) {
    this.anthropic = new Anthropic({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true, // for obsidian, all API keys are provided by the user
    });
  }

  async createMessage(system_prompt: string, msgs: MessageParam[], modelName?: string) {
    const model = modelNameLookup[modelName || this.defaultModel];
    const msg = await this.anthropic.messages.create({
      model: model,
      max_tokens: 1024,
      messages: msgs,
      system: system_prompt,
    });
    return msg;
  }
}

export class OpenAIClient {
  openai: OpenAI;
  config: OpenAIClientConfig;

  constructor(apiKey: string, config?: OpenAIClientConfig) {
    this.config = config || defaultOpenAIConfig();
    this.openai = new OpenAI({
      apiKey: apiKey,
      dangerouslyAllowBrowser: true, // for obsidian, all API keys are provided by the user
    });
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
