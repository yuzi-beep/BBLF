import { useEffect, useState } from "react";

import { requestPostTranslation } from "#lib/client/translations/translation.service";
import type {
  PostTranslationRequest,
  TranslationResult,
} from "#lib/shared/translations/translation.type";

export function usePostTranslation(
  { postId, kind, context, targetLocale }: PostTranslationRequest,
  initialResult: TranslationResult,
): TranslationResult {
  const [requestedResult, setRequestedResult] =
    useState<TranslationResult | null>(null);

  useEffect(() => {
    if (initialResult.status !== "missing") return;
    const controller = new AbortController();

    void requestPostTranslation(
      { postId, kind, context, targetLocale },
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) setRequestedResult(result);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setRequestedResult({ status: "unavailable" });
      });

    return () => controller.abort();
  }, [postId, kind, context, targetLocale, initialResult.status]);

  return initialResult.status === "missing"
    ? (requestedResult ?? initialResult)
    : initialResult;
}
