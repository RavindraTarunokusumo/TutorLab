import "server-only";
import { getOpenAIClient } from "./client";
import {
  getFixtureOpenAIFileProvider,
  isFixtureRuntime,
} from "@/lib/fixture-runtime";
import { extractDocxText } from "@/lib/sources/docx-extraction";
import { extractPdfText } from "@/lib/sources/pdf-extraction";

export type VectorStoreFileStatus = "in_progress" | "completed" | "failed";

export type VectorStoreFileProgress = {
  status: VectorStoreFileStatus;
};

export type VectorStorePassage = { fileId: string; text: string };

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
    mimeType?: string,
  ): Promise<string | undefined>;
  searchPassages?(input: { vectorStoreId: string; query: string; fileIds: string[]; limit: number }): Promise<VectorStorePassage[]>;
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
    async getExtractedText(vectorStoreId, fileId, mimeType) {
      if (
        mimeType === "application/pdf" ||
        mimeType ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
      ) {
        const original = await client.files.content(fileId);
        const bytes = new Uint8Array(await original.arrayBuffer());
        return mimeType === "application/pdf"
          ? extractPdfText(bytes)
          : extractDocxText(bytes);
      }
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
    async searchPassages({ vectorStoreId, query, fileIds, limit }) {
      const searchable = client.vectorStores as unknown as {
        search: (id: string, input: { query: string; max_num_results: number }) => Promise<{ data?: Array<{ file_id?: string; content?: Array<{ type?: string; text?: string }> }> }>;
      };
      const result = await searchable.search(vectorStoreId, { query, max_num_results: limit });
      const allowed = new Set(fileIds);
      return (result.data ?? []).flatMap((item) => {
        const fileId = item.file_id;
        const text = item.content?.filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n").trim();
        return fileId && text && allowed.has(fileId) ? [{ fileId, text }] : [];
      });
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
