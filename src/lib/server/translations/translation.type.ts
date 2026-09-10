import type { Locale } from "#lib/shared/i18n/i18n.type";

export type TranslationInput = {
  readonly context: string;
  readonly targetLocale: Locale;
};

export type TranslationResult =
  | { readonly status: "translated"; readonly text: string }
  | { readonly status: "unchanged" }
  | { readonly status: "missing" }
  | { readonly status: "unavailable" };
