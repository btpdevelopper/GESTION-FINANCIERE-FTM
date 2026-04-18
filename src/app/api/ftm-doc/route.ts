import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/user";
import { prisma } from "@/lib/prisma";
import { ProjectRole } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

const BUCKET = "ftm-documents";

/**
 * Service-role Supabase client for storage proxying.
 * Using the JS SDK avoids the `/authenticated/` REST endpoint which requires
 * a user-level JWT — the service role key is incompatible with that path.
 */
function getStorageClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const path = request.nextUrl.searchParams.get("path");
  if (!path || path.includes("..") || path.startsWith("/")) {
    return NextResponse.json({ error: "Chemin invalide ou manquant." }, { status: 400 });
  }

  try {
    const entityId = path.split("/")[0];
    const uuidParse = z.string().uuid().safeParse(entityId);
    if (!uuidParse.success) {
      return NextResponse.json({ error: "Identifiant invalide." }, { status: 400 });
    }

    // ── Resolve entity & project ──────────────────────────────────────────
    // Documents can be stored under an FtmRecord ID *or* an FtmDemand ID.
    // We try FtmRecord first; if not found, fall back to FtmDemand.
    let projectId: string;
    let entityType: "FTM_RECORD" | "FTM_DEMAND";

    const ftmRecord = await prisma.ftmRecord.findUnique({
      where: { id: entityId },
      select: { projectId: true },
    });

    if (ftmRecord) {
      projectId = ftmRecord.projectId;
      entityType = "FTM_RECORD";
    } else {
      const ftmDemand = await prisma.ftmDemand.findUnique({
        where: { id: entityId },
        select: { projectId: true },
      });
      if (!ftmDemand) {
        return NextResponse.json({ error: "Document introuvable." }, { status: 404 });
      }
      projectId = ftmDemand.projectId;
      entityType = "FTM_DEMAND";
    }

    // ── Project membership check ──────────────────────────────────────────
    const pm = await prisma.projectMember.findFirst({
      where: { userId: user.id, projectId },
    });
    if (!pm) {
      return NextResponse.json({ error: "Accès au projet refusé." }, { status: 403 });
    }

    // ── ZERO-TRUST: per-company scoping for ENTREPRISE role ───────────────
    if (pm.role === ProjectRole.ENTREPRISE) {
      if (entityType === "FTM_RECORD") {
        // Entity is an FTM record: check FtmDocument or FtmQuoteSubmission
        const doc = await prisma.ftmDocument.findFirst({
          where: { url: path, ftmId: entityId },
        });
        if (doc) {
          if (doc.organizationId && doc.organizationId !== pm.organizationId) {
            return NextResponse.json({ error: "Accès refusé au document de cette entreprise." }, { status: 403 });
          }
        } else {
          const quote = await prisma.ftmQuoteSubmission.findFirst({
            where: { documentUrl: path, ftmId: entityId },
          });
          if (!quote || quote.organizationId !== pm.organizationId) {
            return NextResponse.json({ error: "Accès refusé. Ce devis ne vous appartient pas." }, { status: 403 });
          }
        }
      } else {
        // Entity is an FTM demand: verify the document belongs to this demand,
        // and that the demanding company matches this user's org.
        const demandDoc = await prisma.ftmDocument.findFirst({
          where: { url: path, ftmDemandId: entityId },
          include: { ftmDemand: { select: { initiatorProjectMemberId: true } } },
        });
        if (!demandDoc) {
          return NextResponse.json({ error: "Document introuvable pour cette demande." }, { status: 404 });
        }
        // Only the initiating member's organisation (or MOE/MOA) can download demand docs.
        const initiator = await prisma.projectMember.findUnique({
          where: { id: demandDoc.ftmDemand!.initiatorProjectMemberId },
          select: { organizationId: true },
        });
        if (initiator?.organizationId !== pm.organizationId) {
          return NextResponse.json({ error: "Accès refusé à ce document de demande." }, { status: 403 });
        }
      }
    }

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing server credentials");
    }

    // ── Proxy file download via SDK ───────────────────────────────────────
    // Uses .download() from the service-role client — avoids the
    // /authenticated/ REST endpoint which requires a user-level JWT.
    const { data: blob, error } = await getStorageClient()
      .storage
      .from(BUCKET)
      .download(path);

    if (error || !blob) {
      throw new Error(
        `Impossible de télécharger le fichier proxy.${error ? " " + error.message : ""}`
      );
    }

    const arrayBuffer = await blob.arrayBuffer();
    const fileName = path.split("/").pop() ?? "document";

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": blob.type || "application/octet-stream",
        "Content-Length": String(arrayBuffer.byteLength),
        "Content-Disposition": `inline; filename="${fileName}"`,
      },
    });
  } catch (err) {
    console.error("ftm-doc API error:", err);
    return NextResponse.json(
      {
        error: "Impossible de générer le lien.",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}

