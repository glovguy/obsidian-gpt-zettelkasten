import OpenAI from 'openai';

let openai: any;

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
export const quantizationDecimals = 2;

const defaultConfig = (): OpenAIClientConfig => ({
  embeddings_model: defaultEmbeddingModel,
  quantization_decimals: quantizationDecimals,
});

export class OpenAIClient {
  openai: OpenAI;
  config: OpenAIClientConfig;

  constructor(apiKey: string, config?: OpenAIClientConfig) {
    this.config = config || defaultConfig();
    this.openai = new OpenAI({
      apiKey: apiKey,
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
