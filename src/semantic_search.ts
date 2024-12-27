import { TFile, App, Notice } from 'obsidian';
import { VectorStore } from './vector_storage';
import { shaForString } from './utils';
import { OpenAIClient } from './llm_client';

export const generateAndStoreEmbeddings = async ({
  files,
  app,
  vectorStore,
  llmClient,
  notify,
  maxConcurrency = 4,
}: {
  files: Array<TFile>,
  app: App,
  vectorStore: VectorStore,
  llmClient: OpenAIClient,
  notify: (numCompleted: number) => void,
  maxConcurrency?: number,
}): Promise<ConcurrencyManager<TFile>> => {
  console.info(`Generating embeddings for ${files.length} files...`);
  console.info(`Gating requests to maximum ${maxConcurrency} at a time`);

  const fileIndexRequest = async (file: TFile) => {
    const linktext = app.metadataCache.fileToLinktext(file, file.path)
    const path = file.path;
    const filteredLines = await app.vault.cachedRead(file);

    if (filteredLines.length === 0) {
      console.error("Error extracting text for [[" + linktext + "]]");
      return;
    }

    const sha = shaForString(filteredLines);
    if (vectorStore.vectorExists(sha) && !vectorStore.getVector(linktext)) {
      console.info("Vector already exists for [[" + linktext + "]], but was renamed. Fixing...");
      new Notice(`Vector already exists for [[${linktext}]], but was renamed. Fixing...`);
      vectorStore.renameVector({ sha, newLinktext: linktext });
      return;
    }

    if (vectorStore.vectorExists(sha) && vectorStore.getVector(linktext)) {
      // Vector already exists for note, and there are no changes so we don't need to do anything
      return;
    }

    console.info(`Generating embeddings for [${linktext}]...`);
    const embedding = await llmClient.generateOpenAiEmbeddings([filteredLines]);
    vectorStore.saveVector({ linktext, embedding, sha, path });
  };

  return new ConcurrencyManager(maxConcurrency, files, fileIndexRequest, notify);
};

export const allTags = function(text: string) {
  const tagRegex = /(#[^\s#\]\[؜]+)[\s$]/g;
  const matches = [...text.matchAll(tagRegex)];
  const tags = Array.from(matches, match => match[1]);
  return tags;
}

export class FileFilter {
  allTags(text: string) {
    const tagRegex = /(#[^\s#\]\[؜]+)[\s$]/g;
    const matches = [...text.matchAll(tagRegex)];
    const tags = Array.from(matches, match => match[1]);
    return tags;
  }
}

class ConcurrencyManager<T> {
  private activeRequests: number = 0;
  private maxConcurrentRequests: number;
  private queue: (() => Promise<void>)[] = [];
  private resolveDone: (() => void) | null = null;
  public allDone: Promise<void>;
  public numRequestsCompleted: number = 0;
  public notify: (numCompleted: number) => void;

  constructor(maxConcurrentRequests: number, collection: Array<T>, request: (item: T) => Promise<void>, notify?: (numCompleted: number) => void) {
    this.maxConcurrentRequests = maxConcurrentRequests;
    this.notify = notify ?? (() => {});  // Default no-op function
    this.allDone = new Promise<void>((resolve) => {
      this.resolveDone = resolve;
    });
    this.forEachConcurrently(collection, request);
  }

  forEachConcurrently(collection: Array<T>, request: (item: T) => Promise<void>): void {
    for (const item of collection) {
      this.add(() => request(item));
    }
  }

  async add(request: () => Promise<void>): Promise<void> {
    this.queue.push(request);
    this.next();
  }

  private next(): void {
    if (this.queue.length <= 0 || this.activeRequests >= this.maxConcurrentRequests) {
      return;
    }
    const nextRequest = this.queue.shift();
    if (nextRequest) {
      this.activeRequests += 1;
      nextRequest()
        .catch(error => {
          console.error('Request failed:', error);
        })
        .finally(() => {
          this.activeRequests -= 1;
          this.numRequestsCompleted += 1;
          this.notify(this.numRequestsCompleted);
          if (this.activeRequests === 0 && this.queue.length === 0 && this.resolveDone) {
            this.resolveDone();
            this.resolveDone = null;
            return;
          }
          this.next();
        });
    }
  }

  async done(): Promise<void> {
    await this.allDone;
  }
}
