import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  ConceptSchema,
  CourseModelSchema,
  DEFAULT_WORKSPACE_BUDGET,
  type CourseModel,
  type DocumentAnalysis,
  LearningObjectiveSchema,
  parseCourseModel,
  parseCourseModelPatch,
  parseDocumentAnalysis,
  parsePipelineJob,
  parseSourceDocument,
  parseTeachingBrief,
  parseWorkspaceBudget,
  type PipelineJob,
  type SourceDocument,
} from "@/lib/schemas";

const fixtureDirectory = path.join(
  process.cwd(),
  "fixtures",
  "probability-course",
);

function fixture(name: string): unknown {
  return JSON.parse(
    readFileSync(path.join(fixtureDirectory, `${name}.json`), "utf8"),
  );
}

describe("canonical artifact schemas", () => {
  it.each([
    ["teaching-brief", parseTeachingBrief],
    ["source-document", parseSourceDocument],
    ["document-analysis", parseDocumentAnalysis],
    ["course-model", parseCourseModel],
    ["course-model-patch", parseCourseModelPatch],
    ["pipeline-job", parsePipelineJob],
  ] as const)("parses the deterministic %s fixture", (name, parse) => {
    expect(parse(fixture(name))).toEqual(fixture(name));
  });

  it("applies the approved default workspace ingestion budget", () => {
    expect(parseWorkspaceBudget({})).toEqual(DEFAULT_WORKSPACE_BUDGET);
  });

  it.each([
    ["invalid-evidence-document-analysis", parseDocumentAnalysis],
    ["invalid-permissions-source-document", parseSourceDocument],
  ] as const)("rejects %s with a structured validation error", (name, parse) => {
    expect(() => parse(fixture(name))).toThrow(ZodError);
  });

  it("rejects source metadata above the default per-file hard cap", () => {
    const source = structuredClone(fixture("source-document") as SourceDocument);
    source.sizeBytes = DEFAULT_WORKSPACE_BUDGET.maxBytesPerFile + 1;

    expect(() => parseSourceDocument(source)).toThrow(ZodError);
  });

  it.each([
    ["documentId", "document-other"],
    ["documentAnalysisId", "analysis-other"],
  ] as const)("rejects analysis evidence with a mismatched %s", (field, value) => {
    const analysis = structuredClone(
      fixture("document-analysis") as DocumentAnalysis,
    );
    analysis.findings.topics[0]!.evidence[0]![field] = value;

    expect(() => parseDocumentAnalysis(analysis)).toThrow(ZodError);
  });

  it("rejects internally inconsistent course-model coverage", () => {
    const model = fixture("course-model") as Record<string, unknown>;

    expect(() =>
      parseCourseModel({
        ...model,
        coverage: fixture("invalid-coverage-course-model"),
      }),
    ).toThrow(ZodError);
  });

  it("rejects a course model that exceeds an explicit compactness limit", () => {
    const model = structuredClone(fixture("course-model") as CourseModel);
    const { description } = fixture("oversized-course-model") as {
      description: string;
    };
    const conceptTemplate = model.concepts[0]!;
    const objectiveTemplate = model.learningObjectives[0]!;

    model.concepts = Array.from({ length: 128 }, (_, index) => ({
      ...conceptTemplate,
      id: `concept-aggregate-${index}`,
      description,
    }));
    model.learningObjectives = Array.from({ length: 128 }, (_, index) => ({
      ...objectiveTemplate,
      id: `objective-aggregate-${index}`,
      statement: description,
    }));

    expect(model.concepts.every((item) => ConceptSchema.safeParse(item).success)).toBe(
      true,
    );
    expect(
      model.learningObjectives.every(
        (item) => LearningObjectiveSchema.safeParse(item).success,
      ),
    ).toBe(true);

    const result = CourseModelSchema.safeParse(model);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual([
        expect.objectContaining({
          code: "custom",
          message: "Course model exceeds the compact artifact size limit",
        }),
      ]);
    }
  });

  it.each([
    ["unknown document", "document-missing", "analysis-practice"],
    ["mismatched analysis", "document-practice", "analysis-other"],
  ] as const)(
    "rejects course-model evidence with an %s reference",
    (_case, documentId, documentAnalysisId) => {
      const model = structuredClone(fixture("course-model") as CourseModel);
      model.concepts[0]!.evidence[0] = {
        ...model.concepts[0]!.evidence[0]!,
        documentId,
        documentAnalysisId,
      };

      expect(() => parseCourseModel(model)).toThrow(ZodError);
    },
  );

  it("rejects an evidence analysis ID absent from its manifest entry", () => {
    const model = structuredClone(fixture("course-model") as CourseModel);
    const source = model.sourceManifest.find(
      ({ documentId }) => documentId === "document-practice",
    );
    expect(source).toBeDefined();
    delete source!.documentAnalysisId;

    expect(() => parseCourseModel(model)).toThrow(ZodError);
  });

  it.each([
    ["completed below 100%", { progress: 0.9 }],
    [
      "completion before start",
      {
        startedAt: "2026-07-15T10:02:00.000Z",
        completedAt: "2026-07-15T10:01:18.420Z",
      },
    ],
    ["nonterminal with completion", { status: "running", completedAt: "2026-07-15T10:01:18.420Z" }],
    ["failed without completion", { status: "failed", completedAt: undefined, diagnostic: { code: "provider_error", message: "Provider request failed.", retryable: true } }],
  ] as const)("rejects a pipeline job that is %s", (_case, changes) => {
    const job = structuredClone(fixture("pipeline-job") as PipelineJob);
    Object.assign(job, changes);

    expect(() => parsePipelineJob(job)).toThrow(ZodError);
  });
});
