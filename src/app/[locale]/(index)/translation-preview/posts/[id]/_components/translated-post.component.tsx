"use client";

import type { ReactNode } from "react";

import { PostContent } from "#components/features/content";
import PostTableOfContents from "#components/features/posts/post-table-of-contents.component";
import { useTranslationDisplay } from "#components/features/translations/translation-display.hook";
import { TranslationToggle } from "#components/features/translations/translation-toggle.component";
import CopyButton from "#components/ui/copy-button.component";
import { useT } from "#i18n";
import type { Locale } from "#lib/shared/i18n/i18n.type";
import type { TranslationResult } from "#lib/shared/translations/translation.type";
import { getMarkdownHeadings } from "#lib/shared/utils/markdown.helper";

import { usePostTranslation } from "./post-translation.hook";

type TranslatedPostProps = {
  readonly postId: string;
  readonly title: string;
  readonly body: string;
  readonly locale: Locale;
  readonly initialTitleResult: TranslationResult;
  readonly initialBodyResult: TranslationResult;
  readonly children: ReactNode;
};

export function TranslatedPost({
  postId,
  title,
  body,
  locale,
  initialTitleResult,
  initialBodyResult,
  children,
}: TranslatedPostProps) {
  const titleResult = usePostTranslation(
    { postId, kind: "title", context: title, targetLocale: locale },
    initialTitleResult,
  );
  const bodyResult = usePostTranslation(
    { postId, kind: "body", context: body, targetLocale: locale },
    initialBodyResult,
  );
  const display = useTranslationDisplay([titleResult, bodyResult]);
  const displayedTitle = display.getText(title, titleResult);
  const displayedBody = display.getText(body, bodyResult);
  const headings = getMarkdownHeadings(displayedBody).filter(
    (heading) => heading.depth >= 2 && heading.depth <= 4,
  );
  const t = useT();
  const status = display.isPending
    ? t((d) => d.translation.pending)
    : display.isUnavailable
      ? t((d) => d.translation.unavailable)
      : "";

  return (
    <>
      <header>
        <h1 className="text-4xl leading-tight font-bold">{displayedTitle}</h1>
        {children}
      </header>
      <hr className="my-8 border-gray-200 dark:border-gray-800" />
      <div className="relative mb-4 flex h-8 items-center justify-end text-sm text-(--text-muted)">
        <output
          className="absolute left-0 max-w-[calc(100%-11rem)] truncate text-xs"
          title={status || undefined}
          aria-live="polite"
        >
          {status}
        </output>
        <div className="relative inline-flex">
          {display.hasTranslation && (
            <TranslationToggle
              showOriginal={display.showOriginal}
              onToggle={display.toggleOriginal}
              className="absolute top-1/2 right-full mr-2 -translate-y-1/2"
            />
          )}
          <CopyButton content={displayedBody} />
        </div>
      </div>
      <PostContent content={displayedBody} />
      <PostTableOfContents
        headings={headings}
        title={t((d) => d.postDetail.tableOfContents)}
        className="fixed top-24 right-(--layout-padding-x) hidden translate-x-full xl:block"
      />
    </>
  );
}
