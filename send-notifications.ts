// ══════════════════════════════════════════════════════════════
// MOCHI — Send Notifications Edge Function
// ══════════════════════════════════════════════════════════════
// HOW TO DEPLOY:
// 1. Go to Supabase dashboard → Edge Functions → send-notifications
// 2. Replace the code with this entire file → Deploy
// 3. Edge Functions → Secrets must contain:
//    VAPID_PRIVATE_KEY = (your private push key — NEVER write it in this file, the GitHub repo is public)
//    NOTIFY_SECRET     = (a long random password only you know — same rule)
//
// WHY NOTIFY_SECRET: Supabase's "Verify JWT" switch also accepts the public anon key
// from mochi.js, so without this check anyone could message every Mochi user.
//
// HOW TO SEND A NOTIFICATION (PowerShell, replace the two values):
//   $h = @{ apikey = '<anon key>'; Authorization = 'Bearer <anon key>'; 'x-mochi-key' = '<NOTIFY_SECRET>' }
//   Invoke-RestMethod -Method POST -Headers $h -ContentType 'application/json' `
//     -Body '{"title":"Mochi 🐰","body":"Hey! Go log a book 🌸"}' `
//     -Uri 'https://lividaycgvgbmsjzldqf.supabase.co/functions/v1/send-notifications'
// ══════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

const VAPID_PUBLIC_KEY = "BJfEl-P7ZUmtL0TM_N_j1Y7wM5wiPeXxdQyb3iwLAKSkeEai9ivUP5AIJBMgq3zTxyX7cT20BsnFyY2MaSJqwOQ";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const NOTIFY_SECRET = Deno.env.get("NOTIFY_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

webpush.setVapidDetails("mailto:readwithmochi@gmail.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

// Constant-time compare so the secret can't be guessed letter by letter
function sameSecret(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  // Only the owner (who knows NOTIFY_SECRET) may send. Refuse if the secret isn't even configured.
  if (!NOTIFY_SECRET || !sameSecret(req.headers.get("x-mochi-key") ?? "", NOTIFY_SECRET)) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const input = await req.json().catch(() => ({}));
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const title = str(input.title, 80);
  const body = str(input.body, 200);
  const url = str(input.url, 200);

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: subs, error } = await sb.from("push_subscriptions").select("user_id, subscription");

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  if (!subs || subs.length === 0) return new Response(JSON.stringify({ sent: 0 }), { status: 200 });

  const payload = JSON.stringify({
    title: title || "Mochi 🐰",
    body: body || "Your shelf is waiting for you! 🌸",
    url: url.startsWith("/Mochi/") ? url : "/Mochi/shelf.html",
  });

  const results = await Promise.allSettled(
    subs.map(({ subscription }) => webpush.sendNotification(subscription, payload))
  );

  // A browser that unsubscribed answers 404/410 — drop those rows so they don't pile up
  const gone = subs.filter((_, i) => {
    const r = results[i];
    return r.status === "rejected" && [404, 410].includes((r.reason as { statusCode?: number })?.statusCode ?? 0);
  }).map((s) => s.user_id);
  if (gone.length) await sb.from("push_subscriptions").delete().in("user_id", gone);

  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - sent;

  return new Response(JSON.stringify({ sent, failed, removed: gone.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
