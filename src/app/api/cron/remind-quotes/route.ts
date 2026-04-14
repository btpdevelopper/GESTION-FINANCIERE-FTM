import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { FtmPhase } from "@prisma/client";
import { sendReminderEmail } from "@/lib/email";

// Vercel Cron or any other service sends a GET request to this endpoint
export async function GET(req: Request) {
  try {
    // 1. Authenticate the Cron request
    // Ensure you configure CRON_SECRET in your .env variables
    const authHeader = req.headers.get("authorization");
    if (
      process.env.CRON_SECRET &&
      authHeader !== `Bearer ${process.env.CRON_SECRET}`
    ) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const now = new Date();

    // 2. Find all FTMs currently in the QUOTING phase
    const ftmsInQuoting = await prisma.ftmRecord.findMany({
      where: { phase: FtmPhase.QUOTING },
      include: {
        concernedOrgs: {
          include: {
            organization: { include: { userOrganizations: { include: { user: true } } } },
          },
        },
        quoteSubmissions: true,
      },
    });

    let emailsSent = 0;

    // 3. Evaluate organizations requiring a quote
    for (const ftm of ftmsInQuoting) {
      for (const concerned of ftm.concernedOrgs) {
        // Did they already submit a quote? Check the latest submission index.
        const subs = ftm.quoteSubmissions.filter(
          (s) => s.organizationId === concerned.organizationId
        );

        if (subs.length > 0) {
          continue; // the company already submitted something
        }

        const frequencyDays = concerned.reminderFrequencyDays;
        if (!frequencyDays || frequencyDays <= 0) {
           continue; // auto-reminders disabled for this organization
        }

        const lastReminded = concerned.lastReminderAt ?? new Date(0);
        const nextReminderDate = new Date(lastReminded.getTime() + frequencyDays * 24 * 60 * 60 * 1000);

        if (now >= nextReminderDate) {
          // Time to send a reminder
          
          // Collect all users belonging to this organization to email them
          const userOrgs = concerned.organization.userOrganizations;
          const emailsToNotify = userOrgs
            .map((uo) => uo.user.email)
            .filter(Boolean);

          for (const email of emailsToNotify) {
            await sendReminderEmail(email, ftm.title, ftm.projectId);
            emailsSent++;
          }

          // Update the lastReminderAt timestamp to prevent spamming
          await prisma.ftmConcernedOrganization.update({
            where: { id: concerned.id },
            data: { lastReminderAt: now },
          });
        }
      }
    }

    return NextResponse.json({ success: true, emailsSent });
  } catch (error: any) {
    console.error("Cron Error [remind-quotes]:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
