import { describe, it, expect } from "vitest";
import { renderEmailTemplate } from "@/emails/render";

describe("password reset email", () => {
  it("renders the reset link and the user's name", async () => {
    const { subject, html, text } = await renderEmailTemplate(
      "password-reset",
      {
        bankName: "Pune Sahakari UCB",
        appUrl: "https://aegis.example",
        userName: "Asha Kulkarni",
        resetUrl: "https://aegis.example/reset-password?token=abc123",
      },
    );

    expect(subject).toBe("Reset your Pune Sahakari UCB password");
    expect(html).toContain("https://aegis.example/reset-password?token=abc123");
    expect(html).toContain("Asha Kulkarni");
    expect(text).toContain("Asha Kulkarni");
  });
});
