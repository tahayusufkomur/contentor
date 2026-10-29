import { describe, expect, it } from "vitest";
import { createTranslator } from "next-intl";
import en from "../../../../messages/en/admin.json";
import pl from "../../../../messages/pl/admin.json";
import type { RecurringAnnouncement } from "@/lib/announcements";
import { summary } from "../announcement-recurring-list";

const weekly = (weekday: number): RecurringAnnouncement =>
  ({
    frequency: "weekly",
    weekday,
    send_time: "09:00:00",
    day_of_month: null,
  }) as RecurringAnnouncement;

const line = (locale: string, messages: unknown, r: RecurringAnnouncement) =>
  summary(
    r,
    createTranslator({
      locale,
      messages: { admin: messages } as never,
      namespace: "admin.messages.recurring" as never,
    }) as never,
  );

describe("a repeating message's schedule line", () => {
  it("reads as before in English", () => {
    expect(line("en", en, weekly(2))).toBe("Every Wednesday at 09:00");
    expect(line("en", en, { ...weekly(0), frequency: "daily" })).toBe(
      "Daily at 09:00",
    );
  });

  it("is one whole message per weekday, so Polish can put it in the accusative", () => {
    const days = [
      "poniedziałek",
      "wtorek",
      "środę",
      "czwartek",
      "piątek",
      "sobotę",
      "niedzielę",
    ];
    days.forEach((day, i) =>
      expect(line("pl", pl, weekly(i))).toMatch(new RegExp(`${day} o 09:00$`)),
    );
    // Nominative forms ("środa") would be wrong after "w każdą".
    expect(line("pl", pl, weekly(2))).not.toContain("środa");
  });
});
