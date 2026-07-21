import "server-only";
import { randomUUID } from "node:crypto";
import { getTutorRuntime, type RuntimeDraft, type TutorRuntime } from "@/lib/ai/tutor-runtime";
import { getSourceRepository, type SourceRepository } from "@/lib/sources/repository";
import { getOpenAIFileProvider, type OpenAIFileProvider } from "@/lib/ai/openai-files";
import { getCourseModelRepository, type CourseModelRepository } from "@/lib/analysis/course-synthesis";
import { getProjectRepository, type ProjectRepository } from "@/lib/projects/repository";
import { validateTransition } from "@/lib/tutor/state-machine";
import { getTutorRepository, type TutorRepository, type TutorVersionRecord } from "@/lib/tutor/repository";
import { parseTutorReplyMetadata, type Conversation, type TutorReplyMetadata } from "@/lib/schemas";
import { getConversationRepository, type ConversationRepository } from "./repository";

export type PreviewReply = {
  conversation: Conversation;
  content: string;
  metadata: TutorReplyMetadata;
};

export class PreviewConversationBusyError extends Error {}

type Dependencies = {
  conversationRepository: ConversationRepository;
  sourceRepository: SourceRepository;
  tutorRepository: TutorRepository;
  runtime: TutorRuntime;
  projectRepository: ProjectRepository;
  fileProvider: OpenAIFileProvider;
  courseModelRepository: CourseModelRepository;
  createId: () => string;
  now: () => Date;
};

function dependencies(overrides?: Partial<Dependencies>): Dependencies {
  // Build the OpenAI file provider lazily: only sendPreviewMessage (POST, which
  // runs with the caller's key) actually uses it. The GET/DELETE paths must not
  // fail just because no key is available — under the bring-your-own-key model
  // getOpenAIFileProvider() throws when no key is present.
  let resolvedFileProvider: OpenAIFileProvider | undefined;
  return {
    conversationRepository: overrides?.conversationRepository ?? getConversationRepository(),
    sourceRepository: overrides?.sourceRepository ?? getSourceRepository(),
    tutorRepository: overrides?.tutorRepository ?? getTutorRepository(),
    runtime: overrides?.runtime ?? getTutorRuntime(),
    projectRepository: overrides?.projectRepository ?? getProjectRepository(),
    get fileProvider() {
      return (resolvedFileProvider ??=
        overrides?.fileProvider ?? getOpenAIFileProvider());
    },
    courseModelRepository: overrides?.courseModelRepository ?? getCourseModelRepository(),
    createId: overrides?.createId ?? randomUUID,
    now: overrides?.now ?? (() => new Date()),
  };
}

function runtimeSources(version: TutorVersionRecord, sources: Awaited<ReturnType<SourceRepository["list"]>>) {
  const permitted = new Set(version.spec.runtimeRetrieval.permittedDocumentIds);
  return sources
    .filter((source) => permitted.has(source.id))
    .filter((source) => source.permissions.useForRuntimeRetrieval)
    .filter((source) => source.permissions.revealExcerptsToStudents)
    .filter((source) => !source.containsProtectedSolutions)
    .map((source) => ({ documentId: source.id, title: source.name }));
}

type RuntimeSource = { documentId: string; title: string; passage: string };

function queryTokens(query: string): string[] {
  return [...new Set(query.toLowerCase().match(/[a-z]{4,}/g) ?? [])];
}

function relevanceScore(query: string, text: string): number {
  const textTokens = queryTokens(text);
  return queryTokens(query).filter((queryToken) => textTokens.some((textToken) =>
    queryToken === textToken || (queryToken.length >= 7 && textToken.length >= 7 && queryToken.slice(0, 7) === textToken.slice(0, 7)),
  )).length;
}

