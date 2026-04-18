import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import * as functions from "@/inngest/index";

/**
 * Inngest serve handler — this is the webhook endpoint that Inngest calls
 * to trigger your functions. It must be publicly reachable in production
 * (Inngest will auto-discover it via your INNGEST_SIGNING_KEY).
 *
 * In local dev: `npx inngest-cli@latest dev` auto-discovers this at
 * http://localhost:3000/api/inngest
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: Object.values(functions),
});
