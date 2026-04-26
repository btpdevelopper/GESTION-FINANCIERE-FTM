import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getS3Client() {
  const region = process.env.SCW_REGION;
  const endpoint = process.env.SCW_S3_ENDPOINT;
  const accessKeyId = process.env.SCW_ACCESS_KEY_ID;
  const secretAccessKey = process.env.SCW_SECRET_ACCESS_KEY;
  if (!region || !endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Missing Scaleway S3 env vars (SCW_REGION, SCW_S3_ENDPOINT, SCW_ACCESS_KEY_ID, SCW_SECRET_ACCESS_KEY)."
    );
  }
  return new S3Client({
    region,
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: false,
  });
}

function getBucket() {
  const bucket = process.env.SCW_BUCKET_NAME;
  if (!bucket) throw new Error("Missing SCW_BUCKET_NAME env var.");
  return bucket;
}

function sanitizeKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_+/g, "_");
}

async function toBuffer(content: Buffer | ArrayBuffer | Blob): Promise<Buffer> {
  if (Buffer.isBuffer(content)) return content;
  if (content instanceof ArrayBuffer) return Buffer.from(content);
  return Buffer.from(await content.arrayBuffer());
}

export async function uploadFtmDocument(
  ftmId: string,
  fileContent: Buffer | ArrayBuffer | Blob,
  fileName: string,
  contentType: string
) {
  const safeName = sanitizeKey(fileName);
  const path = `${ftmId}/${Date.now()}-${safeName}`;
  const Body = await toBuffer(fileContent);

  try {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: getBucket(),
        Key: path,
        Body,
        ContentType: contentType,
      })
    );
  } catch (err) {
    console.error("Scaleway S3 upload error:", err);
    throw new Error(
      "Impossible d'uploader le document FTM: " +
        (err instanceof Error ? err.message : String(err))
    );
  }

  return { path };
}

export async function getFtmDocumentUrl(path: string) {
  try {
    return await getSignedUrl(
      getS3Client(),
      new GetObjectCommand({ Bucket: getBucket(), Key: path }),
      { expiresIn: 60 * 60 }
    );
  } catch (err) {
    console.error("Scaleway S3 signed URL error:", err);
    throw new Error(
      "Unable to create signed URL: " +
        (err instanceof Error ? err.message : String(err))
    );
  }
}

export async function downloadFtmDocument(
  path: string
): Promise<{ body: Buffer; contentType: string }> {
  try {
    const res = await getS3Client().send(
      new GetObjectCommand({ Bucket: getBucket(), Key: path })
    );
    if (!res.Body) throw new Error("Empty response body");
    const bytes = await res.Body.transformToByteArray();
    return {
      body: Buffer.from(bytes),
      contentType: res.ContentType ?? "application/octet-stream",
    };
  } catch (err) {
    console.error("Scaleway S3 download error:", err);
    throw new Error(
      "Impossible de télécharger le fichier: " +
        (err instanceof Error ? err.message : String(err))
    );
  }
}

export async function deleteFtmDocument(path: string) {
  try {
    await getS3Client().send(
      new DeleteObjectCommand({ Bucket: getBucket(), Key: path })
    );
  } catch (err) {
    console.error("Scaleway S3 delete error:", err);
    throw new Error(
      "Impossible de supprimer le document: " +
        (err instanceof Error ? err.message : String(err))
    );
  }
}