async function courseModelSources(version: TutorVersionRecord, projectId: string, query: string, selected: Array<{ documentId: string; title: string }>, deps: Dependencies): Promise<RuntimeSource[]> {
  const courseModel = await deps.courseModelRepository.findById?.(projectId, version.courseModelVersionId);
  if (!courseModel) return [];
  const sourceById = new Map(selected.map((source) => [source.documentId, source]));
  return courseModel.artifact.concepts
    .map((concept) => ({ concept, score: relevanceScore(query, `${concept.name} ${concept.description}`) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .flatMap(({ concept }) => concept.evidence
      .map((evidence) => sourceById.get(evidence.documentId))
      .flatMap((source) => source ? [{
        documentId: source.documentId,
        title: source.title,
        passage: `Course model concept: ${concept.name}. ${concept.description}`,
      }] : []))
    .filter((source, index, entries) => entries.findIndex((candidate) => candidate.documentId === source.documentId && candidate.passage === source.passage) === index)
    .slice(0, version.spec.runtimeRetrieval.maxPassages);
}

async function retrieveRuntimeSources(version: TutorVersionRecord, projectId: string, query: string, sources: Awaited<ReturnType<SourceRepository["list"]>>, deps: Dependencies): Promise<RuntimeSource[]> {
  const selected = runtimeSources(version, sources);
  const synthesizedSources = await courseModelSources(version, projectId, query, selected, deps);
  const vectorStoreId = await deps.projectRepository.findVectorStoreId(projectId);
  if (!vectorStoreId) return synthesizedSources;
  const files = await Promise.all(selected.map(async (source) => {
    const record = await deps.sourceRepository.findById(projectId, source.documentId);
    return record?.openaiFileId ? { ...source, fileId: record.openaiFileId } : null;
  }));
  const permittedFiles = files.flatMap((file) => file ? [file] : []);
  if (permittedFiles.length === 0 || !deps.fileProvider.searchPassages) return synthesizedSources;
  const sourceByFileId = new Map(permittedFiles.map((file) => [file.fileId, file]));
  const passages = await deps.fileProvider.searchPassages({ vectorStoreId, query, fileIds: permittedFiles.map(({ fileId }) => fileId), limit: version.spec.runtimeRetrieval.maxPassages });
  const retrieved = passages.flatMap((passage) => {
    const source = sourceByFileId.get(passage.fileId);
    const text = passage.text.replace(/\s+/g, " ").trim().slice(0, 2_000);
    return source && text ? [{ documentId: source.documentId, title: source.title, passage: text }] : [];
  });
  return [...synthesizedSources, ...retrieved].slice(0, version.spec.runtimeRetrieval.maxPassages);
}

function retrievalQuery(conversation: Conversation, learnerMessage: string): string {
  const recentTutorContext = conversation.messages
    .filter((message) => message.role === "tutor")
    .slice(-2)
    .map((message) => message.content)
    .join("\n")
    .slice(-4_000);
  return recentTutorContext ? `${learnerMessage}\n${recentTutorContext}` : learnerMessage;
}

function boundedWords(content: string, maxWords: number): string {
  const words = content.trim().split(/\s+/);
  return words.length <= maxWords ? content.trim() : `${words.slice(0, maxWords).join(" ")}…`;
}

function safeLimitedEvidenceDraft(): RuntimeDraft {
  return {
    content: "I do not have permitted course evidence for that question, so I cannot make a course-grounded claim. Please share an approved source or ask your teacher.",
    teachingMove: "redirect", proposedState: "redirect", boundary: "out_of_scope", citedDocumentIds: [],
  };
}

function requestsProtectedAnswer(message: string): boolean {
  return /answer key|worked solution|mark scheme|final answer|correct answer|just (?:tell|give) me (?:the )?answer/.test(message.toLowerCase());
}

function disclosesProtectedAnswer(content: string): boolean {
  return /(?:the )?(?:final|correct) answer\s+(?:is|:)|(?:according to|from) (?:the )?(?:answer key|mark scheme|worked solution)/i.test(content);
}

function safeProtectedDisclosureDraft(): RuntimeDraft {
  return {
    content: "I can help you work through the method, but I cannot reveal a protected solution or final answer. What step have you tried?",
    teachingMove: "redirect", proposedState: "redirect", boundary: "protected_solution", citedDocumentIds: [],
  };
}

function requestsInternalInstructionDisclosure(message: string): boolean {
  const normalized = normalizeDisclosureText(message);
  const target = "(?:system|internal|hidden|compiled|developer|provider)(?: [a-z0-9]+){0,2} (?:prompt|instructions?|rules?|polic(?:y|ies)|messages?|configuration)";
  const extraction = "(?:reveal|show|tell|give|print|display|repeat|quote|expose|share|output|return|paraphrase|summari[sz]e|translate|rewrite|describe)";
  return new RegExp(`\\b${extraction}\\b(?: [a-z0-9]+){0,8} ${target}\\b`).test(normalized)
    || new RegExp(`\\b(?:what|which) (?:are|is) (?:your|the)(?: [a-z0-9]+){0,3} ${target}\\b`).test(normalized);
}

function safeInternalDisclosureDraft(): RuntimeDraft {
  return {
    content: "I cannot reveal, paraphrase, or describe internal instructions. I can help with an approved course question instead.",
    teachingMove: "redirect", proposedState: "redirect", boundary: "protected_solution", citedDocumentIds: [],
  };
}

function normalizeDisclosureText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function meaningfulPromptSegments(compiledPrompt: string): string[] {
  const words = normalizeDisclosureText(compiledPrompt).split(" ").filter((word) => word.length > 1);
  const segments = new Set<string>();
  for (let index = 0; index + 2 < words.length; index += 1) {
    segments.add(words.slice(index, index + 3).join(" "));
  }
  if (words.length > 0 && words.length < 3) segments.add(words.join(" "));
  return [...segments];
}

function normalizeTeachingMove(version: TutorVersionRecord, draft: RuntimeDraft): RuntimeDraft | null {
  if (version.spec.pedagogy.permittedTeachingMoves.includes(draft.teachingMove)) return draft;
  const replacement = (["give_conceptual_hint", "explain_concept", "elicit_reasoning", "check_understanding", "summarize_learning"] as const)
    .find((move) => version.spec.pedagogy.permittedTeachingMoves.includes(move));
  return replacement ? { ...draft, teachingMove: replacement } : null;
}

function safeguardDraft(version: TutorVersionRecord, draft: RuntimeDraft, sources: Array<{ documentId: string; title: string; passage: string }>, learnerMessage: string): RuntimeDraft {
  if (requestsInternalInstructionDisclosure(learnerMessage)) return safeInternalDisclosureDraft();
  if (requestsProtectedAnswer(learnerMessage) || disclosesProtectedAnswer(draft.content)) return safeProtectedDisclosureDraft();
  if (sources.length === 0) return safeLimitedEvidenceDraft();
  const lower = draft.content.toLowerCase();
  const normalizedContent = normalizeDisclosureText(draft.content);
  const leaksInternal = /system prompt|compiled prompt|provider instructions|openai api|api key/.test(lower) || meaningfulPromptSegments(version.compiledPrompt).some((segment) => normalizedContent.includes(segment));
  if (leaksInternal) return { ...safeLimitedEvidenceDraft(), boundary: "protected_solution" };
  const normalizedDraft = normalizeTeachingMove(version, draft);
  if (!normalizedDraft) return { ...safeLimitedEvidenceDraft(), boundary: "protected_solution" };
  const permittedIds = new Set(sources.map((source) => source.documentId));
  const citedDocumentIds = normalizedDraft.citedDocumentIds.filter((id) => permittedIds.has(id));
  if (version.spec.runtimeRetrieval.citationsRequired && citedDocumentIds.length === 0) return safeLimitedEvidenceDraft();
  return { ...normalizedDraft, content: boundedWords(normalizedDraft.content, version.spec.responseStyle.maxWords), citedDocumentIds };
}

function metadata(version: TutorVersionRecord, conversation: Conversation, draft: RuntimeDraft, sources: Array<{ documentId: string; title: string; passage: string }>, startedAt: Date): TutorReplyMetadata {
  const transition = validateTransition({
    currentState: conversation.currentState,
    proposedState: draft.proposedState,
    spec: version.spec,
    context: { boundary: draft.boundary, requestsFinalAnswer: draft.boundary === "protected_solution" },
  });
  const nextState = transition.nextState ?? conversation.currentState;
  const sourceById = new Map(sources.map((source) => [source.documentId, source]));
  return parseTutorReplyMetadata({
    schemaVersion: "0.1",
    teachingMove: draft.teachingMove,
    currentState: conversation.currentState,
    nextState,
    citations: draft.citedDocumentIds.flatMap((id) => {
      const source = sourceById.get(id);
      return source ? [{ documentId: source.documentId, title: source.title }] : [];
    }),
    boundary: draft.boundary,
    stateFallback: transition.stateFallback,
    usage: { inputTokens: 0, outputTokens: 0, latencyMs: Math.max(0, Date.now() - startedAt.getTime()) },
  });
}

export async function getOrCreatePreviewConversation(input: { projectId: string; tutorVersionId: string }, overrides?: Partial<Dependencies>): Promise<Conversation> {
  const deps = dependencies(overrides);
  const active = deps.tutorRepository.findActiveVersion
    ? await deps.tutorRepository.findActiveVersion(input.projectId)
    : await deps.tutorRepository.findLatestVersion(input.projectId);
  if (!active || active.id !== input.tutorVersionId || active.status !== "ready") throw new Error("Active tutor version not found");
  const existing = await deps.conversationRepository.findLatestForTutor({ ...input, mode: "teacher_preview" });
  if (existing) return existing;
  const version = await deps.tutorRepository.findVersion(input.projectId, input.tutorVersionId);
  if (!version || version.status !== "ready") throw new Error("Active tutor version not found");
  const now = deps.now().toISOString();
  return deps.conversationRepository.getOrCreateTeacherPreview({
    schemaVersion: "0.1", id: deps.createId(), projectId: input.projectId, tutorVersionId: input.tutorVersionId,
    mode: "teacher_preview", currentState: "diagnose", messages: [], createdAt: now, updatedAt: now,
  });
}

export async function sendPreviewMessage(input: { projectId: string; tutorVersionId: string; conversationId?: string; message: string }, overrides?: Partial<Dependencies>): Promise<PreviewReply> {
  const deps = dependencies(overrides);
  const version = await deps.tutorRepository.findVersion(input.projectId, input.tutorVersionId);
  const active = deps.tutorRepository.findActiveVersion
    ? await deps.tutorRepository.findActiveVersion(input.projectId)
    : await deps.tutorRepository.findLatestVersion(input.projectId);
  if (!version || version.status !== "ready" || active?.id !== version.id) throw new Error("Active tutor version not found");
  const conversation = input.conversationId
    ? await deps.conversationRepository.findById(input.projectId, input.conversationId)
    : await getOrCreatePreviewConversation({ projectId: input.projectId, tutorVersionId: input.tutorVersionId }, deps);
  if (!conversation || conversation.tutorVersionId !== input.tutorVersionId || conversation.mode !== "teacher_preview") throw new Error("Preview conversation not found");
  const claimToken = deps.createId();
  if (!await deps.conversationRepository.claimPreview({ projectId: input.projectId, conversationId: conversation.id, token: claimToken, staleBefore: new Date(deps.now().getTime() - 60_000) })) {
    throw new PreviewConversationBusyError("A preview update is already in progress");
  }
  try {
  const startedAt = deps.now();
  const learnerAt = startedAt.toISOString();
  const afterLearner = await deps.conversationRepository.appendMessage({
    projectId: input.projectId, conversationId: conversation.id,
    message: { id: deps.createId(), role: "learner", content: input.message.trim(), createdAt: learnerAt },
  });
  const learnerMessage = input.message.trim();
  const extractionAttempt = requestsInternalInstructionDisclosure(learnerMessage);
  const sources = extractionAttempt
    ? []
    : await retrieveRuntimeSources(version, input.projectId, retrievalQuery(afterLearner, learnerMessage), await deps.sourceRepository.list(input.projectId), deps);
  const runtimeDraft = extractionAttempt
    ? safeInternalDisclosureDraft()
    : await deps.runtime.reply({ compiledPrompt: version.compiledPrompt, spec: version.spec, conversation: afterLearner, learnerMessage, sources });
  const draft = safeguardDraft(version, runtimeDraft, sources, learnerMessage);
  const replyMetadata = metadata(version, afterLearner, draft, sources, startedAt);
  const persisted = await deps.conversationRepository.appendMessage({
    projectId: input.projectId, conversationId: afterLearner.id, currentState: replyMetadata.nextState,
    message: { id: deps.createId(), role: "tutor", content: draft.content, metadata: replyMetadata, createdAt: deps.now().toISOString() },
  });
  return { conversation: persisted, content: draft.content, metadata: replyMetadata };
  } finally {
    await deps.conversationRepository.releasePreviewClaim({ projectId: input.projectId, conversationId: conversation.id, token: claimToken });
  }
}

export async function resetPreviewConversation(projectId: string, tutorVersionId: string, overrides?: Partial<Dependencies>): Promise<Conversation> {
  const deps = dependencies(overrides);
  const active = deps.tutorRepository.findActiveVersion
    ? await deps.tutorRepository.findActiveVersion(projectId)
    : await deps.tutorRepository.findLatestVersion(projectId);
  if (!active || active.id !== tutorVersionId || active.status !== "ready") throw new Error("Active tutor version not found");
  const existing = await deps.conversationRepository.findLatestForTutor({ projectId, tutorVersionId, mode: "teacher_preview" });
  if (existing) {
    const token = deps.createId();
    if (!await deps.conversationRepository.claimPreview({ projectId, conversationId: existing.id, token, staleBefore: new Date(deps.now().getTime() - 60_000) })) throw new PreviewConversationBusyError("A preview update is already in progress");
    try { await deps.conversationRepository.delete(projectId, existing.id); }
    finally { await deps.conversationRepository.releasePreviewClaim({ projectId, conversationId: existing.id, token }); }
  }
  return getOrCreatePreviewConversation({ projectId, tutorVersionId }, deps);
}

export { runtimeSources };
