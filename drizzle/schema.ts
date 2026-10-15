import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, uniqueIndex, index } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 191 }).notNull().unique(),
  title: varchar("title", { length: 180 }).notNull(),
  summary: varchar("summary", { length: 500 }).notNull(),
  description: text("description").notNull(),
  priceCents: int("priceCents").notNull().default(0),
  currency: varchar("currency", { length: 3 }).notNull().default("EUR"),
  productType: mysqlEnum("productType", ["digital", "physical", "service"]).notNull().default("digital"),
  imageUrl: varchar("imageUrl", { length: 1200 }),
  demoUrl: varchar("demoUrl", { length: 500 }),
  features: text("features"),
  status: mysqlEnum("status", ["draft", "published", "archived"]).notNull().default("draft"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const productLikes = mysqlTable("product_likes", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull().references(() => products.id, { onDelete: "cascade" }),
  visitorId: varchar("visitorId", { length: 80 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ productVisitorUnique: uniqueIndex("product_likes_product_visitor_unique").on(table.productId, table.visitorId) }));

export const productComments = mysqlTable("product_comments", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull().references(() => products.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 80 }).notNull(),
  body: text("body").notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).notNull().default("pending"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ productStatusIndex: index("product_comments_product_status_idx").on(table.productId, table.status) }));

export const productReviews = mysqlTable("product_reviews", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull().references(() => products.id, { onDelete: "cascade" }),
  visitorId: varchar("visitorId", { length: 80 }).notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  rating: int("rating").notNull(),
  body: text("body").notNull(),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).notNull().default("pending"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ productVisitorUnique: uniqueIndex("product_reviews_product_visitor_unique").on(table.productId, table.visitorId), productStatusIndex: index("product_reviews_product_status_idx").on(table.productId, table.status) }));

export const orders = mysqlTable("orders", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId").notNull().references(() => products.id),
  stripeSessionId: varchar("stripeSessionId", { length: 255 }).notNull().unique(),
  paymentIntentId: varchar("paymentIntentId", { length: 255 }),
  customerEmail: varchar("customerEmail", { length: 320 }).notNull(),
  amountCents: int("amountCents").notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("EUR"),
  status: mysqlEnum("status", ["pending", "paid", "canceled", "refunded"]).notNull().default("pending"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  paidAt: timestamp("paidAt"),
}, (table) => ({ orderStatusIndex: index("orders_status_created_idx").on(table.status, table.createdAt) }));

export const processedStripeEvents = mysqlTable("processed_stripe_events", {
  eventId: varchar("eventId", { length: 255 }).primaryKey(),
  eventType: varchar("eventType", { length: 120 }).notNull(),
  processedAt: timestamp("processedAt").defaultNow().notNull(),
});

export const contactMessages = mysqlTable("contact_messages", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 80 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  message: text("message").notNull(),
  status: mysqlEnum("status", ["new", "read", "archived"]).notNull().default("new"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({ statusCreatedIndex: index("contact_messages_status_created_idx").on(table.status, table.createdAt) }));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;
