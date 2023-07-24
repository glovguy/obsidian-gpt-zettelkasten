import { TFile, App, Notice } from 'obsidian';
import { Configuration, OpenAIApi } from 'openai';

import { VectorStore } from './vector_storage';
import { shaForString } from './utils';

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

export const generateAndStoreEmbeddings = async ({ files, app, vectorStore }: { files: Array<TFile>, app: App, vectorStore: VectorStore }): Promise<any> => {
  console.log(`Generating embeddings for ${files.length} files...`);
  return Promise.all(files.map(async (file: TFile) => {
    const linktext = app.metadataCache.fileToLinktext(file, file.path)
    const path = file.path;
    const filteredLines = filterOutMetaData(await app.vault.cachedRead(file));
    if (filteredLines.length === 0) {
      console.error("Error extracting text for [[" + linktext + "]]");
      return;
    }
    const sha = shaForString(filteredLines);
    if (vectorStore.vectorExists(sha) && !vectorStore.getVector(linktext)) {
      // console.error("Vector already exists for [[" + linktext + "]], but was renamed. Fixing...");
      new Notice(`Vector already exists for [[${linktext}]], but was renamed. Fixing...`);
      vectorStore.renameVector({ sha, newLinktext: linktext });
      return;
    }
    if (vectorStore.vectorExists(sha) && vectorStore.getVector(linktext)) {
      console.error("Vector already exists for [[" + linktext + "]]");
      return;
    }
    
    const embedding = await generateOpenAiEmbeddings([filteredLines]);
    vectorStore.saveVector({ linktext, embedding, sha, path });
  }));
};

export const shaForFile = async (file: TFile): Promise<string> => {
  const filteredLines = filterOutMetaData(await app.vault.cachedRead(file));
  return shaForString(filteredLines);
};

// const chatCompletion = await openai.createChatCompletion({
//   model: "gpt-3.5-turbo",
//   messages: [{role: "user", content: "Hello world"}],
// });
// console.log(chatCompletion.data.choices[0].message);
