import { TFile } from 'obsidian';
import ZettelkastenLLMToolsPlugin from 'main';
import { shaForString } from './utils';
import { filterMetaData } from './semantic_search';

export interface StoredVector {
  linktext: string;
  path: string;
  embedding: Array<number>;
  sha: string;
}

export interface VectorSearchResult {
  storedVector: StoredVector;
  similarity: number;
  content?: string;
  tags?: string[];
};

export type LocalVectorDict = Map<string, StoredVector>;

export class VectorStore {
  plugin: ZettelkastenLLMToolsPlugin;
  vectors: LocalVectorDict;
  vectorShas: Set<string>;
  embeddingsModelVersion: string;

  constructor(plugin: ZettelkastenLLMToolsPlugin) {
    this.plugin = plugin;
    const { settings } = plugin;
    this.vectors = new Map(settings.vectors.map((vector: StoredVector) => [vector.linktext, vector]));
    this.vectorShas = new Set(settings.vectors.map((vector: StoredVector) => vector.sha));
    settings.embeddingsModelVersion
    console.info("VectorStore inialized", this.vectors, this.vectorShas)
  }

  numVectors(): number {
    return this.vectors.size;
  }

  saveVector(vector: StoredVector) {
    this.vectors.set(vector.linktext, vector);
    this.vectorShas.add(vector.sha);
    this.plugin.settings.vectors.push(vector);
    this.plugin.saveSettings();
  }

  getVector(linktext: string): StoredVector | null {
    return this.vectors.get(linktext) || null;
  }

  vectorExists(sha: string): boolean {
    return this.vectorShas.has(sha);
  }

  cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((prev, curr, i) => prev + curr * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((prev, curr) => prev + Math.pow(curr, 2), 0));
    const magnitudeB = Math.sqrt(b.reduce((prev, curr) => prev + Math.pow(curr, 2), 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  vectorSearch(queryEmbedding: StoredVector | Array<number>): VectorSearchResult[] {
    const results: VectorSearchResult[] = [];

    const searchEmbedding = (Array.isArray(queryEmbedding)) ? queryEmbedding : queryEmbedding.embedding;
    const searchSha = (Array.isArray(queryEmbedding)) ? null : queryEmbedding.sha;
    this.vectors.forEach((storedVector) => {
      if (searchSha === storedVector.sha) { return; }
      const cosineSim = this.cosineSimilarity(searchEmbedding, storedVector.embedding);
      results.push({ storedVector, similarity: cosineSim });
    });

    return results.sort((a, b) => b.similarity - a.similarity);
    // be sure to slice the results to the top n results
    // .slice(0, n);
  }

  async upsertVector(file: TFile): Promise<StoredVector> {
    const { linktext } = this.plugin.linkTextForFile(file);
    const { llmClient } = this.plugin;
    const filteredLines = filterMetaData(this.plugin.settings.contentMarker, await this.plugin.app.vault.cachedRead(file));
    if (filteredLines.length === 0) {
      throw new Error("Error extracting text for [[" + linktext + "]]");
    }
    const sha = shaForString(filteredLines);
    const storedVector = this.getVector(linktext);
    if (storedVector && storedVector.sha === sha) {
      return storedVector;
    }
    if (storedVector && storedVector.sha !== sha) {
      console.info(`Vector already exists for [[${linktext}]], but it was edited. Fixing...`);
      this.deleteVectorBySha(storedVector.sha);
    } else if (this.vectorExists(sha)) {
      console.info(`Vector already exists for [[${linktext}]], but was renamed. Fixing...`);
      this.renameVector({ sha, newLinktext: linktext });
    }
    const embedding = await llmClient.generateOpenAiEmbeddings([filteredLines]);
    const vector = { linktext, embedding, sha, path: file.path };
    this.saveVector(vector);

    return vector;
  }

  deleteVectorBySha(sha: string) {
    this.vectorShas.delete(sha);
    for (let i = 0; i < this.plugin.settings.vectors.length; i++) {
      if (this.plugin.settings.vectors[i].sha === sha) {
        this.vectors.delete(this.plugin.settings.vectors[i].linktext);
        this.plugin.settings.vectors.splice(i, 1);
        this.plugin.saveSettings();
        return;
      }
    }
  }

  findVectorBySha(sha: string): StoredVector | null {
    return this.findVectorByFn((storedVector: StoredVector) => storedVector.sha === sha) || null;
  }

  findVectorByFn(fn: (storedVector: StoredVector) => boolean): StoredVector | null {
    return this.plugin.settings.vectors.find(fn) || null;
  }

  renameVector({ sha, newLinktext }: { sha: string, newLinktext: string }) {
    for (let i = 0; i < this.plugin.settings.vectors.length; i++) {
      if (this.plugin.settings.vectors[i].sha === sha) {
        this.plugin.settings.vectors[i].linktext = newLinktext;
        this.plugin.saveSettings();
        return;
      }
    }
    throw new Error("Vector not found");
  }
}
