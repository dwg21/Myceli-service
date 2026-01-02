import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";

/**
 * S3-compatible storage helper (optimized for Cloudflare R2 to keep costs low).
 * Required env: R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and either
 * R2_ENDPOINT or R2_ACCOUNT_ID. Optional: R2_PUBLIC_BASE_URL, R2_REGION.
 */
const r2Bucket = process.env.R2_BUCKET;
const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID;
const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const r2Endpoint =
  process.env.R2_ENDPOINT && process.env.R2_ENDPOINT.trim().length > 0
    ? process.env.R2_ENDPOINT
    : process.env.R2_ACCOUNT_ID
      ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
      : null;
const r2Region = process.env.R2_REGION || "auto";
const publicBaseUrl =
  process.env.R2_PUBLIC_BASE_URL?.replace(/\/+$/, "") || null;

// Initialize an S3-compatible client (intended for Cloudflare R2 or other S3 hosts)
let s3Client = null;
if (r2Bucket && r2AccessKeyId && r2SecretAccessKey && r2Endpoint) {
  s3Client = new S3Client({
    region: r2Region,
    endpoint: r2Endpoint,
    credentials: {
      accessKeyId: r2AccessKeyId,
      secretAccessKey: r2SecretAccessKey,
    },
  });
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
  if (publicBaseUrl) {
    return `${publicBaseUrl}/${objectKey}`;
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
