import { z } from "zod";

import { locales } from "#lib/shared/i18n/i18n.const";

export const postTranslationRequestSchema = z
  .object({
    postId: z.uuid(),
    kind: z.enum(["title", "body"]),
    context: z.string(),
    targetLocale: z.enum(locales),
  })
  .readonly();

export const translationResultSchema = z
  .discriminatedUnion("status", [
    z.object({ status: z.literal("translated"), text: z.string() }),
    z.object({ status: z.literal("unchanged") }),
    z.object({ status: z.literal("missing") }),
    z.object({ status: z.literal("unavailable") }),
  ])
  .readonly();
