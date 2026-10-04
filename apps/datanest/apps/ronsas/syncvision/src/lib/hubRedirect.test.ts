import { describe, expect, it } from "vitest";
import { resolveHubRedirect } from "./hubRedirect";

describe("DataNest hosted Sync Vision", () => {
  it("keeps the public app entry point on DataNest", () => {
    expect(resolveHubRedirect({
      hostname: "datanest-supository.github.io",
      pathname: "/",
      search: "",
      hash: "",
    })).toBeNull();
  });

  it("still redirects a public spoke entry point to the hub", () => {
    expect(resolveHubRedirect({
      hostname: "syncvision.life",
      pathname: "/",
      search: "",
      hash: "",
    })).toBe("https://www.reson8.life/apps/sync-vision");
  });
});
