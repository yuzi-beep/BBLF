import { translationResultSchema } from "#lib/shared/translations/translation.schema";
import type {
  PostTranslationRequest,
  TranslationResult,
} from "#lib/shared/translations/translation.type";

export async function requestPostTranslation(
  input: PostTranslationRequest,
  signal: AbortSignal,
): Promise<TranslationResult> {
  const response = await fetch("/api/translations/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) throw new Error("Translation request failed");
  return translationResultSchema.parse(await response.json());
}
