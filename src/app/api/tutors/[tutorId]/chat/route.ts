import { NextResponse } from "next/server";
import { z } from "zod";
import { requireProjectAccess, ProjectAccessError } from "@/lib/projects/service";
import { getOrCreatePreviewConversation, PreviewConversationBusyError, resetPreviewConversation, sendPreviewMessage } from "@/lib/conversations/service";

const MessageSchema = z.strictObject({ projectId: z.string().trim().min(1).max(96), conversationId: z.string().trim().min(1).max(96).optional(), message: z.string().trim().min(1).max(12_000) });
const ResetSchema = z.strictObject({ projectId: z.string().trim().min(1).max(96) });

function error(error: unknown) {
  if (error instanceof PreviewConversationBusyError) return NextResponse.json({ error: "A preview update is already in progress" }, { status: 409 });
  if (error instanceof ProjectAccessError) return NextResponse.json({ error: error.status === 401 ? "Unauthorized" : "Not found" }, { status: error.status });
  if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Invalid chat request" }, { status: 400 });
  if (error instanceof Error && /not found/i.test(error.message)) return NextResponse.json({ error: "Tutor or conversation not found" }, { status: 404 });
  throw error;
}

export function streamPreviewReply(reply: Awaited<ReturnType<typeof sendPreviewMessage>>) {
  const encoder = new TextEncoder();
  const pieces = reply.content.match(/.{1,80}(?:\s|$)/g) ?? [reply.content];
  return new ReadableStream({
    start(controller) {
      for (const text of pieces) controller.enqueue(encoder.encode(`event: delta\ndata: ${JSON.stringify({ text })}\n\n`));
      controller.enqueue(encoder.encode(`event: final\ndata: ${JSON.stringify({ conversationId: reply.conversation.id, metadata: reply.metadata })}\n\n`));
      controller.close();
    },
  });
}

export async function GET(request: Request, { params }: { params: Promise<{ tutorId: string }> }) {
  try {
    const { tutorId } = await params;
    const projectId = new URL(request.url).searchParams.get("projectId");
    if (!projectId) return NextResponse.json({ error: "Missing project ID" }, { status: 400 });
    await requireProjectAccess(request, projectId);
    const conversation = await getOrCreatePreviewConversation({ projectId, tutorVersionId: tutorId });
    return NextResponse.json({ conversation });
  } catch (caught) { return error(caught); }
}

export async function POST(request: Request, { params }: { params: Promise<{ tutorId: string }> }) {
  try {
    const { tutorId } = await params;
    const body = MessageSchema.parse(await request.json());
    await requireProjectAccess(request, body.projectId);
    const reply = await sendPreviewMessage({ projectId: body.projectId, tutorVersionId: tutorId, conversationId: body.conversationId, message: body.message });
    return new Response(streamPreviewReply(reply), { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform" } });
  } catch (caught) { return error(caught); }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ tutorId: string }> }) {
  try {
    const { tutorId } = await params;
    const body = ResetSchema.parse(await request.json());
    await requireProjectAccess(request, body.projectId);
    return NextResponse.json({ conversation: await resetPreviewConversation(body.projectId, tutorId) });
  } catch (caught) { return error(caught); }
}
