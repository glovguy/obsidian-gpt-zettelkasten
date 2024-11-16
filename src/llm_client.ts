import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { MessageParam } from '@anthropic-ai/sdk/resources';

interface OpenAIClientConfig {
  embeddings_model: EmbeddingModelNames;
  quantization_decimals: number;
}

interface EmbeddingsModels {
  v2: string;
  v3_small: string;
}
export const availableEmbeddingsModels: EmbeddingsModels = {
  "v2": "text-embedding-ada-002",
  "v3_small": "text-embedding-3-small"
};
export type EmbeddingModelNames = keyof typeof availableEmbeddingsModels;
export const defaultEmbeddingModel = "v3_small"; // default for new vector stores
export const unlabelledEmbeddingModel = "v2"; // version used if vector store existed prior to label
export const quantizationDecimals = 3;

const defaultOpenAIConfig = (): OpenAIClientConfig => ({
  embeddings_model: defaultEmbeddingModel,
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
    const model = availableEmbeddingsModels[this.config.embeddings_model];
    let dimensions;
    if (model === availableEmbeddingsModels['v3_small']) {
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
