import * as atoms from "./atoms";
import type { CxRender } from "./context";
import { Layout } from "./layout-embed";
import * as patterns from "./patterns";

/** Catalog primitive name → renderer (parity-tested against primitives.json). */
export const CX_PRIMITIVES: Record<string, CxRender> = {
  Sequence: atoms.Sequence,
  Section: atoms.Section,
  Layout,
  Opener: atoms.Opener,
  Heading: atoms.Heading,
  Text: atoms.Text,
  Rich: atoms.Rich,
  Label: atoms.Label,
  Num: atoms.Num,
  Img: atoms.ImgNode,
  Button: atoms.Button,
  Link: atoms.LinkNode,
  Badge: atoms.Badge,
  Icon: atoms.Icon,
  Card: atoms.Card,
  Stack: atoms.Stack,
  Ornament: atoms.Ornament,
  Split: patterns.Split,
  Grid: patterns.Grid,
  Rows: patterns.Rows,
  Timeline: patterns.Timeline,
  Steps: patterns.Steps,
  Band: patterns.Band,
};
