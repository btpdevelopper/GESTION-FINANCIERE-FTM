import { z } from "zod";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ACCEPTED_FILE_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
];

export const SubmitQuoteSchema = z.object({
  projectId: z.string().uuid("Invalid Project ID"),
  ftmId: z.string().uuid("Invalid FTM ID"),
  ftmLotId: z.string().uuid("Invalid Lot ID"),
  organizationId: z.string().uuid("Invalid Organization ID"),
  amountHtCents: z.string().transform((val) => {
    try {
      return BigInt(val);
    } catch {
      throw new Error("Invalid amount");
    }
  }),
  quoteNumber: z.string().min(1, "Le numéro de devis est requis"),
  file: z
    .any()
    .refine((file) => !file || file.size === 0 || file instanceof File, "Fichier invalide.")
    .refine(
      (file) => !file || file.size === 0 || file.size <= MAX_FILE_SIZE,
      "Le fichier ne doit pas dépasser 50 Mo."
    )
    .refine(
      (file) => !file || file.size === 0 || ACCEPTED_FILE_TYPES.includes(file.type),
      "Type de fichier non autorisé. Formats acceptés : PDF, Word, Excel, ZIP."
    )
    .optional()
    .transform((f) => (f && f.size > 0 ? (f as File) : null)),
});

export const MoeAnalyzeQuoteSchema = z.object({
  projectId: z.string().uuid(),
  ftmId: z.string().uuid(),
  quoteSubmissionId: z.string().uuid(),
  decision: z.enum(["ACCEPT", "RESEND_CORRECTION", "DECLINE"]),
  comment: z.string().trim().min(1, "Un commentaire justifié est requis."),
  declineScope: z.enum(["WHOLE_FTM", "THIS_COMPANY_ONLY"]).optional().nullable(),
}).refine(data => {
  if (data.decision === "DECLINE" && (!data.declineScope)) {
    return false;
  }
  return true;
}, {
  message: "Le périmètre de refus est obligatoire pour un avis défavorable.",
  path: ["declineScope"],
});

export const FtmFileSchema = z
  .any()
  .refine((file) => file instanceof File, "Fichier invalide.")
  .refine((file) => file.size <= MAX_FILE_SIZE, "Le fichier ne doit pas dépasser 50 Mo.")
  .refine(
    (file) => file.type.startsWith("image/") || ACCEPTED_FILE_TYPES.includes(file.type),
    "Type de fichier non autorisé. Formats acceptés : Images, PDF, Word, Excel, ZIP."
  );

export const CreateFtmDemandPayloadSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1, "Le titre est requis"),
  isDraft: z.boolean().default(false),
  description: z.string().min(1, "La description est requise"),
  requestedMoeResponseDate: z.string().nullable().optional(),
  documentsMeta: z.array(z.object({
    fileKey: z.string(),
  })).default([])
});

export const UpdateFtmDemandDraftPayloadSchema = CreateFtmDemandPayloadSchema.extend({
  demandId: z.string().uuid(),
});

export const CreateFtmPayloadSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1, "Le titre est requis"),
  modificationSource: z.enum(["MOA", "MOE", "ALEAS_EXECUTION"]),
  requestedMoeResponseDate: z.string().nullable().optional(),
  fromDemandId: z.string().uuid().nullable().optional(),
  lots: z.array(z.object({
    organizationId: z.string().uuid(),
    lotLabel: z.string().nullable().optional(),
    descriptionTravaux: z.string(),
    expectedResponseDate: z.string().nullable().optional(),
  })),
  documentsMeta: z.array(z.object({
    fileKey: z.string(),
    organizationId: z.string().uuid().nullable().optional()
  })).default([])
});
