import { createElement, type FC, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import admin from "../../../../messages/en/admin.json";
import type { GuideHelp } from "@/lib/setup-flow";
import { HelpPicture } from "../help-pictures";
import { QuestionHelp } from "../question-help";

const help = (over: Partial<GuideHelp>): GuideHelp => ({
  term: "How do memberships work?",
  tip: "Each one is its own monthly subscription.",
  example: "The Club, €19 a month, covers every live session.",
  picture: "membership",
  sign: "€",
  ...over,
});
const Intl = NextIntlClientProvider as FC<{
  locale: string;
  messages: { admin: typeof admin };
  children?: ReactNode;
}>;
const render = (node: ReactNode) =>
  renderToStaticMarkup(
    createElement(Intl, { locale: "en", messages: { admin } }, node),
  );

describe("QuestionHelp", () => {
  it("shows the example under the question and the ⓘ closed, until it is tapped", () => {
    const html = render(createElement(QuestionHelp, { help: help({}) }));
    expect(html).toContain("e.g. The Club, €19 a month");
    expect(html).toContain("How do memberships work?");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("monthly subscription");
  });

  it("is only an example when there is nothing more to open", () => {
    const html = render(
      createElement(QuestionHelp, {
        help: help({ term: "", tip: "", picture: "" }),
      }),
    );
    expect(html).toContain("e.g. ");
    expect(html).not.toContain("<button");
  });

  it("draws nothing for a question without help", () => {
    expect(render(createElement(QuestionHelp, { help: null }))).toBe("");
    expect(render(createElement(QuestionHelp, {}))).toBe("");
  });
});

describe("HelpPicture", () => {
  // The names backend interview_brief.Help.picture uses.
  const KINDS = [
    "team",
    "site",
    "look",
    "pay",
    "membership",
    "access",
    "course",
    "live",
    "inbox",
  ];

  it("draws every picture a question can name", () => {
    for (const kind of KINDS)
      expect(
        render(createElement(HelpPicture, { kind, sign: "$" })),
        kind,
      ).not.toBe("");
  });

  it("puts her currency sign on the prices", () => {
    const html = render(createElement(HelpPicture, { kind: "pay", sign: "€" }));
    expect(html).toContain("€49");
    expect(html).not.toContain("$49");
  });

  it("only loops under motion-safe, so reduced motion gets the still picture", () => {
    const html = render(
      createElement(HelpPicture, { kind: "course", sign: "$" }),
    );
    expect(html).toContain("motion-safe:animate-[sf-help-wave");
    expect(html).not.toMatch(/(^|[\s"])animate-\[/);
  });

  it("draws nothing for an unknown picture", () => {
    expect(
      render(createElement(HelpPicture, { kind: "nope", sign: "$" })),
    ).toBe("");
  });
});
