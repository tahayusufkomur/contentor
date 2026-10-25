import type { ComponentType } from "react";
import type { StyleKit } from "../kit-contract";
import type { SectionComponent, SectionProps, StyleSections } from "../types";
import { ProofNeutral } from "./proof";
import { StatementNeutral } from "./statement";
import { VideoNeutral } from "./video";

export type NeutralFamily = "proof" | "statement" | "video";

function bind(
  Layout: ComponentType<SectionProps & { kit: StyleKit }>,
  kit: StyleKit,
): SectionComponent {
  function Neutral(props: SectionProps) {
    return <Layout {...props} kit={kit} />;
  }
  Neutral.displayName = `${Layout.name}(${kit.id})`;
  return Neutral;
}

/** The families every style shows the same way, in its own kit, until a style
 *  designs its own layout (a flagship's joins `neutral`, never replaces it). */
export function neutralSections(
  kit: StyleKit,
): Pick<StyleSections, NeutralFamily> {
  return {
    proof: { neutral: bind(ProofNeutral, kit) },
    statement: { neutral: bind(StatementNeutral, kit) },
    video: { neutral: bind(VideoNeutral, kit) },
  };
}
