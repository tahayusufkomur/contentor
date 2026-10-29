import { getLocale } from "next-intl/server";

import { PlatformHeaderBar } from "@/components/shared/platform-header-bar";
import { platformBlogHasPosts } from "@/lib/platform-blog";
import type { User } from "@/types/auth";

/** The marketing bar; its Blog link shows only in a language that has posts. */
export async function PlatformHeader({ user }: { user?: User | null }) {
  const showBlog = await platformBlogHasPosts(await getLocale());
  return <PlatformHeaderBar user={user} showBlog={showBlog} />;
}
