import { describe, it, expect } from "vitest";
import { renderEmailTemplate } from "@/emails/render";

describe("invitation email", () => {
  it("renders the accept link and the invitee's name", async () => {
    const { subject, html, text } = await renderEmailTemplate("invitation", {
      bankName: "Pune Sahakari UCB",
      appUrl: "https://aegis.example",
      inviteeName: "Asha Kulkarni",
      acceptUrl:
        "https://aegis.example/accept-invite?token=abc123&email=asha%40ucb.example",
      expiresOn: "11 Sep 2026",
    });

    expect(subject).toBe("[Pune Sahakari UCB] You have been invited to AEGIS");
    expect(html).toContain("https://aegis.example/accept-invite?token=abc123");
    expect(html).toContain("Asha Kulkarni");
    expect(text).toContain("11 Sep 2026");
  });
});
