import type { Request, Response } from "express";
import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { contactMessages, orders, processedStripeEvents } from "../drizzle/schema";
import { getDb } from "./db";
import { ENV } from "./_core/env";

export async function handleStripeWebhook(req: Request, res: Response) {
  if (!ENV.stripeSecret || !ENV.stripeWebhookSecret) {
    res.status(503).json({ error: "Stripe n’est pas entièrement configuré." });
    return;
  }
  const signature = req.header("stripe-signature");
  if (!signature || !Buffer.isBuffer(req.body)) {
    res.status(400).json({ error: "Signature Stripe ou corps brut manquant." });
    return;
  }
  const stripe = new Stripe(ENV.stripeSecret);
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(req.body, signature, ENV.stripeWebhookSecret); }
  catch { res.status(400).json({ error: "Signature Stripe invalide." }); return; }

  const db = await getDb();
  if (!db) { res.status(503).json({ error: "Base de données indisponible." }); return; }
  try {
    await db.transaction(async (tx) => {
      const seen = await tx.select({ eventId: processedStripeEvents.eventId }).from(processedStripeEvents).where(eq(processedStripeEvents.eventId, event.id)).limit(1);
      if (seen.length) return;
      await tx.insert(processedStripeEvents).values({ eventId: event.id, eventType: event.type });
      if (event.type !== "checkout.session.completed") return;
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status !== "paid") return;
      const productId = Number(session.metadata?.productId);
      if (!Number.isInteger(productId) || productId < 1) return;
      const email = session.customer_details?.email ?? session.customer_email ?? "";
      const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id ?? null;
      const existing = await tx.select({ id: orders.id }).from(orders).where(eq(orders.stripeSessionId, session.id)).limit(1);
      const paidAt = new Date(event.created * 1000);
      if (existing.length) {
        await tx.update(orders).set({ status: "paid", paidAt, paymentIntentId: paymentIntentId ?? undefined }).where(eq(orders.stripeSessionId, session.id));
      } else {
        await tx.insert(orders).values({ productId, stripeSessionId: session.id, paymentIntentId, customerEmail: email, amountCents: session.amount_total ?? 0, currency: (session.currency ?? "eur").toUpperCase(), status: "paid", paidAt });
      }
    });
    res.status(200).json({ received: true });
  } catch (error) {
    // If Stripe retries a duplicate concurrent delivery, the unique event ID
    // rolls back its transaction. Returning 500 allows a safe retry.
    console.error("[Stripe webhook] Processing failed:", error instanceof Error ? error.message : "unknown error");
    res.status(500).json({ error: "Traitement temporairement indisponible." });
  }
}
