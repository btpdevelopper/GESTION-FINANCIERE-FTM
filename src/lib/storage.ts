import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client for storage operations.
 * All storage calls are already behind server-side auth + capability checks,
 * so using the service role avoids bucket RLS policy issues.
 */
function getStorageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL env vars.");
  }
  return createSupabaseClient(url, key, { auth: { persistSession: false } });
}

const BUCKET = "ftm-documents";

/**
 * Sanitize a filename for Supabase Storage keys:
 * strip diacritics, replace spaces/special chars with underscores.
 */
function sanitizeKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-zA-Z0-9._-]/g, "_") // replace unsafe chars
    .replace(/_+/g, "_"); // collapse consecutive underscores
}

export async function uploadFtmDocument(
  ftmId: string,
  fileContent: Buffer | ArrayBuffer | Blob,
  fileName: string,
  contentType: string
) {
  const safeName = sanitizeKey(fileName);
  const path = `${ftmId}/${Date.now()}-${safeName}`;
  const supabase = getStorageClient();
  const { data, error } = await supabase.storage.from(BUCKET).upload(path, fileContent, {
    contentType,
    upsert: false,
  });

  if (error) {
    console.error("Supabase storage upload error:", error);
    throw new Error("Impossible d'uploader le document FTM: " + error.message);
  }

  return { path: data.path };
}

export async function getFtmDocumentUrl(path: string) {
  const supabase = getStorageClient();
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60);

  if (error) {
    console.error("Supabase Storage signed URL error:", error);
    throw new Error("Unable to create signed URL: " + error.message);
  }

  return data.signedUrl;
}

export async function deleteFtmDocument(path: string) {
  const supabase = getStorageClient();
  const { error } = await supabase.storage.from(BUCKET).remove([path]);

  if (error) {
    console.error("Supabase Storage delete error:", error);
    throw new Error("Impossible de supprimer le document: " + error.message);
  }
}

