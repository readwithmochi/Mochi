// ══════════════════════════════════════════════════════════════
// MOCHI — Send Notifications Edge Function
// ══════════════════════════════════════════════════════════════
// HOW TO DEPLOY:
// 1. Go to Supabase dashboard → Edge Functions → New Function
// 2. Name it: send-notifications
// 3. Paste this entire file
// 4. Go to Settings → Secrets and add:
//    VAPID_PRIVATE_KEY = (your private key — NEVER write it in this file, the GitHub repo is public)
// 5. Click Deploy
//
// HOW TO SEND A NOTIFICATION (test it):
// Go to the function URL and send a POST with JSON body:
// { "title": "Mochi 🐰", "body": "Hey! Go log a book 🌸" }
// ══════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

const VAPID_PUBLIC_KEY = "BGQOH5JoGLOfqsBle0HhYYZAOfzfu4vFoOEN1OgYedb48wJgogUO_SrU7yZabr_Bz45KGgrvZrNnbhWz_4ciwtE";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

webpush.setVapidDetails("mailto:maeijansen28@gmail.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { title, body, url } = await req.json().catch(() => ({}));

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const { data: subs, error } = await sb.from("push_subscriptions").select("subscription");

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  if (!subs || subs.length === 0) return new Response(JSON.stringify({ sent: 0 }), { status: 200 });

  const payload = JSON.stringify({
    title: title || "Mochi 🐰",
    body: body || "Your shelf is waiting for you! 🌸",
    url: url || "/Mochi/shelf.html",
  });

  const results = await Promise.allSettled(
    subs.map(({ subscription }) => webpush.sendNotification(subscription, payload))
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - sent;

  return new Response(JSON.stringify({ sent, failed }), {
    headers: { "Content-Type": "application/json" },
  });
});
