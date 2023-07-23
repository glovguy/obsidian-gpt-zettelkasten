import MyPlugin from 'main';


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
};

export type LocalVectorDict = Map<string, StoredVector>;

export class VectorStore {
  plugin: MyPlugin;
  vectors: LocalVectorDict;
  vectorShas: Set<string>;

  constructor(plugin: MyPlugin) {
    this.plugin = plugin;
    this.vectors = new Map(plugin.settings.vectors.map((vector: StoredVector) => [vector.linktext, vector]));
    this.vectorShas = new Set(plugin.settings.vectors.map((vector: StoredVector) => vector.sha));
    console.log(this.vectors, this.vectorShas)
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

  vectorSearch(queryEmbedding: StoredVector, n: number = 1): VectorSearchResult[] {
    const results: VectorSearchResult[] = [];

    this.vectors.forEach((storedVector) => {
      if (queryEmbedding.sha === storedVector.sha) { return; }
      const cosineSim = this.cosineSimilarity(queryEmbedding.embedding, storedVector.embedding);
      results.push({ storedVector, similarity: cosineSim });
    });

    return results.sort((a, b) => b.similarity - a.similarity).slice(0, n);
  }

  findTopMatches(linktext: string, n: number = 1): VectorSearchResult[] {
    const storedVector = this.getVector(linktext);
    if (!storedVector) {
      throw new Error("Vector not found");
    }
    return this.vectorSearch(storedVector, n);
  };
}
