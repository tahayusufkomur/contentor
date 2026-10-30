import { createElement } from "react";
import { describe, expect, it } from "vitest";
import adminDe from "../../../../messages/de/admin.json";
import adminEn from "../../../../messages/en/admin.json";
import siteDe from "../../../../../packages/shared/src/i18n/messages/de/site.json";
import {
  approveTurn,
  DELEGATE_TEXT,
  REDRAFT_TEXT,
  skipBioTurn,
} from "@/lib/setup-flow";
import { setupT } from "@/lib/__tests__/setup-t";
import type { QuestionStep } from "@/lib/interview";
import { BioScreen } from "../opening-screens";
import { QuestionScreen } from "../question-screen";
import { renderFor } from "./intl";

const de = { locale: "de", admin: adminDe, site: siteDe };
const step = (answer: string): QuestionStep => ({
  ack: "",
  question: "Frage?",
  options: [],
  field: "course_review",
  can_delegate: false,
  answer,
});
const revisit = (answer: string) =>
  renderFor(
    createElement(QuestionScreen, {
      step: step(answer),
      // A review screen: the creator's turn here is an approval or a redraft request.
      cards: { kind: "course", status: "waiting", item: null },
      brandName: "",
      host: "x.test",
      live: false,
      sending: false,
      draft: {},
      onDraft: () => {},
      onSend: () => {},
      onMoreLogos: async () => ({ kind: "logo", options: [] }),
      onCover: async () => undefined,
      onNext: () => {},
      dir: "next",
    } as never),
    de,
  );

// The creator's own turns are kept in the transcript and shown back as "You said".
describe("a German creator who goes back to an answered question", () => {
  it("reads her redraft request in German (the sent text stays English: the backend reads 'from scratch')", () => {
    const html = revisit(REDRAFT_TEXT);
    expect(html).toContain(adminDe.setupFlow.question.redraftSaid);
    expect(html).not.toContain(REDRAFT_TEXT);
  });

  it("reads 'you decide for me' in German", () => {
    const html = revisit(DELEGATE_TEXT);
    expect(html).toContain(adminDe.setupFlow.question.delegateSaid);
  });

  it("reads her approval in German, still an 'ok' choice", () => {
    const turn = approveTurn("course_review", setupT("de", adminDe));
    expect(turn).toEqual({
      message: adminDe.setupFlow.question.approvedAnswer,
      choice: { field: "course_review", value: "ok" },
    });
    expect(turn.message).not.toBe(adminEn.setupFlow.question.approvedAnswer);
    expect(revisit(turn.message)).toContain(turn.message);
  });

  it("reads her skipped bio in German, still a 'none' choice", () => {
    const turn = skipBioTurn(setupT("de", adminDe));
    expect(turn.choice).toEqual({ field: "bio", value: "none" });
    expect(turn.message).not.toBe(adminEn.setupFlow.opening.skipAnswer);
    const html = renderFor(
      createElement(BioScreen, {
        step: { ...step(turn.message), field: "bio" },
        live: false,
        sending: false,
        onSend: () => {},
        onNext: () => {},
        onShare: async () => undefined,
        dir: "next",
      } as never),
      de,
    );
    expect(html).toContain(turn.message);
  });
});
