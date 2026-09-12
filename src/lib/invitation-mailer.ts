import "server-only";
import { renderEmailTemplate } from "@/emails/render";
import { sendEmail } from "@/lib/ses-client";
import { logger } from "@/lib/logger";
import { env } from "@/env";

interface SendInvitationEmailParams {
  to: string;
  inviteeName: string;
  bankName: string;
  rawToken: string;
  expiresAt: Date;
}

/**
 * Deliver an invitation link.
 *
 * The URL carries a live bearer credential, so it is built here, handed to SES,
 * and discarded. Only the addressee, the expiry, and the delivery outcome are
 * recorded. Never returns the link, and never throws: a delivery failure is an
 * operational problem to be retried by resending, not a reason to unwind the
 * user records that were already committed.
 */
export async function sendInvitationEmail(
  params: SendInvitationEmailParams,
): Promise<void> {
  const acceptUrl = `${env.NEXT_PUBLIC_APP_URL}/accept-invite?token=${params.rawToken}&email=${encodeURIComponent(params.to)}`;

  try {
    const { subject, html, text } = await renderEmailTemplate("invitation", {
      bankName: params.bankName,
      inviteeName: params.inviteeName,
      acceptUrl,
      expiresOn: params.expiresAt.toISOString().slice(0, 10),
    });

    const result = await sendEmail({
      to: params.to,
      subject,
      htmlBody: html,
      textBody: text,
    });

    if (result.success) {
      logger.info(
        {
          action: "invitation_email_sent",
          recipient: params.to,
          messageId: result.messageId,
          expiresAt: params.expiresAt,
        },
        "Invitation email sent",
      );
    } else {
      logger.error(
        {
          action: "invitation_email_failed",
          recipient: params.to,
          error: result.error,
        },
        "Invitation email could not be delivered",
      );
    }
  } catch (error) {
    logger.error(
      { error, action: "invitation_email_failed", recipient: params.to },
      "Invitation email could not be rendered or sent",
    );
  }
}
