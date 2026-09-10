import { serve, sleep } from "bun";
import { z } from "zod";

const replySchema = z.object({
  text: z.string(),
  delayMs: z.number().nonnegative().default(0),
  status: z.number().int().default(200),
  finishReason: z.string().default("stop"),
});
const replies = new Map<string, z.infer<typeof replySchema>>();
const calls: string[] = [];

const server = serve({
  hostname: "127.0.0.1",
  port: Number(process.env.TRANSLATION_MOCK_PORT ?? 4318),
  idleTimeout: 120,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/__control" && request.method === "POST") {
      const config = z
        .record(z.string(), replySchema)
        .parse(await request.json());
      replies.clear();
      calls.length = 0;
      for (const [context, reply] of Object.entries(config))
        replies.set(context, reply);
      return Response.json({ ok: true });
    }
    if (path === "/__calls") return Response.json(calls);
    if (path !== "/v1/chat/completions")
      return new Response("Not found", { status: 404 });
    const body = z
      .object({
        messages: z.array(z.object({ role: z.string(), content: z.string() })),
      })
      .parse(await request.json());
    const user = body.messages.findLast((message) => message.role === "user");
    const { context } = z
      .object({ context: z.string() })
      .parse(JSON.parse(user?.content ?? "{}"));
    calls.push(context);
    const reply = replies.get(context);
    if (!reply)
      return Response.json(
        { error: { message: "No test reply configured" } },
        { status: 500 },
      );
    await sleep(reply.delayMs);
    if (reply.status !== 200)
      return Response.json(
        { error: { message: "Controlled failure" } },
        { status: reply.status },
      );
    return Response.json({
      id: "local-translation-test",
      object: "chat.completion",
      created: 0,
      model: "local-test",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: reply.text },
          finish_reason: reply.finishReason,
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    });
  },
});
console.log(`Translation mock listening on ${server.url}`);
