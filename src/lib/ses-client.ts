import "server-only";
import {
  SESv2Client,
  SendEmailCommand,
  type SendEmailCommandInput,
} from "@aws-sdk/client-sesv2";
import { logger } from "@/lib/logger";

// ─── SES Client Singleton ───────────────────────────────────────────────────

let sesClient: SESv2Client | null = null;

function getSESClient(): SESv2Client {
  if (!sesClient) {
    sesClient = new SESv2Client({
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
  return sesClient;
}

// ─── Send Email ─────────────────────────────────────────────────────────────

interface SendEmailParams {
  to: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
  replyTo?: string;
}

interface SendEmailResult {
  success: true;
  messageId: string;
}

interface SendEmailError {
  success: false;
  error: string;
}

export async function sendEmail(
  params: SendEmailParams,
): Promise<SendEmailResult | SendEmailError> {
  const fromEmail = process.env.SES_FROM_EMAIL ?? "noreply@aegis.in";

  const input: SendEmailCommandInput = {
    FromEmailAddress: fromEmail,
    Destination: {
      ToAddresses: [params.to],
    },
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
    ...(params.replyTo ? { ReplyToAddresses: [params.replyTo] } : {}),
  };

  try {
    const client = getSESClient();
    const command = new SendEmailCommand(input);
    const response = await client.send(command);

    return {
      success: true,
      messageId: response.MessageId ?? "unknown",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown SES error";
    logger.error(
      { error, action: "send_email_ses", to: params.to },
      "SES send email failed",
    );
    return {
      success: false,
      error: message,
    };
  }
}

// ─── Batch Send ─────────────────────────────────────────────────────────────

export async function sendBatchEmails(
  emails: SendEmailParams[],
): Promise<(SendEmailResult | SendEmailError)[]> {
  return Promise.all(emails.map(sendEmail));
}
