import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { env } from "../config/env.js";
import {
  issueTokensForUser,
  setRefreshCookie,
} from "../services/tokenService.js";

const defaultReturnTo =
  env.frontendUrl || process.env.CORS_ORIGIN || "http://localhost:3000";

const encodeState = (state) =>
  Buffer.from(JSON.stringify(state)).toString("base64url");
const decodeState = (state) => {
  try {
    return JSON.parse(Buffer.from(state, "base64url").toString("utf8"));
  } catch {
    return {};
  }
};

const sendTokensToClient = (res, payload, returnTo = defaultReturnTo) => {
  const target = returnTo || defaultReturnTo;
  const targetOrigin = new URL(target).origin;
  const scriptPayload = JSON.stringify({ type: "oauth-success", payload });
  const html = `
    <script>
      (function() {
        const msg = ${scriptPayload};
        const targetOrigin = "${targetOrigin}";
        if (window.opener) {
          window.opener.postMessage(msg, targetOrigin);
          window.close();
        } else {
          // Fallback: redirect without tokens
          window.location.href = "${target}";
        }
      })();
    </script>
  `;
  res.set("Content-Type", "text/html").send(html);
};

const sendErrorToClient = (res, error, returnTo = defaultReturnTo) => {
  const target = returnTo || defaultReturnTo;
  const targetOrigin = new URL(target).origin;
  const scriptPayload = JSON.stringify({ type: "oauth-error", error });
  const html = `
    <script>
      (function() {
        const msg = ${scriptPayload};
        const targetOrigin = "${targetOrigin}";
        if (window.opener) {
          window.opener.postMessage(msg, targetOrigin);
          window.close();
        } else {
          window.location.href = "${target}";
        }
      })();
    </script>
  `;
  res.set("Content-Type", "text/html").send(html);
};

const ensureProviderConfig = (provider) => {
  const missing = [];
  if (provider === "google") {
    if (!env.googleClientId) missing.push("GOOGLE_CLIENT_ID");
    if (!env.googleClientSecret) missing.push("GOOGLE_CLIENT_SECRET");
    if (!env.googleRedirectUri) missing.push("GOOGLE_REDIRECT_URI");
  }
  if (provider === "github") {
    if (!env.githubClientId) missing.push("GITHUB_CLIENT_ID");
    if (!env.githubClientSecret) missing.push("GITHUB_CLIENT_SECRET");
    if (!env.githubRedirectUri) missing.push("GITHUB_REDIRECT_URI");
  }

  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }
};

const upsertUserFromProfile = async (provider, profile) => {
  const providerFilter = {
    providers: { $elemMatch: { provider, providerId: profile.id } },
  };
  let user =
    (await User.findOne(providerFilter)) ||
    (profile.email ? await User.findOne({ email: profile.email }) : null);

  if (!user) {
    user = await User.create({
      name: profile.name || profile.email || provider,
      email: profile.email || `${provider}-${profile.id}@example.com`,
      password: randomUUID(), // random placeholder; not used for OAuth sign-in
      providers: [
        {
          provider,
          providerId: profile.id,
          email: profile.email,
          avatar: profile.avatar,
          displayName: profile.name,
        },
      ],
    });
  } else {
    const alreadyLinked = user.providers?.some(
      (p) => p.provider === provider && p.providerId === profile.id
    );
    if (!alreadyLinked) {
      user.providers = [
        ...(user.providers || []),
        {
          provider,
          providerId: profile.id,
          email: profile.email,
          avatar: profile.avatar,
          displayName: profile.name,
        },
      ];
      await user.save();
    }
  }

  return user;
};

