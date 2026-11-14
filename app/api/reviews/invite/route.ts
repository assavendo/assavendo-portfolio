import { NextResponse } from "next/server";
import { hashReviewInvitationToken, REVIEW_INVITE_COOKIE } from "@/lib/review-invitations";
import { siteUrl } from "@/lib/env";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!/^[a-f0-9]{64}$/i.test(token) || !process.env.SUPABASE_SECRET_KEY) return NextResponse.redirect(new URL("/boutique", siteUrl));
  const db = supabaseAdmin();
  const { data: invitation } = await db.from("review_invitations").select("id,order_id,product_id,expires_at,sent_at,completed_at")
    .eq("token_hash", hashReviewInvitationToken(token)).maybeSingle();
  if (!invitation || !invitation.sent_at || invitation.completed_at || (invitation.expires_at && new Date(invitation.expires_at) <= new Date()))
    return NextResponse.redirect(new URL("/boutique", siteUrl));
  const [{ data: order }, { data: product }] = await Promise.all([
    db.from("orders").select("status").eq("id", invitation.order_id).maybeSingle(),
    db.from("products").select("slug,status,allow_reviews").eq("id", invitation.product_id).maybeSingle(),
  ]);
  if (order?.status !== "paid" || !product?.slug || product.status !== "published" || !product.allow_reviews)
    return NextResponse.redirect(new URL("/boutique", siteUrl));
  const response = NextResponse.redirect(new URL("/boutique/" + product.slug + "#avis", siteUrl));
  response.cookies.set({ name: REVIEW_INVITE_COOKIE, value: token, httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 7 * 86_400 });
  response.headers.set("referrer-policy", "no-referrer");
  return response;
}