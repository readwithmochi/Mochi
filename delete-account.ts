// ══════════════════════════════════════════════════════════════
// MOCHI — Delete Account Edge Function
// ══════════════════════════════════════════════════════════════
// The browser can't delete its own account (that needs the server key),
// so account.html calls this function instead. It:
//   1. checks who is calling (their login token)
//   2. cancels their Mochi Pro subscription in Stripe, if they have one
//   3. deletes their books, push subscription and Stripe link
//   4. deletes the account itself
//
// HOW TO DEPLOY:
// 1. Supabase → Edge Functions → Deploy a new function → Via Editor
// 2. Name: delete-account  → paste this entire file → Deploy
// 3. Leave "Enforce JWT verification" ON (only logged-in users may call it)
// 4. No new secrets needed. STRIPE_SECRET_KEY is only used once it exists (Stripe_Setup.md step 8).
// ══════════════════════════════════════════════════════════════

import { createClient } from "npm:@supabase/supabase-js@2.49.4";
import Stripe from "npm:stripe@17.7.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

const CORS = {
  "Access-Control-Allow-Origin": "https://readwithmochi.github.io",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });

  // 1. Who is calling? The token must belong to a real, logged-in user (the anon key alone is refused).
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: who, error: whoErr } = await admin.auth.getUser(token);
  if (whoErr || !who?.user || who.user.role !== "authenticated") {
    return reply(401, { error: "Not logged in" });
  }
  const userId = who.user.id;

  // 2. Cancel Mochi Pro in Stripe so nobody keeps paying for a deleted account
  let stripeCancelled = 0;
  if (STRIPE_KEY) {
    try {
      const { data: row } = await admin
        .from("stripe_customers")
        .select("customer_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (row?.customer_id) {
        const stripe = new Stripe(STRIPE_KEY);
        const subs = await stripe.subscriptions.list({ customer: row.customer_id, status: "all", limit: 20 });
        for (const s of subs.data) {
          if (!["canceled", "incomplete_expired"].includes(s.status)) {
            await stripe.subscriptions.cancel(s.id);
            stripeCancelled++;
          }
        }
        // Removes their card details from Stripe too
        await stripe.customers.del(row.customer_id).catch(() => {});
      }
    } catch (err) {
      // Don't delete the account while a paid subscription might still be running
      return reply(500, { error: `Could not cancel subscription: ${(err as Error).message}` });
    }
  }

  // 3. Their data (stripe_customers may not exist yet while Stripe isn't set up — ignore that)
  await admin.from("push_subscriptions").delete().eq("user_id", userId);
  await admin.from("books").delete().eq("user_id", userId);
  await admin.from("stripe_customers").delete().eq("user_id", userId).then(() => {}, () => {});

  // 4. The account itself
  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) return reply(500, { error: delErr.message });

  return reply(200, { deleted: true, stripeCancelled });
});
