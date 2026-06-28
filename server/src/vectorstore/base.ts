export interface Chunk {
  id: string;
  text: string;
  metadata: {
    kb_id: string;
    filename: string;
    chunk_index: number;
  };
}

export interface SearchResult {
  id: string;
  text: string;
  metadata: {
    kb_id: string;
    filename: string;
    chunk_index: number;
  };
  distance: number;
}

export interface VectorStore {
  createCollection(kbId: string): Promise<void>;
  deleteCollection(kbId: string): Promise<void>;
  addChunks(kbId: string, chunks: Chunk[]): Promise<void>;
  search(
    kbId: string,
    query: string,
    topK: number,
    threshold: number,
    distanceMetric: string,
  ): Promise<SearchResult[]>;
}
