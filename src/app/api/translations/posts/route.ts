import { revalidateTag } from "next/cache";

import {
  pendingTranslationTag,
  translationKey,
} from "#lib/server/translations/translation.helper";
import { ensureTranslation } from "#lib/server/translations/translation.service";
import { fetchPost } from "#lib/shared/services/posts.service";
import { postTranslationRequestSchema } from "#lib/shared/translations/translation.schema";

export const maxDuration = 120;

export async function POST(request: Request): Promise<Response> {
  if (
    request.headers.get("purpose") === "prefetch" ||
    request.headers.get("sec-purpose")?.includes("prefetch")
  ) {
    return Response.json({ status: "unavailable" }, { status: 400 });
  }

  const payload: unknown = await request.json().catch(() => null);
  const parsed = postTranslationRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { message: "Invalid translation request" },
      { status: 400 },
    );
  }

  const { postId, kind, context, targetLocale } = parsed.data;
  try {
    const post = await fetchPost(postId);
    if (!post || post.status !== "show") {
      return Response.json({ message: "Post not found" }, { status: 404 });
    }

    const source = kind === "title" ? post.title : post.content;
    if (source !== context) {
      return Response.json(
        { message: "Post content has changed" },
        { status: 409 },
      );
    }

    const input = { context: source, targetLocale };
    const result = await ensureTranslation(input);
    if (result.status === "translated" || result.status === "unchanged") {
      try {
        // Refresh static pages even when an old missing result reaches this endpoint.
        revalidateTag(pendingTranslationTag(translationKey(input)), {
          expire: 0,
        });
      } catch {
        console.error("Translation cache refresh failed");
      }
    }
    return Response.json(result);
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
