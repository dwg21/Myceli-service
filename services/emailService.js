import { Resend } from "resend";
import { env } from "../config/env.js";

const resend =
  env.resendApiKey && typeof env.resendApiKey === "string"
    ? new Resend(env.resendApiKey)
    : null;

const frontendUrl =
  (env.frontendUrl && env.frontendUrl.replace(/\/$/, "")) ||
  "http://localhost:3000";

const fromEmail = env.supportEmail || "support@myceliapp.com";
const productName = "Myceli";

export async function sendPasswordResetEmail({
  to,
  name,
  token,
  expiresInMinutes,
}) {
  if (!resend) {
    console.warn(
      "Resend API key missing; skipping password reset email dispatch.",
    );
    return;
  }

  const resetUrl = `${frontendUrl}/auth/reset?token=${encodeURIComponent(
    token,
  )}`;

  const text = [
    `Hi ${name || "there"},`,
    "",
    "You requested to reset your Myceli password.",
    `Use this link to set a new password (expires in ${expiresInMinutes} minutes):`,
    resetUrl,
    "",
    "If you didn't request this, you can ignore this email.",
    "",
    "— The Myceli team",
  ].join("\n");

  const html = `
    <table cellpadding="0" cellspacing="0" width="100%" style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8faf9; padding: 24px 0;">
      <tr>
        <td align="center">
          <table cellpadding="0" cellspacing="0" width="560" style="background: #ffffff; border-radius: 16px; border: 1px solid #e6f2ec; padding: 32px;">
            <tr>
              <td style="text-align: left; color: #0a1f14;">
                <h2 style="margin: 0 0 12px; font-size: 24px; color: #0a1f14;">Reset your password</h2>
                <p style="margin: 0 0 16px; color: #4b5e55; line-height: 1.6;">
                  Hi ${name || "there"},<br/>
                  You requested to reset your Myceli password. Click the button below to set a new one. This link expires in ${expiresInMinutes} minutes.
                </p>
                <p style="text-align: center; margin: 24px 0;">
                  <a href="${resetUrl}" style="background: #003f36; color: #ffffff; padding: 12px 20px; border-radius: 12px; text-decoration: none; font-weight: 600; display: inline-block;">
                    Reset password
                  </a>
                </p>
                <p style="margin: 0 0 12px; color: #4b5e55; line-height: 1.6;">
                  Or copy and paste this link into your browser:<br/>
                  <span style="color: #0a1f14; word-break: break-all;">${resetUrl}</span>
                </p>
                <p style="margin: 16px 0 0; color: #6b7a72; font-size: 13px; line-height: 1.6;">
                  If you didn't request this, you can ignore this email.
                </p>
              </td>
            </tr>
          </table>
          <p style="color: #8da39a; font-size: 12px; margin: 16px 0 0;">Sent by Myceli • ${fromEmail}</p>
        </td>
      </tr>
    </table>
  `;

  const { data, error } = await resend.emails.send({
    from: `Myceli Support <${fromEmail}>`,
    to,
    subject: "Reset your Myceli password",
    text,
    html,
  });

  if (error) {
    console.error("Resend send error:", error);
    throw new Error(error.message || "Resend send failed");
  }
  console.info("Password reset email queued:", data?.id);
}

