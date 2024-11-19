import { TFile, App, Notice } from 'obsidian';
import { VectorStore } from './vector_storage';
import { shaForString } from './utils';
import { OpenAIClient } from './llm_client';

export const generateAndStoreEmbeddings = async ({
  files,
  app,
  vectorStore,
  llmClient
}: {
  files: Array<TFile>,
  app: App,
  vectorStore: VectorStore,
  llmClient: OpenAIClient
}): Promise<any> => {
  console.log(`Generating embeddings for ${files.length} files...`);
  const maxConcurrency = 2;
  console.log(`Gating requests to maximum ${maxConcurrency} at a time`);
  const concurrencyManager = new ConcurrencyManager(maxConcurrency);
  files.forEach(async (file: TFile) => {
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
      // Vector already exists
      return;
    }
    await concurrencyManager.add(async () => {
      const embedding = await llmClient.generateOpenAiEmbeddings([filteredLines]);
      vectorStore.saveVector({ linktext, embedding, sha, path });
    });
  });
  return concurrencyManager.done;
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
  private concurrentRequests: number = 0;
  private queue: (() => Promise<T>)[] = [];
  private resolveDone: (() => void) | null = null;
  public allDone: Promise<void>;

  constructor(private maxConcurrentRequests: number) {
    this.maxConcurrentRequests = maxConcurrentRequests;
    this.allDone = new Promise<void>((resolve) => {
      this.resolveDone = resolve;
    });
  }

  async add(request: () => Promise<T>): Promise<void> {
    if (this.concurrentRequests >= this.maxConcurrentRequests) {
      this.queue.push(async () => await request());
      return;
    }
    this.concurrentRequests += 1;
    try {
      await request();
    } finally {
      this.concurrentRequests -= 1;
      this.checkDone();
      this.next();
    }
  }

  private next(): void {
    if (this.queue.length <= 0 || this.concurrentRequests >= this.maxConcurrentRequests) {
      return;
    }
    const nextRequest = this.queue.shift();
    if (nextRequest) {
      this.concurrentRequests += 1;
      nextRequest().finally(() => {
        this.concurrentRequests -= 1;
        this.checkDone();
        this.next();
      });
    }
  }

  private checkDone() {
    if (this.concurrentRequests === 0 && this.queue.length === 0 && this.resolveDone) {
      this.resolveDone();
      this.resolveDone = null; // Reset resolveDone to prevent multiple calls
    }
  }

  get done(): Promise<void> {
    return this.allDone;
  }
}
