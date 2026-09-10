import { useState } from "react";

import type { TranslationResult } from "#lib/shared/translations/translation.type";

export function useTranslationDisplay(results: readonly TranslationResult[]) {
  const [showOriginal, setShowOriginal] = useState(false);

  return {
    showOriginal,
    hasTranslation: results.some((result) => result.status === "translated"),
    isPending: results.some((result) => result.status === "missing"),
    isUnavailable: results.some((result) => result.status === "unavailable"),
    toggleOriginal: () => setShowOriginal((value) => !value),
    getText: (original: string, result: TranslationResult): string =>
      !showOriginal && result.status === "translated" ? result.text : original,
  } as const;
}
