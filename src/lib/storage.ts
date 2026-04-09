import { createClient } from "@/lib/supabase/server";

export async function uploadFtmDocument(
  ftmId: string,
  fileContent: Buffer | ArrayBuffer | Blob,
  fileName: string,
  contentType: string
) {
  // Using the user-preferred explicit "supabase storage"
  const bucketName = "ftm-documents";
  const path = `${ftmId}/${Date.now()}-${fileName}`;

  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(bucketName).upload(path, fileContent, {
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
  const bucketName = "ftm-documents";
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from(bucketName).createSignedUrl(path, 60 * 60);

  if (error) {
    console.error("Supabase Storage signed URL error:", error);
    throw new Error("Unable to create signed URL.");
  }

  return data.signedUrl;
}
