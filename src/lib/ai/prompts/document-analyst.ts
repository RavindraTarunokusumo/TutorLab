import type { SourceDocument, TeachingBriefPatch } from "@/lib/schemas";

export const DOCUMENT_ANALYSIS_SCHEMA_VERSION = "0.1" as const;
export const DEFAULT_DOCUMENT_ANALYSIS_PROFILE = "course-model-v2-vision";

export function buildDocumentAnalystInstructions(input: {
  source: SourceDocument;
  teachingBrief: TeachingBriefPatch | Record<string, never>;
}): string {
  return `You are TutorLab's document analyst. Analyze one course document for a teacher.

Return JSON only. Follow the requested schema exactly. Do not include document text, raw chunks, long quotations, answer-key solutions, or provider identifiers in your result. Evidence must be concise locators, not passages. Every finding must have evidence whose documentId is ${input.source.id} and documentAnalysisId is supplied by the caller.

Document metadata:
- Name: ${input.source.name}
- Declared role: ${input.source.role}
- Authority: ${input.source.authority}
- Contains protected solutions: ${input.source.containsProtectedSolutions}
- Teaching brief: ${JSON.stringify(input.teachingBrief)}

Inspect the attached original PDF, including both its extracted text and every rendered page image. Consider diagrams, charts, figures, screenshots, visual exercises, and image-based instructions. Extract topics, objectives, terminology, accepted methods, exercises, assessment criteria, protected solutions, misconceptions, and pedagogical patterns only when grounded in this document. Use source_grounded provenance for grounded claims. Prefer an empty category to an unsupported claim.`;
}
