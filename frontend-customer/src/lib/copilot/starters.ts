/** Starter prompts for the admin page she is on. Each value is a key of
 * `dock.starters` in messages/en/admin.json (an array of prompts). Longest
 * prefix wins; a course's own page has its own set. No model call. */
const PAGES: [prefix: string, key: string][] = [
  ["/admin/courses/new", "courses"],
  ["/admin/courses/", "course"],
  ["/admin/courses", "courses"],
  ["/admin/live", "events"],
  ["/admin/blog", "blog"],
  ["/admin/messages", "announcements"],
  ["/admin/students", "students"],
  ["/admin/community", "students"],
  ["/admin/payouts", "money"],
  ["/admin/store", "money"],
  ["/admin/billing", "money"],
  ["/admin/media", "media"],
];

export function starterKey(pathname: string): string {
  return (
    PAGES.find(
      ([prefix]) =>
        pathname === prefix ||
        pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`),
    )?.[1] ?? "home"
  );
}
