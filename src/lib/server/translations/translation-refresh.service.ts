import "server-only";
import { revalidateTag } from "next/cache";
import { after } from "next/server";
import { cache } from "react";

import { pendingTranslationTag } from "./translation.helper";

// Called only after connection(), outside all persistent cache scopes.
export const getTranslationRefresh = cache(() => {
  const tags = new Set<string>();
  after(() => {
    try {
      for (const tag of tags) {
        try {
          revalidateTag(tag, { expire: 0 });
        } catch {
          console.error("Translation cache refresh failed");
        }
      }
    } finally {
      tags.clear();
    }
  });
  return (key: string) => {
    tags.add(pendingTranslationTag(key));
  };
});
