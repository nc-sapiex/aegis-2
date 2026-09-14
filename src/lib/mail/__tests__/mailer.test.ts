import { describe, expect, it, vi, beforeEach } from "vitest";

const sendMailMock = vi.fn(async () => ({ messageId: "smtp-msg-1" }));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: sendMailMock })),
  },
}));

const sesSendMock = vi.fn(async () => ({ MessageId: "ses-msg-1" }));
vi.mock("@aws-sdk/client-sesv2", () => ({
  // Arrow functions can't be `new`ed — SESv2Client is constructed with `new`.
  SESv2Client: vi.fn(function SESv2Client() {
    return { send: sesSendMock };
  }),
  SendEmailCommand: vi.fn(function SendEmailCommand(input: unknown) {
    return { input };
  }),
}));

describe("getMailer", () => {
  beforeEach(() => {
    vi.resetModules();
    sendMailMock.mockClear();
    sesSendMock.mockClear();
  });

  it("smtp driver calls nodemailer and returns the message id", async () => {
    vi.stubEnv("MAIL_DRIVER", "smtp");
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SMTP_PORT", "587");
    vi.stubEnv("SMTP_USER", "user");
    vi.stubEnv("SMTP_PASSWORD", "pass");
    vi.stubEnv("SES_FROM_EMAIL", "noreply@aegis.in");
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
        from: "noreply@aegis.in",
        subject: "Hi",
        html: "<p>hi</p>",
      }),
    );
    vi.unstubAllEnvs();
  });

  it("smtp driver falls back to the SMTP username when SES_FROM_EMAIL is unset", async () => {
    vi.stubEnv("MAIL_DRIVER", "smtp");
    vi.stubEnv("SMTP_HOST", "smtp.example.com");
    vi.stubEnv("SMTP_PORT", "587");
    vi.stubEnv("SMTP_USER", "user");
    vi.stubEnv("SMTP_PASSWORD", "pass");
    const { getMailer } = await import("../mailer");
    await getMailer().send({ to: "a@b.com", subject: "Hi", htmlBody: "x" });
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ from: "user" }),
    );
    vi.unstubAllEnvs();
  });

  it("the disabled driver throws loudly on first use", async () => {
    vi.stubEnv("MAIL_DRIVER", "disabled");
    const { getMailer } = await import("../mailer");
    await expect(
      getMailer().send({ to: "a@b.com", subject: "Hi", htmlBody: "x" }),
    ).rejects.toThrow(/mail is disabled/i);
    vi.unstubAllEnvs();
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
    vi.unstubAllEnvs();
  });

  it("ses driver calls SESv2Client and returns the message id", async () => {
    vi.stubEnv("MAIL_DRIVER", "ses");
    vi.stubEnv("SES_FROM_EMAIL", "noreply@aegis.in");
    const { getMailer } = await import("../mailer");
    const result = await getMailer().send({
      to: "a@b.com",
      subject: "Hi",
      htmlBody: "<p>hi</p>",
    });
    expect(result).toEqual({ success: true, messageId: "ses-msg-1" });
    expect(sesSendMock).toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
