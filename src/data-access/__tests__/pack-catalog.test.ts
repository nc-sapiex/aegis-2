import { describe, expect, it } from "vitest";
import { buildCatalogView } from "../pack-catalog";

describe("buildCatalogView", () => {
  const catalog = [
    { packCode: "core", version: "1.0.0", name: "AEGIS Core" },
    { packCode: "example-forex", version: "1.0.0", name: "Example Forex" },
    { packCode: "gold-loans", version: "1.0.0", name: "Gold Loans" },
  ];

  it("marks an installed pack as installed", () => {
    const view = buildCatalogView(
      [{ packCode: "core", version: "1.0.0" }],
      catalog,
      [],
    );
    expect(view.find((c) => c.packCode === "core")?.status).toBe("installed");
  });

  it("marks a licensed-but-not-installed pack as available", () => {
    const view = buildCatalogView([], catalog, ["pack:example-forex@*"]);
    expect(view.find((c) => c.packCode === "example-forex")?.status).toBe(
      "available",
    );
  });

  it("marks an unlicensed pack as not-licensed, muted, with the exact copy", () => {
    const view = buildCatalogView([], catalog, []);
    const entry = view.find((c) => c.packCode === "gold-loans");
    expect(entry?.status).toBe("not-licensed");
    expect(entry?.message).toBe(
      "Not in this bank's license. Contact Nexly to add it.",
    );
  });
});
