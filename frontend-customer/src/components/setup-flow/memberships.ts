// The memberships a coach can offer, each built on what they teach with
// (prototype catalogue; the brief owns this once the flow is decided).
export interface MembershipTier {
  label: string;
  price: string;
  /** Offers it needs, by their option label ("Digital Courses"). */
  needs: string[];
  perks: string[];
  blurb: string;
}

export const MEMBERSHIP_TIERS: MembershipTier[] = [
  {
    label: "Digital membership",
    price: "$9 a month",
    needs: ["Digital Courses"],
    perks: ["Every digital course", "New courses as they land"],
    blurb: "All the pre-recorded content, watched any time.",
  },
  {
    label: "Online membership",
    price: "$19 a month",
    needs: ["Live online classes"],
    perks: ["All live online classes", "Class replays", "Every digital course"],
    blurb: "Every live class from home, plus the courses.",
  },
  {
    label: "Studio membership",
    price: "$49 a month",
    needs: ["In-person sessions"],
    perks: ["Unlimited in-person sessions", "Every digital course"],
    blurb: "Train at your place as often as they like.",
  },
  {
    label: "Community membership",
    price: "$5 a month",
    needs: ["Community"],
    perks: ["The members' community", "Members-only articles"],
    blurb: "A place to talk, share and stay motivated.",
  },
  {
    label: "All-access",
    price: "$69 a month",
    needs: [],
    perks: ["Everything, online and in person"],
    blurb: "One membership for all of it.",
  },
];

/** The tiers a coach with these offers can run. */
export function tiersFor(offers: string[]): MembershipTier[] {
  const have = new Set(offers);
  return MEMBERSHIP_TIERS.filter(
    (t) =>
      t.needs.every((n) => have.has(n)) &&
      (t.needs.length > 0 || have.size > 1),
  );
}

export const tierByLabel = (label: string) =>
  MEMBERSHIP_TIERS.find((t) => t.label === label.trim());
