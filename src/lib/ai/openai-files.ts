import "server-only";
import { getOpenAIClient } from "./client";
import {
  getFixtureOpenAIFileProvider,
  isFixtureRuntime,
} from "@/lib/fixture-runtime";

export type VectorStoreFileStatus = "in_progress" | "completed" | "failed";

export type VectorStoreFileProgress = {
  status: VectorStoreFileStatus;
};

export interface OpenAIFileProvider {
  createVectorStore(input: { name: string }): Promise<{ id: string }>;
  deleteVectorStore(vectorStoreId: string): Promise<void>;
  uploadFile(input: {
    name: string;
    mimeType: string;
    bytes: Uint8Array;
  }): Promise<{ id: string }>;
  attachFile(vectorStoreId: string, fileId: string): Promise<void>;
  getFileStatus(
    vectorStoreId: string,
    fileId: string,
  ): Promise<VectorStoreFileProgress>;
  getExtractedText(
    vectorStoreId: string,
    fileId: string,
  ): Promise<string | undefined>;
  detachFile(vectorStoreId: string, fileId: string): Promise<void>;
  deleteFile(fileId: string): Promise<void>;
}

function normalizeFileStatus(status: string): VectorStoreFileStatus {
  if (status === "completed") {
    return "completed";
  }
  if (status === "failed" || status === "cancelled") {
    return "failed";
  }
  return "in_progress";
}

export function getOpenAIFileProvider(): OpenAIFileProvider {
  if (isFixtureRuntime()) return getFixtureOpenAIFileProvider();
  const client = getOpenAIClient();

  return {
    async createVectorStore({ name }) {
      const vectorStore = await client.vectorStores.create({ name });
      return { id: vectorStore.id };
    },
    async deleteVectorStore(vectorStoreId) {
      await client.vectorStores.delete(vectorStoreId);
    },
    async uploadFile({ name, mimeType, bytes }) {
      const contents = new ArrayBuffer(bytes.byteLength);
      new Uint8Array(contents).set(bytes);
      const file = new File([contents], name, { type: mimeType });
      const uploaded = await client.files.create({
        file,
        purpose: "assistants",
      });
      return { id: uploaded.id };
    },
    async attachFile(vectorStoreId, fileId) {
      await client.vectorStores.files.create(vectorStoreId, {
        file_id: fileId,
      });
    },
    async getFileStatus(vectorStoreId, fileId) {
      const file = await client.vectorStores.files.retrieve(fileId, {
        vector_store_id: vectorStoreId,
      });
      return { status: normalizeFileStatus(file.status) };
    },
    async getExtractedText(vectorStoreId, fileId) {
      const content = client.vectorStores.files.content(fileId, {
        vector_store_id: vectorStoreId,
      });
      const parts: string[] = [];
      for await (const item of content) {
        if (typeof item.text === "string") {
          parts.push(item.text);
        }
      }
      const text = parts.join("\n");
      return text || undefined;
    },
    async detachFile(vectorStoreId, fileId) {
      await client.vectorStores.files.delete(fileId, {
        vector_store_id: vectorStoreId,
      });
    },
    async deleteFile(fileId) {
      await client.files.delete(fileId);
    },
  };
}
