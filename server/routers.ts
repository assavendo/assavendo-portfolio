import { and, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import Stripe from "stripe";
import { TRPCError } from "@trpc/server";
import { contactMessages, orders, productComments, productLikes, productReviews, products } from "../drizzle/schema";
import { getDb } from "./db";
import { ENV } from "./_core/env";
import { getSessionCookieOptions } from "./_core/cookies";
import { COOKIE_NAME } from "@shared/const";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Le service de données est momentanément indisponible." });
  return db;
}
function parseFeatures(value: string | null | undefined): string[] {
  if (!value) return [];
  try { const result: unknown = JSON.parse(value); return Array.isArray(result) ? result.filter((item): item is string => typeof item === "string") : []; }
  catch { return []; }
}
function publicProduct(product: typeof products.$inferSelect) { return { ...product, features: parseFeatures(product.features) }; }
function slugify(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

async function getProductStats(database: Awaited<ReturnType<typeof requireDb>>, productId: number, visitorId?: string) {
  const [likeCount] = await database.select({ total: count() }).from(productLikes).where(eq(productLikes.productId, productId));
  const [reviewSummary] = await database.select({ total: count(), rating: sql<number>`COALESCE(AVG(${productReviews.rating}), 0)` }).from(productReviews).where(and(eq(productReviews.productId, productId), eq(productReviews.status, "approved")));
  const [commentCount] = await database.select({ total: count() }).from(productComments).where(and(eq(productComments.productId, productId), eq(productComments.status, "approved")));
  const recentComments = await database.select({ id: productComments.id, name: productComments.name, body: productComments.body, createdAt: productComments.createdAt }).from(productComments).where(and(eq(productComments.productId, productId), eq(productComments.status, "approved"))).orderBy(desc(productComments.createdAt)).limit(10);
  let liked = false;
  if (visitorId) {
    const existing = await database.select({ id: productLikes.id }).from(productLikes).where(and(eq(productLikes.productId, productId), eq(productLikes.visitorId, visitorId))).limit(1);
    liked = existing.length > 0;
  }
  return { likes: Number(likeCount?.total ?? 0), reviews: Number(reviewSummary?.total ?? 0), rating: Number(reviewSummary?.rating ?? 0), comments: Number(commentCount?.total ?? 0), liked, recentComments };
}

const productInput = z.object({
  id: z.number().int().positive().optional(),
  title: z.string().trim().min(2).max(180),
  slug: z.string().trim().max(191).optional(),
  summary: z.string().trim().min(12).max(500),
  description: z.string().trim().min(20).max(12000),
  priceCents: z.number().int().min(0).max(100000000),
  productType: z.enum(["digital", "physical", "service"]),
  imageUrl: z.string().trim().max(1200).optional().or(z.literal("")),
  demoUrl: z.string().trim().max(500).optional().or(z.literal("")),
  features: z.array(z.string().trim().min(2).max(160)).max(12),
  status: z.enum(["draft", "published", "archived"]),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  contact: router({
    submit: publicProcedure.input(z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().email().max(320), message: z.string().trim().min(12).max(4000) })).mutation(async ({ input }) => {
      const database = await requireDb();
      await database.insert(contactMessages).values({ name: input.name, email: input.email.toLowerCase(), message: input.message });
      return { success: true, message: "Merci, votre demande a été transmise à Assavendo." };
    }),
  }),
  product: router({
    list: publicProcedure.query(async () => {
      const database = await requireDb();
      const rows = await database.select().from(products).where(eq(products.status, "published")).orderBy(desc(products.createdAt)).limit(100);
      return Promise.all(rows.map(async (row) => ({ ...publicProduct(row), ...(await getProductStats(database, row.id)) })));
    }),
    bySlug: publicProcedure.input(z.object({ slug: z.string().min(1).max(191), visitorId: z.string().max(80).optional() })).query(async ({ input }) => {
      const database = await requireDb();
      const [row] = await database.select().from(products).where(and(eq(products.slug, input.slug), eq(products.status, "published"))).limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Produit introuvable ou non publié." });
      return { product: publicProduct(row), stats: await getProductStats(database, row.id, input.visitorId) };
    }),
    checkoutReady: publicProcedure.query(() => ({ ready: Boolean(ENV.stripeSecret && ENV.stripeWebhookSecret) })),
    toggleLike: publicProcedure.input(z.object({ productId: z.number().int().positive(), visitorId: z.string().uuid() })).mutation(async ({ input }) => {
      const database = await requireDb();
      const [item] = await database.select({ id: products.id }).from(products).where(and(eq(products.id, input.productId), eq(products.status, "published"))).limit(1);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Produit non disponible." });
      const [existing] = await database.select({ id: productLikes.id }).from(productLikes).where(and(eq(productLikes.productId, input.productId), eq(productLikes.visitorId, input.visitorId))).limit(1);
      if (existing) await database.delete(productLikes).where(eq(productLikes.id, existing.id));
      else await database.insert(productLikes).values({ productId: input.productId, visitorId: input.visitorId });
      return { liked: !existing };
    }),
    addComment: publicProcedure.input(z.object({ productId: z.number().int().positive(), name: z.string().trim().min(2).max(80), body: z.string().trim().min(3).max(1200) })).mutation(async ({ input }) => {
      const database = await requireDb();
      const [item] = await database.select({ id: products.id }).from(products).where(and(eq(products.id, input.productId), eq(products.status, "published"))).limit(1);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Produit non disponible." });
      await database.insert(productComments).values({ productId: input.productId, name: input.name, body: input.body, status: "pending" });
      return { success: true, message: "Commentaire envoyé. Il sera visible après modération." };
    }),
    addReview: publicProcedure.input(z.object({ productId: z.number().int().positive(), visitorId: z.string().uuid(), name: z.string().trim().min(2).max(80), rating: z.number().int().min(1).max(5), body: z.string().trim().min(10).max(1500) })).mutation(async ({ input }) => {
      const database = await requireDb();
      const [item] = await database.select({ id: products.id }).from(products).where(and(eq(products.id, input.productId), eq(products.status, "published"))).limit(1);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Produit non disponible." });
      const [existing] = await database.select({ id: productReviews.id }).from(productReviews).where(and(eq(productReviews.productId, input.productId), eq(productReviews.visitorId, input.visitorId))).limit(1);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "Un avis a déjà été envoyé depuis ce navigateur." });
      await database.insert(productReviews).values({ productId: input.productId, visitorId: input.visitorId, name: input.name, rating: input.rating, body: input.body, status: "pending" });
      return { success: true, message: "Merci pour votre avis. Il sera publié après modération." };
    }),
    createCheckout: publicProcedure.input(z.object({ productId: z.number().int().positive(), email: z.string().trim().email().max(320) })).mutation(async ({ input, ctx }) => {
      if (!ENV.stripeSecret || !ENV.stripeWebhookSecret) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Le paiement test est en préparation. La clé de webhook Stripe doit d’abord être configurée dans l’administration sécurisée." });
      const origin = ctx.req.get("origin");
      const referer = ctx.req.get("referer");
      if (!origin || !referer) throw new TRPCError({ code: "BAD_REQUEST", message: "Origine du paiement non vérifiée." });
      try { if (new URL(referer).origin !== new URL(origin).origin) throw new Error("origin mismatch"); }
      catch { throw new TRPCError({ code: "BAD_REQUEST", message: "Origine du paiement non vérifiée." }); }
      const database = await requireDb();
      const [item] = await database.select().from(products).where(and(eq(products.id, input.productId), eq(products.status, "published"))).limit(1);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Produit non disponible." });
      if (item.priceCents < 50) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Le prix doit respecter le minimum de paiement Stripe pour être encaissé." });
      const stripe = new Stripe(ENV.stripeSecret);
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        allowed_payment_method_types: ["card"],
        customer_email: input.email.toLowerCase(),
        client_reference_id: `product-${item.id}`,
        allow_promotion_codes: true,
        line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: item.priceCents, product_data: { name: item.title, description: item.summary, ...(item.imageUrl?.startsWith("https://") ? { images: [item.imageUrl] } : {}) } } }],
        metadata: { productId: String(item.id), productSlug: item.slug, customer_email: input.email.toLowerCase() },
        payment_intent_data: { metadata: { productId: String(item.id), productSlug: item.slug } },
        success_url: `${origin}/paiement/retour?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/paiement/retour?cancel=1&product=${encodeURIComponent(item.slug)}`,
      });
      if (!session.url) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Stripe n’a pas renvoyé de lien de paiement." });
      await database.insert(orders).values({ productId: item.id, stripeSessionId: session.id, customerEmail: input.email.toLowerCase(), amountCents: item.priceCents, currency: "EUR", status: "pending" });
      return { url: session.url };
    }),
    orderStatus: publicProcedure.input(z.object({ sessionId: z.string().min(8).max(255) })).query(async ({ input }) => {
      const database = await requireDb();
      const [result] = await database.select({ status: orders.status, amountCents: orders.amountCents, currency: orders.currency, productTitle: products.title, createdAt: orders.createdAt }).from(orders).innerJoin(products, eq(orders.productId, products.id)).where(eq(orders.stripeSessionId, input.sessionId)).limit(1);
      return result ?? null;
    }),
  }),
  admin: router({
    dashboard: adminProcedure.query(async () => {
      const database = await requireDb();
      const [[productCount], [orderCount], [pendingCommentCount], [pendingReviewCount], [newContactCount]] = await Promise.all([
        database.select({ total: count() }).from(products),
        database.select({ total: count() }).from(orders),
        database.select({ total: count() }).from(productComments).where(eq(productComments.status, "pending")),
        database.select({ total: count() }).from(productReviews).where(eq(productReviews.status, "pending")),
        database.select({ total: count() }).from(contactMessages).where(eq(contactMessages.status, "new")),
      ]);
      const [paidSummary] = await database.select({ total: count(), revenue: sql<number>`COALESCE(SUM(${orders.amountCents}), 0)` }).from(orders).where(eq(orders.status, "paid"));
      const revenue = Number(paidSummary?.revenue ?? 0);
      return { products: Number(productCount?.total ?? 0), orders: Number(orderCount?.total ?? 0), pendingComments: Number(pendingCommentCount?.total ?? 0), pendingReviews: Number(pendingReviewCount?.total ?? 0), newContacts: Number(newContactCount?.total ?? 0), paidOrders: Number(paidSummary?.total ?? 0), revenueCents: revenue };
    }),
    products: adminProcedure.query(async () => {
      const database = await requireDb();
      return (await database.select().from(products).orderBy(desc(products.updatedAt)).limit(200)).map(publicProduct);
    }),
    saveProduct: adminProcedure.input(productInput).mutation(async ({ input }) => {
      const database = await requireDb();
      if (input.status === "published" && input.priceCents < 50) throw new TRPCError({ code: "BAD_REQUEST", message: "Un produit publié doit coûter au moins 0,50 € pour le paiement Stripe." });
      const slug = slugify(input.slug || input.title);
      if (!slug) throw new TRPCError({ code: "BAD_REQUEST", message: "Ajoutez un titre ou un identifiant valide." });
      if (input.imageUrl && !/^https:\/\//i.test(input.imageUrl) && !input.imageUrl.startsWith("/manus-storage/")) throw new TRPCError({ code: "BAD_REQUEST", message: "L’image doit provenir d’une adresse HTTPS ou du stockage Assavendo." });
      if (input.demoUrl) {
        let safeDemoUrl = /^\/demos\/[a-z0-9-]+$/i.test(input.demoUrl);
        try { safeDemoUrl ||= new URL(input.demoUrl).protocol === "https:"; } catch { /* only the internal route may be relative */ }
        if (!safeDemoUrl) throw new TRPCError({ code: "BAD_REQUEST", message: "La démonstration doit utiliser une route /demos/ ou une adresse HTTPS." });
      }
      const values = { slug, title: input.title, summary: input.summary, description: input.description, priceCents: input.priceCents, currency: "EUR", productType: input.productType, imageUrl: input.imageUrl || null, demoUrl: input.demoUrl || null, features: JSON.stringify(input.features), status: input.status };
      if (input.id) {
        const [existing] = await database.select({ id: products.id }).from(products).where(eq(products.id, input.id)).limit(1);
        if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Produit introuvable." });
        await database.update(products).set(values).where(eq(products.id, input.id));
        return { id: input.id, slug };
      }
      const inserted = await database.insert(products).values(values);
      return { id: Number(inserted[0].insertId), slug };
    }),
    setProductStatus: adminProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(["draft", "published", "archived"]) })).mutation(async ({ input }) => {
      const database = await requireDb();
      const [item] = await database.select({ id: products.id, priceCents: products.priceCents }).from(products).where(eq(products.id, input.id)).limit(1);
      if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Produit introuvable." });
      if (input.status === "published" && item.priceCents < 50) throw new TRPCError({ code: "BAD_REQUEST", message: "Un produit publié doit coûter au moins 0,50 € pour le paiement Stripe." });
      await database.update(products).set({ status: input.status }).where(eq(products.id, input.id));
      return { success: true };
    }),
    pendingComments: adminProcedure.query(async () => {
      const database = await requireDb();
      return database.select({ id: productComments.id, productId: productComments.productId, productTitle: products.title, name: productComments.name, body: productComments.body, createdAt: productComments.createdAt }).from(productComments).innerJoin(products, eq(productComments.productId, products.id)).where(eq(productComments.status, "pending")).orderBy(desc(productComments.createdAt)).limit(100);
    }),
    moderateComment: adminProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(["approved", "rejected"]) })).mutation(async ({ input }) => {
      const database = await requireDb();
      await database.update(productComments).set({ status: input.status }).where(eq(productComments.id, input.id));
      return { success: true };
    }),
    pendingReviews: adminProcedure.query(async () => {
      const database = await requireDb();
      return database.select({ id: productReviews.id, productId: productReviews.productId, productTitle: products.title, name: productReviews.name, rating: productReviews.rating, body: productReviews.body, createdAt: productReviews.createdAt }).from(productReviews).innerJoin(products, eq(productReviews.productId, products.id)).where(eq(productReviews.status, "pending")).orderBy(desc(productReviews.createdAt)).limit(100);
    }),
    moderateReview: adminProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(["approved", "rejected"]) })).mutation(async ({ input }) => {
      const database = await requireDb();
      await database.update(productReviews).set({ status: input.status }).where(eq(productReviews.id, input.id));
      return { success: true };
    }),
    orders: adminProcedure.query(async () => {
      const database = await requireDb();
      return database.select({ id: orders.id, productTitle: products.title, customerEmail: orders.customerEmail, amountCents: orders.amountCents, currency: orders.currency, status: orders.status, createdAt: orders.createdAt, paidAt: orders.paidAt }).from(orders).innerJoin(products, eq(orders.productId, products.id)).orderBy(desc(orders.createdAt)).limit(200);
    }),
    contacts: adminProcedure.query(async () => {
      const database = await requireDb();
      return database.select().from(contactMessages).orderBy(desc(contactMessages.createdAt)).limit(200);
    }),
    updateContactStatus: adminProcedure.input(z.object({ id: z.number().int().positive(), status: z.enum(["read", "archived"]) })).mutation(async ({ input }) => {
      const database = await requireDb();
      await database.update(contactMessages).set({ status: input.status }).where(eq(contactMessages.id, input.id));
      return { success: true };
    }),
  }),
});

export type AppRouter = typeof appRouter;
