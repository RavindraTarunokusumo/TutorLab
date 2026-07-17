import "server-only";
import { z } from "zod";
import { getOpenAIClient } from "@/lib/ai/client";
import {
  getFixtureDocumentAnalyst,
  isFixtureRuntime,
} from "@/lib/fixture-runtime";
import { buildDocumentAnalystInstructions } from "@/lib/ai/prompts/document-analyst";
import {
  DocumentAnalysisSchema,
  type DocumentAnalysis,
  type SourceDocument,
  type TeachingBriefPatch,
} from "@/lib/schemas";

type DocumentAnalysisInput = {
  source: SourceDocument;
  teachingBrief: TeachingBriefPatch | Record<string, never>;
  documentText: string;
  analysisId: string;
  analyzedAt: string;
};

export interface DocumentAnalyst {
  analyze(input: DocumentAnalysisInput): Promise<unknown>;
  repair(
    input: DocumentAnalysisInput,
    invalidOutput: unknown,
  ): Promise<unknown>;
}

function strictResponseSchema() {
  const schema = z.toJSONSchema(DocumentAnalysisSchema) as Record<string, unknown>;
  const normalize = (value: unknown): void => {
    if (!value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    const properties = node.properties;
    if (properties && typeof properties === "object") {
      const fields = properties as Record<string, unknown>;
      const required = new Set(Array.isArray(node.required) ? node.required : []);
      for (const [key, field] of Object.entries(fields)) {
        if (!required.has(key)) {
          fields[key] = { anyOf: [field, { type: "null" }] };
        }
        normalize(fields[key]);
      }
      node.required = Object.keys(fields);
    }
    if (Array.isArray(node.anyOf)) node.anyOf.forEach(normalize);
    if (node.items) normalize(node.items);
  };
  normalize(schema);
  return schema;
}

function responseFormat() {
  return {
    type: "json_schema" as const,
    name: "document_analysis",
    strict: true,
    schema: strictResponseSchema(),
  };
}

function promptFor(
  input: DocumentAnalysisInput,
  repairOutput?: unknown,
): string {
  const instructions = buildDocumentAnalystInstructions(input);
  const requiredEnvelope = {
    schemaVersion: "0.1",
    id: input.analysisId,
    projectId: input.source.projectId,
    documentId: input.source.id,
    documentHash: input.source.contentHash,
    analyzedAt: input.analyzedAt,
  };
  return `${instructions}\n\nRequired immutable envelope: ${JSON.stringify(requiredEnvelope)}${repairOutput === undefined ? "" : `\nPrevious invalid JSON (repair it without retaining unsupported content): ${JSON.stringify(repairOutput)}`}`;
}

async function requestStructuredOutput(prompt: string): Promise<unknown> {
  const client = getOpenAIClient();
  const response = await client.responses.create({
    model: "gpt-5.6-luna",
    input: prompt,
    text: { format: responseFormat() },
  });
  const stripOptionalNulls = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stripOptionalNulls);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, nested]) => nested !== null)
        .map(([key, nested]) => [key, stripOptionalNulls(nested)]),
    );
  };
  return stripOptionalNulls(JSON.parse(response.output_text));
}

export function getDocumentAnalyst(): DocumentAnalyst {
  if (isFixtureRuntime()) return getFixtureDocumentAnalyst();
  return {
    analyze(input) {
      return requestStructuredOutput(promptFor(input));
    },
    repair(input, invalidOutput) {
      return requestStructuredOutput(promptFor(input, invalidOutput));
    },
  };
}

export function parseAnalyzedDocument(output: unknown): DocumentAnalysis {
  return DocumentAnalysisSchema.parse(output);
}
