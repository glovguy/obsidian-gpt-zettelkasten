import { TFile, App, Notice } from 'obsidian';
import { VectorStore } from './vector_storage';
import { shaForString } from './utils';
import { generateOpenAiEmbeddings } from './llm_client';

export const generateAndStoreEmbeddings = async ({ files, app, vectorStore, fileFilter }: { files: Array<TFile>, app: App, vectorStore: VectorStore, fileFilter: FileFilter }): Promise<any> => {
  console.log(`Generating embeddings for ${files.length} files...`);
  return Promise.all(files.map(async (file: TFile) => {
    const linktext = app.metadataCache.fileToLinktext(file, file.path)
    const path = file.path;
    const filteredLines = fileFilter.filterOutMetaData(await app.vault.cachedRead(file));
    if (filteredLines.length === 0) {
      console.error("Error extracting text for [[" + linktext + "]]");
      return;
    }
    const sha = shaForString(filteredLines);
    if (vectorStore.vectorExists(sha) && !vectorStore.getVector(linktext)) {
      console.error("Vector already exists for [[" + linktext + "]], but was renamed. Fixing...");
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

export class FileFilter {
  contentMarker: string | null;

  constructor() {
    this.contentMarker = null;
  }

  setContentMarker(contentMarker: string) {
    this.contentMarker = contentMarker;
  }

  filterOutMetaData(text: string) {
    let currentDepth = this.contentMarker ? this.contentMarker.split('#').length-1 : 0;
    let recording = true;
    const lines = text.split('\n');
    const filteredLines = lines.filter((line) => {
      if (this.contentMarker && line === this.contentMarker) {
        recording = true;
        return false;
      } else if (line.startsWith('#') && line.contains('# ')) {
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
}
