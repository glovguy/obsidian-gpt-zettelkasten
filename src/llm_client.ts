import { Configuration, OpenAIApi } from 'openai';

let openai: any;

interface OpenAIClientConfig {
  embeddings_model: EmbeddingModelNames;
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

export class OpenAIClient {
  openai: OpenAIApi;
  config: OpenAIClientConfig;

  constructor(apiKey: string, config?: OpenAIClientConfig) {
    this.config = config || { embeddings_model: defaultEmbeddingModel };
    const configuration = new Configuration({
      apiKey: apiKey,
    });
    this.openai = new OpenAIApi(configuration);
  }

  async generateOpenAiEmbeddings(docs: Array<string>) {
    const model = availableEmbeddingsModels[this.config.embeddings_model];
    let dimensions;
    if (model === availableEmbeddingsModels['v3_small']) {
      dimensions = 256;
    }
    const embeddings = await this.openai.createEmbedding({
      model,
      input: docs,
      dimensions
    });
    return embeddings.data.data.map((entry: any) => entry.embedding)[0];
  };
}
