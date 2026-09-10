"use client";

import { useState } from "react";

import { PostContent } from "#components/features/content";
import PostTableOfContents from "#components/features/posts/post-table-of-contents.component";
import CopyButton from "#components/ui/copy-button.component";
import { useT } from "#i18n";
import type { TranslationResult } from "#lib/server/translations/translation.type";
import type { Locale } from "#lib/shared/i18n/i18n.type";
import { getMarkdownHeadings } from "#lib/shared/utils/markdown.helper";

export type TranslationUnitProps = {
  readonly original: string;
  readonly locale: Locale;
  readonly kind: "title" | "body";
  readonly result: TranslationResult;
};

export function TranslationUnit({
  original,
  locale,
  kind,
  result,
}: TranslationUnitProps) {
  const [showOriginal, setShowOriginal] = useState(false);
  const t = useT().scope((d) => d.postDetail);
  const text =
    result.status === "translated" && !showOriginal ? result.text : original;
  const headings =
    kind === "body"
      ? getMarkdownHeadings(text).filter(
          (heading) => heading.depth >= 2 && heading.depth <= 4,
        )
      : [];
  const chinese = locale === "zh-CN";
  return (
    <section
      aria-label={
        kind === "title"
          ? chinese
            ? "文章标题"
            : "Post title"
          : chinese
            ? "文章正文"
            : "Post body"
      }
    >
      <div className="mb-4 flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
        {result.status === "translated" && (
          <button
            type="button"
            className="rounded border border-gray-300 px-3 py-1 hover:text-gray-900 dark:border-gray-700 dark:hover:text-gray-100"
            aria-pressed={showOriginal}
            onClick={() => setShowOriginal((value) => !value)}
          >
            {showOriginal
              ? chinese
                ? "显示译文"
                : "Show translation"
              : chinese
                ? "显示原文"
                : "Show original"}
          </button>
        )}
        {result.status === "missing" && (
          <output>{chinese ? "翻译中…" : "Translating…"}</output>
        )}
        {result.status === "unavailable" && (
          <output>
            {chinese ? "翻译暂不可用" : "Translation temporarily unavailable"}
          </output>
        )}
        {kind === "body" && <CopyButton content={text} className="ml-auto" />}
      </div>
      {kind === "title" ? (
        <h1 className="text-4xl leading-tight font-bold">{text}</h1>
      ) : (
        <>
          <PostContent content={text} />
          <PostTableOfContents
            headings={headings}
            title={t((d) => d.tableOfContents)}
            className="fixed top-24 right-(--layout-padding-x) hidden translate-x-full xl:block"
          />
        </>
      )}
    </section>
  );
}