/* ---------------- Google ---------------- */
export const googleAuth = (req, res) => {
  try {
    ensureProviderConfig("google");
    const returnTo = req.query.returnTo || defaultReturnTo;
    const state = encodeState({ returnTo });
    const params = new URLSearchParams({
      client_id: env.googleClientId,
      redirect_uri: env.googleRedirectUri,
      response_type: "code",
      scope: "openid email profile",
      access_type: "offline",
      prompt: "consent",
      state,
    });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const googleCallback = async (req, res) => {
  try {
    ensureProviderConfig("google");
    const { code } = req.query;
    const state = req.query.state ? decodeState(req.query.state) : {};
    const returnTo = state.returnTo || defaultReturnTo;
    if (!code) return sendErrorToClient(res, "Missing code", returnTo);

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.googleClientId,
        client_secret: env.googleClientSecret,
        redirect_uri: env.googleRedirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      return sendErrorToClient(res, "Failed to exchange code", returnTo);
    }
    const tokens = await tokenRes.json();
    const idToken = tokens.id_token;
    if (!idToken) return sendErrorToClient(res, "Missing id_token", returnTo);

    const decoded = jwt.decode(idToken);
    const profile = {
      id: decoded?.sub,
      email: decoded?.email,
      name: decoded?.name,
      avatar: decoded?.picture,
    };

    if (!profile.id) {
      return sendErrorToClient(res, "Invalid Google profile", returnTo);
    }

    const user = await upsertUserFromProfile("google", profile);
    const { accessToken, refreshToken } = await issueTokensForUser(user, req);
    setRefreshCookie(res, refreshToken);
    sendTokensToClient(
      res,
      {
        accessToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          providers: user.providers,
        },
      },
      returnTo
    );
  } catch (err) {
    console.error("Google OAuth error:", err);
    sendErrorToClient(res, "Google OAuth failed", defaultReturnTo);
  }
};

/* ---------------- GitHub ---------------- */
export const githubAuth = (req, res) => {
  try {
    ensureProviderConfig("github");
    const returnTo = req.query.returnTo || defaultReturnTo;
    const state = encodeState({ returnTo });
    const params = new URLSearchParams({
      client_id: env.githubClientId,
      redirect_uri: env.githubRedirectUri,
      scope: "read:user user:email",
      allow_signup: "true",
      state,
    });
    res.redirect(`https://github.com/login/oauth/authorize?${params}`);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const fetchGithubAccessToken = async (code) => {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json" },
    body: new URLSearchParams({
      client_id: env.githubClientId,
      client_secret: env.githubClientSecret,
      code,
      redirect_uri: env.githubRedirectUri,
    }),
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data.access_token;
};

const fetchGithubProfile = async (accessToken) => {
  const profileRes = await fetch("https://api.github.com/user", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profileRes.ok) return null;
  const profile = await profileRes.json();

  let email = profile.email;
  if (!email) {
    const emailRes = await fetch("https://api.github.com/user/emails", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (emailRes.ok) {
      const emails = await emailRes.json();
      const primary = emails.find((e) => e.primary && e.verified);
      email = primary?.email || emails[0]?.email;
    }
  }

  return {
    id: profile.id?.toString(),
    email: email || (profile.id ? `${profile.id}@users.noreply.github.com` : ""),
    name: profile.name || profile.login,
    avatar: profile.avatar_url,
  };
};

export const githubCallback = async (req, res) => {
  try {
    ensureProviderConfig("github");
    const { code } = req.query;
    const state = req.query.state ? decodeState(req.query.state) : {};
    const returnTo = state.returnTo || defaultReturnTo;
    if (!code) return sendErrorToClient(res, "Missing code", returnTo);

    const accessToken = await fetchGithubAccessToken(code);
    if (!accessToken) {
      return sendErrorToClient(res, "Failed to exchange code", returnTo);
    }

    const profile = await fetchGithubProfile(accessToken);
    if (!profile?.id) {
      return sendErrorToClient(res, "Invalid GitHub profile", returnTo);
    }

    const user = await upsertUserFromProfile("github", profile);
    const tokens = await issueTokensForUser(user, req);
    setRefreshCookie(res, tokens.refreshToken);
    sendTokensToClient(
      res,
      {
        accessToken: tokens.accessToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          providers: user.providers,
        },
      },
      returnTo
    );
  } catch (err) {
    console.error("GitHub OAuth error:", err);
    sendErrorToClient(res, "GitHub OAuth failed", defaultReturnTo);
  }
};