export async function sendWelcomeEmail({ to, name, plan = "free" }) {
  if (!resend) {
    console.warn("Resend API key missing; skipping welcome email dispatch.");
    return;
  }

  const displayName = name || "there";
  const dashboardUrl = `${frontendUrl}/app`;

  const html = `
    <table cellpadding="0" cellspacing="0" width="100%" style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8faf9; padding: 24px 0;">
      <tr>
        <td align="center">
          <table cellpadding="0" cellspacing="0" width="560" style="background: #ffffff; border-radius: 16px; border: 1px solid #e6f2ec; padding: 32px;">
            <tr>
              <td style="text-align: left; color: #0a1f14;">
                <p style="margin: 0 0 8px; letter-spacing: 0.08em; text-transform: uppercase; font-size: 11px; color: #4b5e55;">Welcome aboard</p>
                <h2 style="margin: 0 0 12px; font-size: 24px; color: #0a1f14;">Hey ${displayName}, you’re in! 🎉</h2>
                <p style="margin: 0 0 16px; color: #4b5e55; line-height: 1.6;">
                  Thanks for joining ${productName}. Your account is active on the <strong>${plan}</strong> plan. Let’s build some beautiful mind maps.
                </p>
                <p style="margin: 0 0 16px; color: #4b5e55; line-height: 1.6;">
                  Jump back into your workspace any time:
                </p>
                <p style="text-align: center; margin: 24px 0;">
                  <a href="${dashboardUrl}" style="background: #003f36; color: #ffffff; padding: 12px 20px; border-radius: 12px; text-decoration: none; font-weight: 600; display: inline-block;">
                    Open Myceli
                  </a>
                </p>
                <p style="margin: 0 0 16px; color: #4b5e55; line-height: 1.6;">
                  If you expected a different plan or need help migrating content, just hit reply—we’re real humans.
                </p>
                <p style="margin: 16px 0 0; color: #6b7a72; font-size: 13px; line-height: 1.6;">
                  Thanks for building with us,<br/>
                  The Myceli team
                </p>
              </td>
            </tr>
          </table>
          <p style="color: #8da39a; font-size: 12px; margin: 16px 0 0;">Sent by ${productName} • ${fromEmail}</p>
        </td>
      </tr>
    </table>
  `;

  const text = [
    `Hey ${displayName}, you’re in!`,
    `Welcome to ${productName}. Your account is active on the ${plan} plan.`,
    `Open your workspace: ${dashboardUrl}`,
    "",
    "If you expected a different plan or need help, just reply to this email.",
    "",
    "— The Myceli team",
  ].join("\n");

  const { error } = await resend.emails.send({
    from: `Myceli Team <${fromEmail}>`,
    to,
    subject: `Welcome to ${productName}!`,
    text,
    html,
  });

  if (error) {
    console.error("Resend welcome email error:", error);
  }
}

export async function sendPlanUpgradeEmail({ to, name, plan }) {
  if (!resend) {
    console.warn("Resend API key missing; skipping upgrade email dispatch.");
    return;
  }
  if (!plan || plan === "free") return;

  const displayName = name || "there";
  const billingUrl = `${frontendUrl}/workspace/settings?billing=success`;

  const html = `
    <table cellpadding="0" cellspacing="0" width="100%" style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8faf9; padding: 24px 0;">
      <tr>
        <td align="center">
          <table cellpadding="0" cellspacing="0" width="560" style="background: #ffffff; border-radius: 16px; border: 1px solid #e6f2ec; padding: 32px;">
            <tr>
              <td style="text-align: left; color: #0a1f14;">
                <p style="margin: 0 0 8px; letter-spacing: 0.08em; text-transform: uppercase; font-size: 11px; color: #4b5e55;">Plan updated</p>
                <h2 style="margin: 0 0 12px; font-size: 24px; color: #0a1f14;">You’ve upgraded to ${plan} 🎉</h2>
                <p style="margin: 0 0 16px; color: #4b5e55; line-height: 1.6;">
                  Thanks, ${displayName}! Your ${productName} account is now on the <strong>${plan}</strong> plan. Extra credits and pro features are ready for you.
                </p>
                <p style="text-align: center; margin: 24px 0;">
                  <a href="${billingUrl}" style="background: #003f36; color: #ffffff; padding: 12px 20px; border-radius: 12px; text-decoration: none; font-weight: 600; display: inline-block;">
                    View billing & benefits
                  </a>
                </p>
                <p style="margin: 0 0 16px; color: #4b5e55; line-height: 1.6;">
                  Need an invoice or have questions? Reply to this email and we’ll help right away.
                </p>
                <p style="margin: 16px 0 0; color: #6b7a72; font-size: 13px; line-height: 1.6;">
                  Grateful to have you leveling up with us,<br/>
                  The Myceli team
                </p>
              </td>
            </tr>
          </table>
          <p style="color: #8da39a; font-size: 12px; margin: 16px 0 0;">Sent by ${productName} • ${fromEmail}</p>
        </td>
      </tr>
    </table>
  `;

  const text = [
    `You’ve upgraded to ${plan}!`,
    `Thanks ${displayName}. Your ${productName} account is now on the ${plan} plan with more credits and features.`,
    `View billing: ${billingUrl}`,
    "",
    "Need an invoice or help? Just reply to this email.",
    "",
    "— The Myceli team",
  ].join("\n");

  const { error } = await resend.emails.send({
    from: `Myceli Team <${fromEmail}>`,
    to,
    subject: `You’re now on the ${plan} plan`,
    text,
    html,
  });

  if (error) {
    console.error("Resend upgrade email error:", error);
  }
}
