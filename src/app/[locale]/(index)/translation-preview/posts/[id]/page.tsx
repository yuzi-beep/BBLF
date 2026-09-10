import { ArrowLeft, Calendar, User } from "lucide-react";
import type { Metadata } from "next";
import { cacheTag } from "next/cache";
import { notFound } from "next/navigation";

import Link from "#components/shared/link.component";
import ScrollToTopButton from "#components/shared/scroll-to-top-button.component";
import { CACHE_TAGS } from "#lib/server/cache";
import { getLocale, getScopedT } from "#lib/server/i18n";
import { readTranslations } from "#lib/server/translations/translation.service";
import { fetchPost, fetchPosts } from "#lib/shared/services";
import { formatTime } from "#lib/shared/utils/date.helper";

import { TranslatedPost } from "./_components/translated-post.component";

const getPost = async (id: string) => {
  "use cache";
  cacheTag(CACHE_TAGS.post(id));
  return fetchPost(id);
};

export async function generateStaticParams() {
  const posts = await fetchPosts();
  const params = posts
    .filter((post) => post.status === "show")
    .map((post) => ({ id: post.id }));
  return params.length
    ? params
    : [{ id: "00000000-0000-0000-0000-000000000000" }];
}

type Props = { readonly params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const post = await getPost((await params).id);
  return {
    title: post?.status === "show" ? post.title : "Post not found",
    description:
      post?.status === "show" ? post.content.substring(0, 150) : undefined,
    robots: { index: false, follow: false },
  };
}

export default async function TranslationPreviewPage({ params }: Props) {
  const post = await getPost((await params).id);
  if (!post || post.status !== "show") notFound();
  const locale = await getLocale();
  const t = await getScopedT((d) => d.postDetail);
  const content = post.content;
  const [titleResult, bodyResult] = await readTranslations([
    { context: post.title, targetLocale: locale },
    { context: content, targetLocale: locale },
  ]);
  return (
    <article className="mx-auto flex w-full flex-1 flex-col px-4 pt-10 pb-10">
      <TranslatedPost
        key={JSON.stringify([post.id, locale, post.title, content])}
        postId={post.id}
        title={post.title}
        body={content}
        locale={locale}
        initialTitleResult={titleResult}
        initialBodyResult={bodyResult}
      >
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
          {post.author && (
            <span className="flex items-center gap-1">
              <User className="h-4 w-4" />
              {post.author}
            </span>
          )}
          {post.published_at && (
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              {formatTime(post.published_at, "MMMM D, YYYY")}
            </span>
          )}
        </div>
        {post.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <span
                key={tag.id}
                className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800 dark:bg-gray-800 dark:text-gray-200"
              >
                #{tag.name}
              </span>
            ))}
          </div>
        )}
      </TranslatedPost>
      <footer className="mt-auto">
        <hr className="my-8 border-gray-200 dark:border-gray-800" />
        <div className="flex items-center justify-between">
          <Link
            href="/posts"
            className="flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-gray-900 dark:hover:text-gray-100"
          >
            <ArrowLeft className="h-4 w-4" />
            {t((d) => d.backToPosts)}
          </Link>
          <ScrollToTopButton />
        </div>
      </footer>
    </article>
  );
}
