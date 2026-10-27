import {
  createElement,
  type ComponentProps,
  type FC,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import student from "../../../../messages/en/student.json";
import type { ReviewPage } from "@/lib/interview";
import type { SetupFlowApi } from "@/lib/setup-flow";
import { GoLivePanel } from "../golive-panel";

const page = (key: string, over: Partial<ReviewPage> = {}): ReviewPage => ({
  key,
  path: key === "home" ? "/" : `/${key}`,
  ok: false,
  building: false,
  ...over,
});

// The answer box's mic button reads its words from the student messages.
const Intl = NextIntlClientProvider as FC<{
  locale: string;
  timeZone: string;
  messages: { student: typeof student };
  children?: ReactNode;
}>;

function panel(
  pages: ReviewPage[],
  focus: ReviewPage,
  over: Partial<ComponentProps<typeof GoLivePanel>["review"] & object> = {},
  sending = false,
) {
  return renderToStaticMarkup(
    createElement(
      Intl,
      { locale: "en", timeZone: "UTC", messages: { student } },
      createElement(GoLivePanel, {
        guide: { question: "", ack: "" } as never,
        api: {} as SetupFlowApi,
        sending,
        activity: null,
        text: "",
        onText: () => {},
        onSend: () => {},
        onPublished: () => {},
        review: {
          pages,
          focus,
          shown: true,
          approving: false,
          onApprove: () => {},
          onEdit: () => {},
          onShow: () => {},
          ...over,
        },
      }),
    ),
  );
}

// The attribute, not the `disabled:` utility classes every button carries.
const DISABLED = / disabled=""/;

// The button that opens the page in the site's editor, as a tag.
const editButton = (html: string) =>
  /<button[^>]*>(?:(?!<\/button>).)*Edit this page<\/button>/.exec(html)?.[0];

describe("page review: Edit this page", () => {
  it("is offered beside the approval, for an unapproved page", () => {
    const home = page("home");
    const html = panel([home, page("about")], home);
    expect(editButton(html)).toBeDefined();
    expect(editButton(html)).not.toMatch(DISABLED);
    expect(html).toContain("This page looks good");
  });

  it("stays offered on an approved page, which stays approved", () => {
    const home = page("home", { ok: true });
    const html = panel([home, page("about")], home);
    expect(editButton(html)).toBeDefined();
    expect(html).toContain("Approved. 1 page to go.");
  });

  it("waits while any page is still being built, or a change is being made", () => {
    const home = page("home");
    const building = [home, page("about", { building: true })];
    expect(editButton(panel(building, home))).toMatch(DISABLED);
    expect(editButton(panel([home], home, {}, true))).toMatch(DISABLED);
  });

  it("is not offered when the preview shows some other page", () => {
    const home = page("home");
    expect(editButton(panel([home], home, { shown: false }))).toBeUndefined();
  });
});
