import { Configuration, OpenAIApi } from 'openai';
import { SHA256, enc } from 'crypto-js';
import { VectorStore } from './vector_storage';


// rename to embeddings module? vector storage is doing the searching
// maybe vectorStore should initialize and delegate to this module?

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
  console.log(embeddings);
  return embeddings.data.data.map((entry: any) => entry.embedding)[0];
};

export const filterOutMetaData = (text: string) => {
  const bodyMarker = "## ";
  let currentDepth = 2;
  let recording = true;
  const lines = text.split('\n');
  const filteredLines = lines.filter((line) => {
    if (line.startsWith(bodyMarker)) {
      recording = true;
      return false;
    } else if (line.startsWith('#')) {
      const depth = line.split('#').length - 1;
      if (depth >= currentDepth) {
        recording = false;
        return false;
      }
    }
    return recording;
  });
  return filteredLines.join('\n');
};

export const generateAndStoreEmbeddings = async ({ vectorStore, docs, linktext, path }: { vectorStore: VectorStore, docs: Array<string>, linktext: string, path: string }) => {
  docs.forEach(async (text: string) => {
    const filteredLines = filterOutMetaData(text);
    if (filteredLines.length === 0) {
      console.error("Error extracting text for [[" + linktext + "]]");
      return;
    }
    const sha = enc.Base64.stringify(SHA256(filteredLines));
    console.log("vectorStore: ", vectorStore)

    if (vectorStore.vectorExists(sha)) {
      console.error("Vector already exists for [[" + linktext + "]]");
      return;
    }
    
    const embedding = await generateOpenAiEmbeddings([filteredLines]);
    vectorStore.saveVector({ linktext, embedding, sha, path });
  });
};

// export const findTopMatches = ({ vectorStore, linktext }: { vectorStore: VectorStore, linktext: string}) => {
//   const storedVector = vectorStore.getVector(linktext);
//   if (!storedVector) {
//     throw new Error("Vector not found");
//   }
//   return vectorStore.vectorSearch(storedVector);
// };

// const chatCompletion = await openai.createChatCompletion({
//   model: "gpt-3.5-turbo",
//   messages: [{role: "user", content: "Hello world"}],
// });
// console.log(chatCompletion.data.choices[0].message);
