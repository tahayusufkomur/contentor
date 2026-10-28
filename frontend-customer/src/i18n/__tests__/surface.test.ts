import { describe, expect, it } from "vitest";
import { namespacesFor, surfaceOf } from "../surface";

describe("surfaceOf", () => {
  it("studio paths follow the creator", () => {
    expect(surfaceOf("/admin/courses", null, "owner")).toBe("studio");
    expect(surfaceOf("/setup", null, "owner")).toBe("studio");
  });
  it("the owner on their own site", () =>
    expect(surfaceOf("/courses", null, "coach")).toBe("site+owner"));
  it("the full editor frame is the owner's", () =>
    expect(surfaceOf("/", "edit", "owner")).toBe("site+owner"));
  it("the setup preview frame is the plain site", () =>
    expect(surfaceOf("/", "1", "owner")).toBe("site"));
  it("a student or visitor gets the site", () => {
    expect(surfaceOf("/courses", null, "student")).toBe("site");
    expect(surfaceOf("/courses", null)).toBe("site");
  });
  it("/administrator is not /admin", () =>
    expect(surfaceOf("/administrator", null)).toBe("site"));
});

describe("namespacesFor", () => {
  it("a student never gets studio strings", () =>
    expect(namespacesFor("site").creator).toEqual([]));
  it("studio and site+owner", () => {
    expect(namespacesFor("studio")).toEqual({
      creator: ["common", "admin", "studio"],
      site: ["site", "student", "pwa"],
    });
    expect(namespacesFor("site+owner")).toEqual({
      creator: ["admin", "studio"],
      site: ["common", "site", "student", "pwa"],
    });
  });
});
