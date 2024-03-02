import { Configuration, OpenAIApi } from 'openai';

let openai: any;

export const initOpenAI = (apiKey: string) => {
  const configuration = new Configuration({
    apiKey: apiKey,
  });
  openai = new OpenAIApi(configuration);
  console.log("OpenAI initialized");
};

export const generateOpenAiEmbeddings = async (docs: Array<string>) => {
  if (!openai) {
    throw new Error("OpenAI not initialized");
  }
  const embeddings = await openai.createEmbedding({
    input: docs,
    model: "text-embedding-ada-002",
  });
  return embeddings.data.data.map((entry: any) => entry.embedding)[0];
};
