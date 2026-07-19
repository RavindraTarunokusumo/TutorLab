import "server-only";
import JSZip from "jszip";
import { getCourseAnalysisRepository, getCourseModelRepository, type CourseModelVersionRecord } from "@/lib/analysis/course-synthesis";
import { getSourceRepository } from "@/lib/sources/repository";
import { getTutorRepository, type TutorVersionRecord } from "@/lib/tutor/repository";

export type ExportedPackageFile = {
  path: string;
  purpose: string;
  content: string;
};

export type StandaloneTutorPackage = {
  name: string;
  files: ExportedPackageFile[];
};

export class StandaloneTutorExportError extends Error {}

function safeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "tutor";
}

function exportedCourseSummary(
  tutor: TutorVersionRecord,
  courseModel: CourseModelVersionRecord,
  permittedIds: Set<string>,
) {
  const artifact = courseModel.artifact;
  const permittedItem = <T extends { evidence: Array<{ documentId: string }> }>(
    item: T,
  ) => item.evidence.every((evidence) => permittedIds.has(evidence.documentId))
    ? item
    : null;
  const permittedItems = <T extends { evidence: Array<{ documentId: string }> }>(
    items: T[],
  ) => items.map(permittedItem).filter((item): item is T => item !== null);

  return {
    schemaVersion: "0.1",
    courseIdentity: {
      title: tutor.spec.learningContract.title,
      subject: tutor.spec.learningContract.subject,
      studentLevel: tutor.spec.learningContract.studentLevel,
      language: tutor.spec.learningContract.language,
    },
    structure: {
      units: permittedItems(artifact.structure.units),
      prerequisiteRelations: permittedItems(artifact.structure.prerequisiteRelations),
    },
    learningObjectives: permittedItems(artifact.learningObjectives),
    concepts: permittedItems(artifact.concepts),
    terminology: permittedItems(artifact.terminology),
    methods: permittedItems(artifact.methods),
  };
}

function standaloneFiles(tutor: TutorVersionRecord, courseSummary: unknown, context: unknown): ExportedPackageFile[] {
  const appName = safeName(tutor.spec.learningContract.title);
  const packageJson = {
    name: `${appName}-tutor`, private: true, version: "1.0.0",
    scripts: { dev: "next dev", build: "next build", start: "next start" },
    dependencies: { next: "15.5.20", openai: "6.47.0", react: "19.1.8", "react-dom": "19.1.8" },
    devDependencies: { typescript: "5.9.3", "@types/node": "22.19.11", "@types/react": "19.1.17", "@types/react-dom": "19.1.17" },
  };
  return [
    { path: "package.json", purpose: "Installs and runs the standalone Next.js chatbot.", content: `${JSON.stringify(packageJson, null, 2)}\n` },
    { path: "tsconfig.json", purpose: "Enables TypeScript and JSON data imports for the chatbot.", content: `${JSON.stringify({ compilerOptions: { target: "ES2022", lib: ["dom", "dom.iterable", "esnext"], strict: true, module: "esnext", moduleResolution: "bundler", jsx: "preserve", resolveJsonModule: true, esModuleInterop: true, plugins: [{ name: "next" }] }, include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"] }, null, 2)}\n` },
    { path: ".env.example", purpose: "Lists the environment variables needed to run the chatbot.", content: "OPENAI_API_KEY=\nOPENAI_MODEL=gpt-5.6-terra\n" },
    { path: "data/tutor-spec.json", purpose: "Contains the selected tutor's portable teaching policy.", content: `${JSON.stringify(tutor.spec, null, 2)}\n` },
    { path: "data/course-summary.json", purpose: "Contains compact, source-backed course concepts and objectives.", content: `${JSON.stringify(courseSummary, null, 2)}\n` },
    { path: "data/knowledge-context.json", purpose: "Contains permitted source summaries and findings used for local retrieval.", content: `${JSON.stringify(context, null, 2)}\n` },
    { path: "app/layout.tsx", purpose: "Provides the required root layout for the standalone Next.js app.", content: `import type { ReactNode } from "react";\n\nexport default function RootLayout({ children }: { children: ReactNode }) {\n  return <html lang="en"><body>{children}</body></html>;\n}\n` },
    { path: "app/api/chat/route.ts", purpose: "Calls OpenAI on the server with the tutor policy and matching course context.", content: `import OpenAI from "openai";\nimport tutorSpec from "../../../data/tutor-spec.json";\nimport knowledge from "../../../data/knowledge-context.json";\n\nconst tokens = (value: string) => [...new Set(value.toLowerCase().match(/[a-z]{4,}/g) ?? [])];\nconst selectContext = (message: string) => {\n  const query = tokens(message);\n  return knowledge.documents\n    .map((document) => ({ document, score: query.filter((token) => document.text.toLowerCase().includes(token)).length }))\n    .filter(({ score }) => score > 0).sort((a, b) => b.score - a.score).slice(0, 4).map(({ document }) => document);\n};\n\nexport async function POST(request: Request) {\n  const { message } = await request.json() as { message?: string };\n  if (!message?.trim() || message.length > 12000) return Response.json({ error: "A message of up to 12,000 characters is required." }, { status: 400 });\n  const context = selectContext(message);\n  if (!context.length) return Response.json({ content: "I do not have permitted course context for that question. Please ask about this course material." });\n  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });\n  const response = await client.responses.create({\n    model: process.env.OPENAI_MODEL || "gpt-5.6-terra",\n    input: [\n      { role: "system", content: "You are a course tutor. Follow this policy exactly: " + JSON.stringify(tutorSpec.pedagogy) + ". Never reveal protected solutions. Ground claims only in the supplied context and cite the source title in square brackets." },\n      { role: "user", content: "Course context: " + JSON.stringify(context) + "\\n\\nLearner: " + message },\n    ],\n  });\n  return Response.json({ content: response.output_text });\n}\n` },
    { path: "app/page.tsx", purpose: "Provides the standalone browser chat interface.", content: `"use client";\n\nimport { FormEvent, useState } from "react";\nimport tutorSpec from "../data/tutor-spec.json";\n\ntype Message = { role: "You" | "Tutor"; content: string };\n\nexport default function Home() {\n  const [messages, setMessages] = useState<Message[]>([]);\n  const [message, setMessage] = useState("");\n  const [busy, setBusy] = useState(false);\n  async function send(event: FormEvent) {\n    event.preventDefault();\n    const trimmed = message.trim();\n    if (!trimmed || busy) return;\n    setMessages((current) => [...current, { role: "You", content: trimmed }]);\n    setMessage(""); setBusy(true);\n    try { const response = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: trimmed }) }); const body = await response.json() as { content?: string; error?: string }; setMessages((current) => [...current, { role: "Tutor", content: body.content ?? body.error ?? "The tutor could not reply." }]); } finally { setBusy(false); }\n  }\n  return <main style={{ maxWidth: 760, margin: "48px auto", fontFamily: "system-ui" }}><h1>{tutorSpec.learningContract.title}</h1><p>Course-grounded tutor</p><section style={{ minHeight: 360, border: "1px solid #ddd", borderRadius: 16, padding: 20 }}>{messages.length ? messages.map((item, index) => <article key={index}><strong>{item.role}</strong><p>{item.content}</p></article>) : <p>Ask a course question to begin.</p>}{busy ? <p>Thinking…</p> : null}</section><form onSubmit={send} style={{ display: "flex", gap: 8, marginTop: 16 }}><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ask the tutor…" style={{ flex: 1, padding: 12 }} /><button disabled={busy}>Send</button></form></main>;\n}\n` },
    { path: "README.md", purpose: "Explains how to install, configure, run, and deploy the chatbot.", content: `# ${tutor.spec.learningContract.title} tutor\n\nThis is a standalone, course-grounded tutor exported from TutorLab.\n\n## Setup\n\n1. Install Node.js 20.19 or later.\n2. Copy \`.env.example\` to \`.env.local\` and set \`OPENAI_API_KEY\`.\n3. Run \`npm install\`.\n4. Run \`npm run dev\` and open the local URL.\n\n## Included course context\n\n\`data/knowledge-context.json\` contains only source summaries and findings permitted for runtime retrieval and student visibility. It excludes protected solutions, raw uploads, provider vector-store IDs, evaluator artifacts, and secrets.\n\nProvider-managed embeddings are not portable. This package performs simple local relevance selection over the included context before each model call. Replace that selector with your preferred embedding database if you need larger-scale retrieval.\n\n## Before public deployment\n\nThis starter includes a message-size limit, but it does not provide authentication or rate limiting. Add both through your host application or platform before exposing the chat route publicly.\n\n## Responsible use\n\nKeep the API key server-side. Review the tutor policy before deployment and do not add protected answer keys to the knowledge context.\n` },
  ];
}

