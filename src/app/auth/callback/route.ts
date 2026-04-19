import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase PKCE callback handler.
 *
 * Invite links, password-reset links, and OAuth redirects all land here with a
 * `?code=` param. We exchange it for a session and write the resulting cookies
 * directly onto the redirect response — this is the only way to guarantee the
 * Set-Cookie headers are included in a Route Handler.
 *
 * DO NOT use createClient() from @/lib/supabase/server here: that helper
 * writes to the next/headers cookie store which is read-only in Route Handlers
 * and won't produce Set-Cookie headers on the response.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);

  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/projects";

  if (code) {
    // Build the redirect response first so we can attach cookies to it.
    const redirectResponse = NextResponse.redirect(`${origin}${next}`);

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
            // Write session cookies onto the redirect response so the browser
            // receives them and the user is authenticated on the next request.
            cookiesToSet.forEach(({ name, value, options }) =>
              redirectResponse.cookies.set(name, value, options as Parameters<typeof redirectResponse.cookies.set>[2]),
            );
          },
        },
      },
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return redirectResponse;
    }
  }

  // Code missing or exchange failed — redirect to login with an error hint.
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
