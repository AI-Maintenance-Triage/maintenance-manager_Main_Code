import { TRPCError } from "@trpc/server";
import { ENV } from "./env";

export type NotificationPayload = {
  title: string;
  content: string;
};

const TITLE_MAX_LENGTH = 1200;
const CONTENT_MAX_LENGTH = 20000;

const trimValue = (value: string): string => value.trim();
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const buildEndpointUrl = (baseUrl: string): string => {
  const normalizedBase = baseUrl.endsWith("/")
    ? baseUrl
    : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};

const validatePayload = (input: NotificationPayload): NotificationPayload => {
  if (!isNonEmptyString(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required.",
    });
  }
  if (!isNonEmptyString(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required.",
    });
  }

  const title = trimValue(input.title);
  const content = trimValue(input.content);

  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`,
    });
  }

  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`,
    });
  }

  return { title, content };
};

/**
 * Send owner notification via Manus forge service.
 * Returns true on success, false on failure.
 */
async function notifyViaForge(title: string, content: string): Promise<boolean> {
  if (!ENV.forgeApiUrl || !ENV.forgeApiKey) return false;

  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1",
      },
      body: JSON.stringify({ title, content }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(`[Notification] Forge notification failed (${response.status})${detail ? `: ${detail}` : ""}`);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling forge notification service:", error);
    return false;
  }
}

/**
 * Send owner notification via email (Resend) as fallback.
 * Used when Manus forge is not available (e.g., DigitalOcean deployment).
 */
async function notifyViaEmail(title: string, content: string): Promise<boolean> {
  const ownerEmail = process.env.OWNER_EMAIL ?? process.env.EMAIL_FROM;
  if (!ENV.resendApiKey || !ownerEmail) {
    console.warn("[Notification] Email fallback not configured (RESEND_API_KEY or OWNER_EMAIL missing)");
    return false;
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(ENV.resendApiKey);
    const { error } = await resend.emails.send({
      from: ENV.emailFrom || "notifications@resend.dev",
      to: ownerEmail,
      subject: `[Maintenance Manager] ${title}`,
      html: `<h2>${title}</h2><pre style="white-space:pre-wrap;font-family:sans-serif">${content}</pre>`,
    });
    if (error) {
      console.warn("[Notification] Email notification failed:", error);
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error sending email notification:", error);
    return false;
  }
}

/**
 * Dispatches a project-owner notification.
 * On Manus: uses the Manus Notification Service.
 * On DigitalOcean / standalone: falls back to email via Resend.
 * Returns `true` if the notification was sent, `false` otherwise.
 */
export async function notifyOwner(
  payload: NotificationPayload
): Promise<boolean> {
  const { title, content } = validatePayload(payload);

  // Try Manus forge first
  if (ENV.forgeApiUrl && ENV.forgeApiKey) {
    const sent = await notifyViaForge(title, content);
    if (sent) return true;
  }

  // Fall back to email
  return notifyViaEmail(title, content);
}
