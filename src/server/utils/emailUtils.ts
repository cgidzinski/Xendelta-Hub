import { Resend } from "resend";

export interface PasswordResetEmailData {
  username: string;
  email: string;
  resetUrl: string;
}

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Send a password reset email
 */
export async function sendPasswordResetEmail(data: PasswordResetEmailData): Promise<{ success: boolean; error?: any }> {
  const { username, email, resetUrl } = data;

  const emailConfig = {
    to: email,
    from: "no-reply@xendelta.com",
    subject: "Xendelta Hub - Password Reset",
    text: `Click the link below to reset your password. This link will expire in 1 hour.\n\n${resetUrl}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Password Reset Request</h2>
        <p>Hello ${username},</p>
        <p>You requested a password reset for your Xendelta Hub account. Click the button below to reset your password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background: linear-gradient(45deg, #667eea 30%, #764ba2 90%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">Reset Password</a>
        </div>
        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #666;">${resetUrl}</p>
        <p><strong>This link will expire in 1 hour for security reasons.</strong></p>
        <p>If you didn't request this password reset, please ignore this email.</p>
        <hr style="margin: 30px 0; border: none; border-top: 1px solid #eee;">
        <p style="color: #666; font-size: 12px;">This is an automated message from Xendelta Hub.</p>
      </div>
    `,
  };

  try {
    const { data: result, error } = await resend.emails.send(emailConfig);
    
    if (error) {
      return { success: false, error };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
}
