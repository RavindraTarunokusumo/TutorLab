import "server-only";
import { randomUUID } from "node:crypto";
import { getTutorRuntime, type RuntimeDraft, type TutorRuntime } from "@/lib/ai/tutor-runtime";
import { getSourceRepository, type SourceRepository } from "@/lib/sources/repository";
import { getOpenAIFileProvider, type OpenAIFileProvider } from "@/lib/ai/openai-files";
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
  createId: () => string;
  now: () => Date;
};

function dependencies(overrides?: Partial<Dependencies>): Dependencies {
  return {
    conversationRepository: overrides?.conversationRepository ?? getConversationRepository(),
    sourceRepository: overrides?.sourceRepository ?? getSourceRepository(),
    tutorRepository: overrides?.tutorRepository ?? getTutorRepository(),
    runtime: overrides?.runtime ?? getTutorRuntime(),
    projectRepository: overrides?.projectRepository ?? getProjectRepository(),
    fileProvider: overrides?.fileProvider ?? getOpenAIFileProvider(),
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

async function retrieveRuntimeSources(version: TutorVersionRecord, projectId: string, query: string, sources: Awaited<ReturnType<SourceRepository["list"]>>, deps: Dependencies) {
  const selected = runtimeSources(version, sources);
  const vectorStoreId = await deps.projectRepository.findVectorStoreId(projectId);
  if (!vectorStoreId) return [];
  const files = await Promise.all(selected.map(async (source) => {
    const record = await deps.sourceRepository.findById(projectId, source.documentId);
    return record?.openaiFileId ? { ...source, fileId: record.openaiFileId } : null;
  }));
  const permittedFiles = files.flatMap((file) => file ? [file] : []);
  if (permittedFiles.length === 0 || !deps.fileProvider.searchPassages) return [];
  const sourceByFileId = new Map(permittedFiles.map((file) => [file.fileId, file]));
  const passages = await deps.fileProvider.searchPassages({ vectorStoreId, query, fileIds: permittedFiles.map(({ fileId }) => fileId), limit: version.spec.runtimeRetrieval.maxPassages });
  return passages.flatMap((passage) => {
    const source = sourceByFileId.get(passage.fileId);
    const text = passage.text.replace(/\s+/g, " ").trim().slice(0, 2_000);
    return source && text ? [{ documentId: source.documentId, title: source.title, passage: text }] : [];
  });
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

function safeguardDraft(version: TutorVersionRecord, draft: RuntimeDraft, sources: Array<{ documentId: string; title: string; passage: string }>, learnerMessage: string): RuntimeDraft {
  if (requestsProtectedAnswer(learnerMessage) || disclosesProtectedAnswer(draft.content)) return safeProtectedDisclosureDraft();
  if (sources.length === 0) return safeLimitedEvidenceDraft();
  const lower = draft.content.toLowerCase();
  const promptFragment = version.compiledPrompt.toLowerCase().slice(0, 48);
  const leaksInternal = /system prompt|compiled prompt|provider instructions|openai api|api key/.test(lower) || (promptFragment.length > 12 && lower.includes(promptFragment));
  const permittedMove = version.spec.pedagogy.permittedTeachingMoves.includes(draft.teachingMove);
  if (leaksInternal || !permittedMove) return { ...safeLimitedEvidenceDraft(), boundary: "protected_solution" };
  const permittedIds = new Set(sources.map((source) => source.documentId));
  const citedDocumentIds = draft.citedDocumentIds.filter((id) => permittedIds.has(id));
  if (version.spec.runtimeRetrieval.citationsRequired && citedDocumentIds.length === 0) return safeLimitedEvidenceDraft();
  return { ...draft, content: boundedWords(draft.content, version.spec.responseStyle.maxWords), citedDocumentIds };
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
  const sources = await retrieveRuntimeSources(version, input.projectId, learnerMessage, await deps.sourceRepository.list(input.projectId), deps);
  const draft = safeguardDraft(version, await deps.runtime.reply({ compiledPrompt: version.compiledPrompt, spec: version.spec, conversation: afterLearner, learnerMessage, sources }), sources, learnerMessage);
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
