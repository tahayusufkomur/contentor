import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Img } from "../kit";

/** The classes of the photo `Img` draws for `value`. */
function photoClasses(value: object, imgClassName?: string): string[] {
  const html = renderToStaticMarkup(
    createElement(Img, {
      value: { url: "https://cdn.test/photo.jpg", ...value },
      imgClassName,
    }),
  );
  return (/data-site-img="[^"]*" class="([^"]*)"/.exec(html)?.[1] ?? "").split(
    " ",
  );
}

describe("Img crops toward the subject", () => {
  it("keeps the side the library saw the subject on", () => {
    expect(photoClasses({ subject_placement: "left_third" })).toContain(
      "object-[25%_30%]",
    );
    expect(photoClasses({ subject_placement: "right_third" })).toContain(
      "object-[75%_30%]",
    );
  });

  it("aims high in the middle when the subject is centred or not known", () => {
    for (const placement of ["centered", "off_center", null, undefined]) {
      expect(photoClasses({ subject_placement: placement })).toContain(
        "object-[50%_30%]",
      );
    }
  });

  it("leaves a section's own aim alone", () => {
    const classes = photoClasses(
      { subject_placement: "right_third" },
      "object-[50%_20%]",
    );
    expect(classes).toContain("object-[50%_20%]");
    expect(classes.filter((c) => c.startsWith("object-["))).toHaveLength(1);
  });
});
