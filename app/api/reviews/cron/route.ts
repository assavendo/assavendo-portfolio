import { sendDueReviewInvitations } from "@/lib/review-invitations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ ok: false, error: "CRON_SECRET manquant." }, { status: 503 });
  if (request.headers.get("authorization") !== "Bearer " + secret) {
    return Response.json({ ok: false, error: "Non autorisé." }, { status: 401 });
  }
  try {
    const result = await sendDueReviewInvitations(20);
    return Response.json({ ok: true, result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[reviews cron]", error);
    return Response.json({ ok: false, error: "Campagne d'avis indisponible." }, { status: 500 });
  }
}
