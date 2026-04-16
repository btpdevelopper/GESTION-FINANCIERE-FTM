import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth/user";
import { prisma } from "@/lib/prisma";
import { ProjectRole } from "@prisma/client";
import { z } from "zod";

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const path = request.nextUrl.searchParams.get("path");
  if (!path || path.includes('..') || path.startsWith('/')) {
    return NextResponse.json({ error: "Chemin invalide ou manquant." }, { status: 400 });
  }

  try {
    const ftmId = path.split('/')[0];
    const uuidParse = z.string().uuid().safeParse(ftmId);
    if (!uuidParse.success) {
      return NextResponse.json({ error: "Format FTM ID invalide." }, { status: 400 });
    }

    // Retrieve the FTM to inherently discover the projectId for auth verification
    const ftm = await prisma.ftmRecord.findUnique({
      where: { id: ftmId },
      select: { projectId: true },
    });
    if (!ftm) {
      return NextResponse.json({ error: "Fiche introuvable." }, { status: 404 });
    }

    // Verify user is a member of the project
    const pm = await prisma.projectMember.findFirst({
      where: { userId: user.id, projectId: ftm.projectId },
    });
    if (!pm) {
      return NextResponse.json({ error: "Accès au projet refusé." }, { status: 403 });
    }

    // ZERO-TRUST: Force strict limits for companies
    if (pm.role === ProjectRole.ENTREPRISE) {
      // It can either be an FtmDocument or an FtmQuoteSubmission attachment
      const doc = await prisma.ftmDocument.findFirst({
        where: { url: path, ftmId }
      });

      if (doc) {
        if (doc.organizationId && doc.organizationId !== pm.organizationId) {
          return NextResponse.json({ error: "Accès refusé au document de cette entreprise." }, { status: 403 });
        }
      } else {
        const quote = await prisma.ftmQuoteSubmission.findFirst({
          where: { documentUrl: path, ftmId }
        });
        if (!quote || quote.organizationId !== pm.organizationId) {
          return NextResponse.json({ error: "Accès refusé. Ce devis ne vous appartient pas." }, { status: 403 });
        }
      }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      throw new Error("Missing server credentials");
    }

    const response = await fetch(`${supabaseUrl}/storage/v1/object/authenticated/ftm-documents/${path}`, {
      headers: {
        Authorization: `Bearer ${serviceKey}`,
      },
    });

    if (!response.ok || !response.body) {
      throw new Error("Impossible de télécharger le fichier proxy.");
    }

    // Proxy the stream straight to the client! No signed URLs, no RAM crash.
    return new NextResponse(response.body, {
      status: response.status,
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/octet-stream",
        "Content-Length": response.headers.get("Content-Length") || "",
        "Content-Disposition": `inline; filename="${path.split('/').pop()}"`,
      },
    });
  } catch (err) {
    console.error("ftm-doc API error:", err);
    return NextResponse.json(
      { error: "Impossible de générer le lien.", detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
