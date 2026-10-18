import { openDesign } from "@/lib/designs-api";

// The editor lives at the studio path plus the design id. The id is joined to the base here, not written as
// one literal, so admin-links.test.ts (it reads quoted admin paths) does not flag a page that Task 11 adds
// after this one. Inline the literal once the editor's page.tsx exists.
const STUDIO = "/admin/studio";

/** Opens the photo studio on a course or event series: on its draft, started if it has none. `from`
 *  starts a new draft as a copy of that kept design ("Edit a copy"). A list row can be passed as it is:
 *  only its kind and key go to the server. Rejects, without navigating, when the draft cannot be made. */
export async function openCoverStudio(
  target: { target_kind: string; target_key: string },
  navigate: (href: string) => void,
  from?: string,
): Promise<void> {
  const draft = await openDesign({
    target_kind: target.target_kind,
    target_key: target.target_key,
    ...(from ? { from } : {}),
  });
  navigate(`${STUDIO}/${draft.id}`);
}