export async function buildStandaloneTutorPackage(projectId: string): Promise<StandaloneTutorPackage> {
  const tutorRepository = getTutorRepository();
  const tutor = tutorRepository.findActiveVersion ? await tutorRepository.findActiveVersion(projectId) : await tutorRepository.findLatestVersion(projectId);
  if (!tutor || tutor.status !== "ready") throw new StandaloneTutorExportError("An active compiled tutor is required before export.");
  const courseModelRepository = getCourseModelRepository();
  const courseModel = courseModelRepository.findById ? await courseModelRepository.findById(projectId, tutor.courseModelVersionId) : await courseModelRepository.findLatest(projectId);
  if (!courseModel) throw new StandaloneTutorExportError("The tutor's course model is unavailable.");
  const sources = await getSourceRepository().list(projectId);
  const permitted = sources.filter((source) => tutor.spec.runtimeRetrieval.permittedDocumentIds.includes(source.id) && source.permissions.useForRuntimeRetrieval && source.permissions.revealExcerptsToStudents && !source.containsProtectedSolutions);
  const permittedIds = new Set(permitted.map((source) => source.id));
  const analyses = await getCourseAnalysisRepository().listForProject(projectId);
  const sourceById = new Map(permitted.map((source) => [source.id, source]));
  const documents = analyses
    .filter(({ analysis }) => sourceById.has(analysis.documentId))
    .map(({ analysis }) => ({
      documentId: analysis.documentId,
      title: sourceById.get(analysis.documentId)!.name,
      text: [analysis.summary, ...Object.entries(analysis.findings).filter(([category]) => category !== "protectedSolutions").flatMap(([, findings]) => findings.map((finding) => `${finding.label}: ${finding.description}`))].join("\n").slice(0, 20_000),
    }));
  const files = standaloneFiles(tutor, exportedCourseSummary(tutor, courseModel, permittedIds), { schemaVersion: "0.1", documents });
  return { name: `${safeName(tutor.spec.learningContract.title)}-tutor.zip`, files };
}

export async function zipStandaloneTutorPackage(packageData: StandaloneTutorPackage): Promise<Uint8Array> {
  const zip = new JSZip();
  packageData.files.forEach((file) => zip.file(file.path, file.content));
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
