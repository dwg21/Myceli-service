import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import crypto from "crypto";
import https from "https";

/**
 * S3-compatible storage helper (optimized for Cloudflare R2 to keep costs low).
 * Required env: R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and either
 * R2_ENDPOINT or R2_ACCOUNT_ID. Optional: R2_PUBLIC_BASE_URL, R2_REGION.
 */
const r2Bucket = process.env.R2_BUCKET;
const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID;
const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const rawEndpoint =
  process.env.R2_ENDPOINT && process.env.R2_ENDPOINT.trim().length > 0
    ? process.env.R2_ENDPOINT.trim()
    : null;

// Some folks accidentally point R2_ENDPOINT at the public r2.dev domain. That
// domain cannot be used for S3 API calls (it will 401). When we detect that,
// we still allow it as the public URL base, but switch the S3 endpoint to the
// account-scoped API host if R2_ACCOUNT_ID is available.
const isR2DevEndpoint = rawEndpoint?.includes(".r2.dev");
const r2PublicBase =
  process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, "") ||
  (isR2DevEndpoint ? rawEndpoint : null);

const apiEndpoint =
  isR2DevEndpoint && process.env.R2_ACCOUNT_ID
    ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    : rawEndpoint;

const r2Endpoint =
  apiEndpoint && !/^https?:\/\//i.test(apiEndpoint)
    ? `https://${apiEndpoint}`
    : apiEndpoint;
const r2Region = process.env.R2_REGION || "auto";

// Initialize an S3-compatible client (intended for Cloudflare R2 or other S3 hosts)
let s3Client = null;
if (r2Bucket && r2AccessKeyId && r2SecretAccessKey && r2Endpoint) {
  // Force modern TLS and keep-alive to avoid handshake/version issues
  const httpsAgent = new https.Agent({
    keepAlive: true,
    maxSockets: 50,
    minVersion: "TLSv1.2",
  });

  s3Client = new S3Client({
    region: r2Region,
    endpoint: r2Endpoint,
    forcePathStyle: true, // R2 and many S3-compatible hosts prefer path-style for custom endpoints
    requestHandler: new NodeHttpHandler({
      httpsAgent,
      // Some environments need ALPN off for older SSL stacks; we leave it default
    }),
    credentials: {
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
    },
  });
  console.log(
    `[storage] S3 client configured`,
    JSON.stringify({
      endpoint: r2Endpoint,
      region: r2Region,
      node: process.version,
      tls: { min: "1.2", max: "default", alpn: "default" },
    })
  );
} else if (r2Bucket && r2AccessKeyId && r2SecretAccessKey) {
  console.warn(
    "[storage] Missing valid R2 endpoint. Set R2_ENDPOINT to your S3 API host (e.g. https://<account>.r2.cloudflarestorage.com) or provide R2_ACCOUNT_ID when using an r2.dev public URL."
  );
}

if (isR2DevEndpoint && !process.env.R2_ACCOUNT_ID) {
  console.warn(
    "[storage] R2_ENDPOINT points to *.r2.dev (public site). Add R2_ACCOUNT_ID or change R2_ENDPOINT to the API host https://<account>.r2.cloudflarestorage.com to avoid 401 Unauthorized."
  );
}

export const storageAvailable = !!s3Client;

const slugify = (value) =>
  value
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80) || "idea";

function buildObjectKey(userId, ideaTitle) {
  const safeUser = slugify(userId || "user");
  const safeIdea = slugify(ideaTitle || "idea");
  const random = crypto.randomBytes(6).toString("hex");
  return `idea-images/${safeUser}/${safeIdea}/${Date.now()}-${random}.png`;
}

function buildPublicUrl(objectKey) {
  if (!objectKey) return null;
  if (r2PublicBase) {
    return `${r2PublicBase}/${objectKey}`;
  }
  try {
    const base = new URL(r2Endpoint);
    return new URL(`${r2Bucket}/${objectKey}`, base).toString();
  } catch {
    return null;
  }
}

export async function uploadIdeaImage({
  buffer,
  userId,
  ideaTitle,
  contentType = "image/png",
}) {
  if (!s3Client) {
    throw new Error("Storage client is not configured");
  }
  const Key = buildObjectKey(userId, ideaTitle);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: r2Bucket,
      Key,
      Body: buffer,
      ContentType: contentType,
    })
  );

  const url = buildPublicUrl(Key);
  return { Key, url };
}
