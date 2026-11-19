import { HOUSE } from "../billing/ledger";
import { recordUsage } from "../billing/usage";
import { Resend } from "resend";
import { BRAND_NAME } from "@shared/brand";

export interface PasswordResetEmailData {
  username: string;
  email: string;
  resetUrl: string;
}

// Created on first use, so importing this module (through billing) never needs the key.
let client: Resend | undefined;
const resend = () => (client ??= new Resend(process.env.RESEND_API_KEY));

/**
 * Send a password reset email
 */
export async function sendPasswordResetEmail(data: PasswordResetEmailData): Promise<{ success: boolean; error?: any }> {
  const { username, email, resetUrl } = data;

  const emailConfig = {
    to: email,
    from: "no-reply@xendelta.com",
    subject: `${BRAND_NAME} - Password Reset`,
    text: `Click the link below to reset your password. This link will expire in 1 hour.\n\n${resetUrl}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Password Reset Request</h2>
        <p>Hello ${username},</p>
        <p>You requested a password reset for your ${BRAND_NAME} account. Click the button below to reset your password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background: linear-gradient(45deg, #667eea 30%, #764ba2 90%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">Reset Password</a>
        </div>
        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #666;">${resetUrl}</p>
        <p><strong>This link will expire in 1 hour for security reasons.</strong></p>
        <p>If you didn't request this password reset, please ignore this email.</p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="color: #666; font-size: 12px;">This is an automated message from ${BRAND_NAME}.</p>
      </div>
    `,
  };

  try {
    const { error } = await resend().emails.send(emailConfig);

    if (error) {
      return { success: false, error };
    }

    await recordUsage(HOUSE, "email", 1); // one email on the house's bill (billing/usage.ts)
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
}

export interface NotificationEmailData {
  username: string;
  email: string;
  title: string;
  message: string;
  link?: string;
}

/**
 * Send a general notification email. Used by the "email" channel of notify().
 */
export async function sendNotificationEmail(data: NotificationEmailData): Promise<{ success: boolean; error?: any }> {
  const { username, email, title, message, link } = data;

  // Notification links are stored as app-relative paths (e.g. /internal/xensplit/groups/x),
  // which are useless in an inbox — absolutise them against the deployed origin.
  const baseUrl = process.env.PUBLIC_URL || "https://xendelta.com";
  const absoluteLink = link ? new URL(link, baseUrl).toString() : null;

  const emailConfig = {
    to: email,
    from: "no-reply@xendelta.com",
    subject: `${BRAND_NAME} - ${title}`,
    text: `${title}\n\n${message}${absoluteLink ? `\n\n${absoluteLink}` : ""}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">${title}</h2>
        <p>Hello ${username},</p>
        <p>${message}</p>
        ${
          absoluteLink
            ? `<div style="text-align: center; margin: 30px 0;">
          <a href="${absoluteLink}" style="background: linear-gradient(45deg, #667eea 30%, #764ba2 90%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">View in ${BRAND_NAME}</a>
        </div>`
            : ""
        }
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="color: #666; font-size: 12px;">This is an automated message from ${BRAND_NAME}.</p>
      </div>
    `,
  };

  try {
    const { error } = await resend().emails.send(emailConfig);

    if (error) {
      return { success: false, error };
    }

    await recordUsage(HOUSE, "email", 1); // one email on the house's bill (billing/usage.ts)
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
}

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );

async function deliver(config: { to: string; subject: string; text: string; html: string }) {
  try {
    const { error } = await resend().emails.send({ from: "no-reply@xendelta.com", ...config });
    if (error) return { success: false, error };
    await recordUsage(HOUSE, "email", 1); // one email on the house's bill (billing/usage.ts)
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
}

/** The link to confirm a new email address, sent to that address. */
export async function sendEmailChangeConfirmEmail(data: {
  username: string;
  email: string;
  confirmUrl: string;
}): Promise<{ success: boolean; error?: any }> {
  const { username, email, confirmUrl } = data;
  return deliver({
    to: email,
    subject: `${BRAND_NAME} - Confirm your new email`,
    text: `Open the link below to use this address for your ${BRAND_NAME} account. It expires in 1 hour.\n\n${confirmUrl}\n\nIf you didn't ask for this, ignore this email and nothing changes.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Confirm your new email</h2>
        <p>Hello ${escapeHtml(username)},</p>
        <p>Someone asked to use this address for a ${BRAND_NAME} account. Confirm it to finish the change:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${confirmUrl}" style="background: linear-gradient(45deg, #667eea 30%, #764ba2 90%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">Confirm email</a>
        </div>
        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #666;">${confirmUrl}</p>
        <p><strong>This link will expire in 1 hour.</strong></p>
        <p>If you didn't ask for this, ignore this email and nothing changes.</p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="color: #666; font-size: 12px;">This is an automated message from ${BRAND_NAME}.</p>
      </div>
    `,
  });
}

/** Tells the old address that the account's email was changed, so a change nobody asked for doesn't go unnoticed. */
export async function sendEmailChangedNotice(data: {
  username: string;
  email: string;
  newEmail: string;
}): Promise<{ success: boolean; error?: any }> {
  const { username, email, newEmail } = data;
  return deliver({
    to: email,
    subject: `${BRAND_NAME} - Your email was changed`,
    text: `The email on your ${BRAND_NAME} account was changed to ${newEmail}. If this wasn't you, reset your password right away and contact us.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Your email was changed</h2>
        <p>Hello ${escapeHtml(username)},</p>
        <p>The email on your ${BRAND_NAME} account was changed to <strong>${escapeHtml(newEmail)}</strong>.</p>
        <p>If this wasn't you, reset your password right away and contact us.</p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="color: #666; font-size: 12px;">This is an automated message from ${BRAND_NAME}.</p>
      </div>
    `,
  });
}
