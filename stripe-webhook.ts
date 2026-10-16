// ══════════════════════════════════════════════════════════════
// MOCHI — Stripe Webhook Edge Function
// ══════════════════════════════════════════════════════════════
// Stripe calls this after someone pays, changes or cancels their plan.
// It switches Mochi Pro on/off in app_metadata (users can't edit that themselves).
//
// Setup steps are in Desktop\Mochi\Stripe_Setup.md. Short version:
// 1. Supabase → Edge Functions → Deploy a new function → name it: stripe-webhook
// 2. Paste this entire file, deploy
// 3. In the function's settings turn OFF "Enforce JWT verification" (Stripe can't log in)
// 4. Supabase → Edge Functions → Secrets → add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET
//    NEVER write those keys in this file — the GitHub repo is public.
// ══════════════════════════════════════════════════════════════

import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!);
const WEBHOOK_SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

// Subscription states where the person still gets Pro (past_due = card failed, Stripe is retrying)
const ACTIVE = ["active", "trialing", "past_due"];

// Returns false (instead of throwing) when the account no longer exists,
// so Stripe gets a 200 and stops retrying for deleted users.
async function setPremium(userId: string, isPremium: boolean): Promise<boolean> {
  const { data, error } = await sb.auth.admin.getUserById(userId);
  if (error || !data?.user) return false;
  const { error: updErr } = await sb.auth.admin.updateUserById(userId, {
    app_metadata: { ...data.user.app_metadata, is_premium: isPremium },
  });
  if (updErr) throw updErr;
  return true;
}

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  // Only accept requests that really come from Stripe
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature ?? "", WEBHOOK_SECRET);
  } catch (err) {
    return new Response(`Invalid signature: ${(err as Error).message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      // Someone finished checkout through a Payment Link
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id; // added by mochi.js to the Payment Link
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        if (!userId || !customerId || session.mode !== "subscription") break;

        // Remember who this Stripe customer is, even before the money arrived,
        // so the subscription events below can find them
        const paid = session.payment_status === "paid";
        await sb.from("stripe_customers").upsert({
          user_id: userId,
          customer_id: customerId,
          status: paid ? "active" : "pending_payment",
          updated_at: new Date().toISOString(),
        });

        // Card payments are "paid" right away. SEPA/Klarna etc. are "unpaid" for a few days —
        // then Pro switches on through customer.subscription.updated once the money is in.
        if (paid) await setPremium(userId, true);
        break;
      }

      // Plan renewed, payment failed for good, cancelled, or cancellation took effect
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
        const { data: row } = await sb
          .from("stripe_customers")
          .select("user_id")
          .eq("customer_id", customerId)
          .maybeSingle();
        if (!row) break;

        // Stripe doesn't promise the order of events. Ask Stripe for the subscription's
        // current state instead of trusting a possibly stale event.
        let status = sub.status;
        try {
          status = (await stripe.subscriptions.retrieve(sub.id)).status;
        } catch (_) { /* subscription gone entirely → fall back to the event's status */ }

        const stillPro = ACTIVE.includes(status);
        await sb.from("stripe_customers")
          .update({ status, updated_at: new Date().toISOString() })
          .eq("customer_id", customerId);
        await setPremium(row.user_id, stillPro);
        break;
      }
    }
  } catch (err) {
    // 500 makes Stripe retry later, so a temporary hiccup doesn't lose a payment
    return new Response(`Handler error: ${(err as Error).message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
