import { describe, expect, it } from "vitest";
import en from "../../../messages/en/admin.json";
import pl from "../../../messages/pl/admin.json";

const leaves = (node: unknown, path = ""): [string, string][] =>
  typeof node === "string"
    ? [[path, node]]
    : Object.entries(node as object).flatMap(([k, v]) =>
        leaves(v, path ? `${path}.${k}` : k),
      );

describe("the logo studio's messages", () => {
  it("say one thing one way: the same English sentence has one Polish wording", () => {
    const polish = new Map(leaves(pl.logo));
    const seen = new Map<string, string>();
    const diverging: string[] = [];
    for (const [key, text] of leaves(en.logo)) {
      const first = seen.get(text);
      if (text.length > 20 && first && polish.get(first) !== polish.get(key))
        diverging.push(`${first} / ${key}`);
      seen.set(text, seen.get(text) ?? key);
    }
    expect(diverging).toEqual([]);
  });

  it("Polish never assumes the creator's gender", () => {
    const gendered = leaves(pl.logo).filter(([, text]) =>
      /\p{L}+(łeś|łaś)\b/iu.test(text),
    );
    expect(gendered).toEqual([]);
  });
});
