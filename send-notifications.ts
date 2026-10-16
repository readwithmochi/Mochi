// MOCHI - Send Notifications Edge Function
// Deploy: Supabase -> Edge Functions -> send-notifications -> Code -> paste -> Deploy
// Secrets needed: VAPID_PRIVATE_KEY and NOTIFY_SECRET (never in this file, the repo is public)
// NOTIFY_SECRET: Supabase's JWT check also lets the public anon key through,
// so without this header check anyone could message every Mochi user.
//
// Send one (PowerShell):
//   $h = @{ apikey = 'ANON_KEY'; Authorization = 'Bearer ANON_KEY'; 'x-mochi-key' = 'NOTIFY_SECRET' }
//   Invoke-RestMethod -Method POST -Headers $h -ContentType 'application/json' -Body '{"title":"Mochi","body":"Go log a book"}' -Uri 'https://lividaycgvgbmsjzldqf.supabase.co/functions/v1/send-notifications'

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

const VAPID_PUBLIC_KEY = "BJfEl-P7ZUmtL0TM_N_j1Y7wM5wiPeXxdQyb3iwLAKSkeEai9ivUP5AIJBMgq3zTxyX7cT20BsnFyY2MaSJqwOQ";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const NOTIFY_SECRET = Deno.env.get("NOTIFY_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

webpush.setVapidDetails("mailto:readwithmochi@gmail.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

Deno.serve(async (req) => {
  const key = req.headers.get("x-mochi-key") ?? "";
  if (NOTIFY_SECRET === "" || key !== NOTIFY_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const input = await req.json().catch(() => ({}));
  const title = text(input.title, 80) || "Mochi 🐰";
  const body = text(input.body, 200) || "Your shelf is waiting for you! 🌸";
  const url = text(input.url, 200);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: subs, error } = await sb.from("push_subscriptions").select("user_id, subscription");
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  if (!subs || subs.length === 0) return new Response(JSON.stringify({ sent: 0 }), { status: 200 });

  const payload = JSON.stringify({
    title,
    body,
    url: url.startsWith("/Mochi/") ? url : "/Mochi/shelf.html",
  });

  const results = await Promise.allSettled(
    subs.map((row) => webpush.sendNotification(row.subscription, payload))
  );

  // A browser that unsubscribed answers 404 or 410: remove those rows
  const gone: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      const code = (r.reason as { statusCode?: number })?.statusCode ?? 0;
      if (code === 404 || code === 410) gone.push(subs[i].user_id);
    }
  });
  if (gone.length > 0) await sb.from("push_subscriptions").delete().in("user_id", gone);

  const sent = results.filter((r) => r.status === "fulfilled").length;
  return new Response(JSON.stringify({ sent, failed: results.length - sent, removed: gone.length }), {
    headers: { "Content-Type": "application/json" },
  });
});
