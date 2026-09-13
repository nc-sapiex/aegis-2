import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMailMock = vi.fn(async () => ({ messageId: "smtp-msg-1" }));
vi.mock("nodemailer", () => ({
  default: { createTransport: vi.fn(() => ({ sendMail: sendMailMock })) },
}));

const sesSendMock = vi.fn(async () => ({ MessageId: "ses-msg-1" }));
vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: vi.fn(() => ({ send: sesSendMock })),
  SendEmailCommand: vi.fn((input) => ({ input })),
}));

describe("getMailer", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    sendMailMock.mockClear();
    sesSendMock.mockClear();
  });

  it("smtp driver calls nodemailer and returns the message id", async () => {
    vi.stubEnv("MAIL_DRIVER", "smtp");
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SMTP_PORT", "587");
    vi.stubEnv("SMTP_USER", "user");
    vi.stubEnv("SMTP_PASSWORD", "pass");
    const { getMailer } = await import("../mailer");
    const result = await getMailer().send({
      to: "a@b.com",
      subject: "Hi",
      htmlBody: "<p>hi</p>",
    });
    expect(result).toEqual({ success: true, messageId: "smtp-msg-1" });
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "a@b.com",
        subject: "Hi",
        html: "<p>hi</p>",
      }),
    );
  });

  it("the disabled driver throws loudly on first use", async () => {
    vi.stubEnv("MAIL_DRIVER", "disabled");
    const { getMailer } = await import("../mailer");
    await expect(
      getMailer().send({ to: "a@b.com", subject: "Hi", htmlBody: "x" }),
    ).rejects.toThrow(/mail is disabled/i);
  });

  it("a transport failure returns a structured error, never throws", async () => {
    vi.stubEnv("MAIL_DRIVER", "smtp");
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SMTP_PORT", "587");
    vi.stubEnv("SMTP_USER", "user");
    vi.stubEnv("SMTP_PASSWORD", "pass");
    sendMailMock.mockRejectedValueOnce(new Error("connection refused"));
    const { getMailer } = await import("../mailer");
    const result = await getMailer().send({
      to: "a@b.com",
      subject: "Hi",
      htmlBody: "x",
    });
    expect(result).toEqual({ success: false, error: "connection refused" });
  });
});
