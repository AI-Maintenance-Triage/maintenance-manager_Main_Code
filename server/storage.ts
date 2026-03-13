/**
 * Storage helpers — standard AWS S3 SDK implementation.
 * Compatible with DigitalOcean Spaces (S3-compatible API) and AWS S3.
 *
 * Required environment variables:
 *   S3_ENDPOINT      — e.g. https://nyc3.digitaloceanspaces.com  (omit for AWS)
 *   S3_REGION        — e.g. nyc3  (or us-east-1 for AWS)
 *   S3_BUCKET        — e.g. first-grab-files
 *   S3_ACCESS_KEY    — Spaces / AWS access key ID
 *   S3_SECRET_KEY    — Spaces / AWS secret access key
 *
 * Falls back to Manus forge proxy when S3 vars are not set, so the app
 * continues to work on Manus during the migration period.
 */

import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

// ─── S3 / Spaces implementation ─────────────────────────────────────────────

function getS3Client(): S3Client {
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION ?? "us-east-1";
  const accessKeyId = process.env.S3_ACCESS_KEY ?? "";
  const secretAccessKey = process.env.S3_SECRET_KEY ?? "";

  return new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    // DigitalOcean Spaces requires path-style addressing
    forcePathStyle: false,
  });
}

function getS3Bucket(): string {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET environment variable is not set");
  return bucket;
}

function getPublicUrl(key: string): string {
  const endpoint = process.env.S3_ENDPOINT ?? "";
  const bucket = getS3Bucket();
  // DigitalOcean Spaces public URL format: https://<bucket>.<region>.digitaloceanspaces.com/<key>
  // For AWS: https://<bucket>.s3.<region>.amazonaws.com/<key>
  if (endpoint) {
    // Strip protocol, build bucket-prefixed URL
    const base = endpoint.replace(/^https?:\/\//, "");
    return `https://${bucket}.${base}/${key}`;
  }
  const region = process.env.S3_REGION ?? "us-east-1";
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

async function s3Put(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType: string
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const bucket = getS3Bucket();
  const client = getS3Client();

  const body = typeof data === "string" ? Buffer.from(data) : Buffer.from(data as any);

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ACL: "public-read",
    })
  );

  return { key, url: getPublicUrl(key) };
}

async function s3Get(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const bucket = getS3Bucket();
  const client = getS3Client();

  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: 3600 }
  );

  return { key, url };
}

// ─── Manus forge proxy fallback ──────────────────────────────────────────────

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function toFormData(data: Buffer | Uint8Array | string, contentType: string, fileName: string): FormData {
  const blob =
    typeof data === "string"
      ? new Blob([data], { type: contentType })
      : new Blob([data as any], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName || "file");
  return form;
}

async function forgePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType: string
): Promise<{ key: string; url: string }> {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;
  if (!baseUrl || !apiKey) throw new Error("Storage credentials missing");

  const key = normalizeKey(relKey);
  const uploadUrl = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  uploadUrl.searchParams.set("path", key);

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: toFormData(data, contentType, key.split("/").pop() ?? key),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => response.statusText);
    throw new Error(`Storage upload failed (${response.status}): ${message}`);
  }
  const url = (await response.json()).url;
  return { key, url };
}

async function forgeGet(relKey: string): Promise<{ key: string; url: string }> {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;
  if (!baseUrl || !apiKey) throw new Error("Storage credentials missing");

  const key = normalizeKey(relKey);
  const downloadUrl = new URL("v1/storage/downloadUrl", ensureTrailingSlash(baseUrl));
  downloadUrl.searchParams.set("path", key);

  const response = await fetch(downloadUrl, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const url = (await response.json()).url;
  return { key, url };
}

// ─── Public API ──────────────────────────────────────────────────────────────

function useS3(): boolean {
  return !!(process.env.S3_ACCESS_KEY && process.env.S3_SECRET_KEY && process.env.S3_BUCKET);
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  if (useS3()) {
    return s3Put(relKey, data, contentType);
  }
  return forgePut(relKey, data, contentType);
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  if (useS3()) {
    return s3Get(relKey);
  }
  return forgeGet(relKey);
}
