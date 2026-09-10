import type { z } from "zod";

import type { Locale } from "#lib/shared/i18n/i18n.type";

import type {
  postTranslationRequestSchema,
  translationResultSchema,
} from "./translation.schema";

export type TranslationInput = {
  readonly context: string;
  readonly targetLocale: Locale;
};

export type TranslationResult = z.infer<typeof translationResultSchema>;
export type PostTranslationRequest = z.infer<
  typeof postTranslationRequestSchema
>;
