import { Resend } from "resend";
import { env } from "../config/env.js";

const resend =
  env.resendApiKey && typeof env.resendApiKey === "string"
    ? new Resend(env.resendApiKey)
    : null;

const resolveFrontendUrl = () => {
  const candidates = [];
  if (env.frontendUrl) {
    candidates.push(
      ...env.frontendUrl
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }
  const corsOrigin = process.env.CORS_ORIGIN;
  if (corsOrigin) {
    candidates.push(
      ...corsOrigin
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }
  candidates.push("http://localhost:3000");

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      return url.origin.replace(/\/$/, "");
    } catch {
      continue;
    }
  }
  return "http://localhost:3000";
};

const frontendUrl = resolveFrontendUrl();

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

export async function sendEmailVerificationEmail({
  to,
  name,
  token,
  expiresInMinutes,
}) {
  if (!resend) {
    console.warn(
      "Resend API key missing; skipping verification email dispatch.",
    );
    return;
  }

  const verifyUrl = `${frontendUrl}/auth/verify?token=${encodeURIComponent(
    token,
  )}`;

  const text = [
    `Hi ${name || "there"},`,
    "",
    "Confirm your email to activate your Myceli account.",
    `Click this link to verify (expires in ${expiresInMinutes} minutes):`,
    verifyUrl,
    "",
    "If you didn't sign up, you can ignore this email.",
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
                <p style="margin: 0 0 8px; letter-spacing: 0.08em; text-transform: uppercase; font-size: 11px; color: #4b5e55;">Confirm your email</p>
                <h2 style="margin: 0 0 12px; font-size: 24px; color: #0a1f14;">Verify your Myceli account</h2>
                <p style="margin: 0 0 16px; color: #4b5e55; line-height: 1.6;">
                  Hi ${name || "there"}, click the button below to confirm your email and activate your account. This link expires in ${expiresInMinutes} minutes.
                </p>
                <p style="text-align: center; margin: 24px 0;">
                  <a href="${verifyUrl}" style="background: #003f36; color: #ffffff; padding: 12px 20px; border-radius: 12px; text-decoration: none; font-weight: 600; display: inline-block;">
                    Verify email
                  </a>
                </p>
                <p style="margin: 0 0 12px; color: #4b5e55; line-height: 1.6;">
                  Or copy and paste this link into your browser:<br/>
                  <span style="color: #0a1f14; word-break: break-all;">${verifyUrl}</span>
                </p>
                <p style="margin: 16px 0 0; color: #6b7a72; font-size: 13px; line-height: 1.6;">
                  If you didn't request this, you can ignore this email.
                </p>
              </td>
            </tr>
          </table>
          <p style="color: #8da39a; font-size: 12px; margin: 16px 0 0;">Sent by ${productName} • ${fromEmail}</p>
        </td>
      </tr>
    </table>
  `;

  const { error } = await resend.emails.send({
    from: `Myceli Team <${fromEmail}>`,
    to,
    subject: "Verify your email for Myceli",
    text,
    html,
  });

  if (error) {
    console.error("Resend verification email error:", error);
    throw new Error(error.message || "Resend send failed");
  }
  console.info("Verification email queued");
}

export async function sendWelcomeEmail({ to, name, plan = "free", intent }) {
  if (!resend) {
    console.warn("Resend API key missing; skipping welcome email dispatch.");
    return;
  }

  const displayName = name || "there";
  const dashboardUrl = `${frontendUrl}/workspace`;
  const choosePlanUrl = `${frontendUrl}/choose-experience`;

  const html = `
    <table cellpadding="0" cellspacing="0" width="100%" style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8faf9; padding: 24px 0;">
      <tr>
        <td align="center">
          <table cellpadding="0" cellspacing="0" width="560" style="background: #ffffff; border-radius: 16px; border: 1px solid #e6f2ec; padding: 32px;">
            <tr>
              <td style="text-align: left; color: #0a1f14;">
                <p style="margin: 0 0 8px; letter-spacing: 0.08em; text-transform: uppercase; font-size: 11px; color: #4b5e55;">Welcome aboard</p>
                <h2 style="margin: 0 0 12px; font-size: 24px; color: #0a1f14;">Hey ${displayName}, your workspace is live 🎉</h2>
                <p style="margin: 0 0 16px; color: #4b5e55; line-height: 1.6;">
                  You’re starting on the <strong>${plan}</strong> experience so you can explore without entering payment details. Pick Basic or Pro anytime—one click from inside the app.
                </p>
                <p style="margin: 0 0 16px; color: #4b5e55; line-height: 1.6;">
                  Jump into Myceli to create your first board. If you already know you want ${
                    intent === "pro" ? "Pro" : intent === "basic" ? "Basic" : "a paid plan"
                  }, you can select it right after you sign in.
                </p>
                <p style="text-align: center; margin: 24px 0;">
                  <a href="${dashboardUrl}" style="background: #003f36; color: #ffffff; padding: 12px 20px; border-radius: 12px; text-decoration: none; font-weight: 600; display: inline-block;">Enter Myceli</a>
                </p>
                <p style="text-align: center; margin: 4px 0 24px;">
                  <a href="${choosePlanUrl}" style="color: #0a1f14; font-weight: 600; text-decoration: underline; text-decoration-thickness: 2px;">Choose your experience</a>
                </p>
                <p style="margin: 0 0 16px; color: #4b5e55; line-height: 1.6;">
                  Need a hand? Reply to this email and a human will help set you up.
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
    `Hey ${displayName}, your ${productName} workspace is live.`,
    `You’re starting on the ${plan} experience. Explore freely and pick Basic or Pro anytime.`,
    `Open your workspace: ${dashboardUrl}`,
    `Choose your experience: ${choosePlanUrl}`,
    "",
    "Need help deciding? Reply and we’ll recommend the right plan.",
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
                <h2 style="margin: 0 0 12px; font-size: 24px; color: #0a1f14;">You chose ${plan} 🎉</h2>
                <p style="margin: 0 0 16px; color: #4b5e55; line-height: 1.6;">
                  Thanks, ${displayName}! Your ${productName} account is now on the <strong>${plan}</strong> plan. Extra credits, higher AI limits, and sharing controls are unlocked.
                </p>
                <p style="text-align: center; margin: 24px 0;">
                  <a href="${billingUrl}" style="background: #003f36; color: #ffffff; padding: 12px 20px; border-radius: 12px; text-decoration: none; font-weight: 600; display: inline-block;">
                    View your benefits
                  </a>
                </p>
                <p style="margin: 0 0 16px; color: #4b5e55; line-height: 1.6;">
                  Need an invoice or want teammates added? Reply to this email and we’ll help right away.
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
    `You chose ${plan}!`,
    `Thanks ${displayName}. Your ${productName} account now has more credits, higher AI limits, and sharing controls.`,
    `See your benefits: ${billingUrl}`,
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
