import type { NextRequest } from "next/server";
import { ALL_ROLES, requireRole } from "@/lib/auth";
import { subscribeRealtime } from "@/lib/realtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<Response> {
  const auth = await requireRole(ALL_ROLES);
  if ("error" in auth) return auth.error;

  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      const unsubscribe = subscribeRealtime({
        role: auth.user.role,
        onEvent: (payload) => {
          send(`event: ${payload.type}\ndata: ${JSON.stringify(payload)}\n\n`);
        },
      });

      send(
        `event: hello\ndata: ${JSON.stringify({
          serverNow: new Date().toISOString(),
          role: auth.user.role,
        })}\n\n`,
      );

      const heartbeat = setInterval(() => send(": ping\n\n"), 15_000);

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      cleanup = close;
      request.signal.addEventListener("abort", close);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
