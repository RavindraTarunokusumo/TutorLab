import type { sendPreviewMessage } from "./service";

export function streamPreviewReply(
  reply: Awaited<ReturnType<typeof sendPreviewMessage>>,
) {
  const encoder = new TextEncoder();
  const pieces = reply.content.match(/.{1,80}(?:\s|$)/g) ?? [reply.content];

  return new ReadableStream({
    async start(controller) {
      for (const [index, text] of pieces.entries()) {
        controller.enqueue(
          encoder.encode(`event: delta\ndata: ${JSON.stringify({ text })}\n\n`),
        );
        if (index < pieces.length - 1) await new Promise((resolve) => setTimeout(resolve, 18));
      }
      controller.enqueue(
        encoder.encode(
          `event: final\ndata: ${JSON.stringify({ conversationId: reply.conversation.id, metadata: reply.metadata })}\n\n`,
        ),
      );
      controller.close();
    },
  });
}
