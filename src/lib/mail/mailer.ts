import "server-only";

import { SESv2Client, SendEmailCommand } from "@aws-sdk/client-sesv2";
import nodemailer from "nodemailer";
import { logger } from "@/lib/logger";

export interface SendEmailParams {
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  replyTo?: string;
}

export type SendEmailResult =
  | { success: true; messageId: string }
  | { success: false; error: string };

export interface Mailer {
  send(params: SendEmailParams): Promise<SendEmailResult>;
}

function disabledMailer(): Mailer {
  return {
    async send() {
      return {
        success: false,
        error: "Mail is disabled (MAIL_DRIVER=disabled)",
      };
    },
  };
}

function sesMailer(): Mailer {
  let client: SESv2Client | null = null;

  function getClient() {
    if (!client) {
      client = new SESv2Client({
        region: process.env.AWS_SES_REGION ?? "ap-south-1",
        ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
          ? {
              credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
              },
            }
          : {}),
      });
    }

    return client;
  }

  return {
    async send(params) {
      const fromEmail = process.env.SES_FROM_EMAIL;
      if (!fromEmail) {
        return { success: false, error: "SES_FROM_EMAIL is not configured" };
      }

      try {
        const response = await getClient().send(
          new SendEmailCommand({
            FromEmailAddress: fromEmail,
            Destination: { ToAddresses: [params.to] },
            ReplyToAddresses: params.replyTo ? [params.replyTo] : undefined,
            Content: {
              Simple: {
                Subject: {
                  Data: params.subject,
                  Charset: "UTF-8",
                },
                Body: {
                  Html: {
                    Data: params.htmlBody,
                    Charset: "UTF-8",
                  },
                  ...(params.textBody
                    ? {
                        Text: {
                          Data: params.textBody,
                          Charset: "UTF-8",
                        },
                      }
                    : {}),
                },
              },
            },
          }),
        );

        return { success: true, messageId: response.MessageId ?? "unknown" };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown SES error";
        logger.error(
          { error, action: "send_email_ses", to: params.to },
          "SES send email failed",
        );
        return { success: false, error: message };
      }
    },
  };
}

function smtpMailer(): Mailer {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;

  if (!host || !user || !password) {
    throw new Error(
      "SMTP_HOST, SMTP_USER and SMTP_PASSWORD are required when MAIL_DRIVER=smtp",
    );
  }

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass: password },
  });

  return {
    async send(params) {
      try {
        const info = await transport.sendMail({
          to: params.to,
          from: user,
          replyTo: params.replyTo,
          subject: params.subject,
          html: params.htmlBody,
          text: params.textBody,
        });

        return { success: true, messageId: info.messageId };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown SMTP error";
        logger.error(
          { error, action: "send_email_smtp", to: params.to },
          "SMTP send email failed",
        );
        return { success: false, error: message };
      }
    },
  };
}

let cached: Mailer | null = null;

export function getMailer(): Mailer {
  if (cached) {
    return cached;
  }

  const driver = process.env.MAIL_DRIVER ?? "ses";
  switch (driver) {
    case "disabled":
      cached = disabledMailer();
      break;
    case "smtp":
      cached = smtpMailer();
      break;
    case "ses":
      cached = sesMailer();
      break;
    default:
      throw new Error(`Unsupported MAIL_DRIVER: ${driver}`);
  }

  return cached;
}
