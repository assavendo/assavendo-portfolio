# Assavendo — Production Runbook

## Scope

This runbook covers the operational response for production checkout, fulfillment, webhooks, refunds, market activation, catalog publication, cron supervision and rollback.

## 1. Before opening a product for sale

A product must be published only after all of the following are true:

- real title, slug and summary;
- complete description and concrete feature list;
- at least one usable product image with meaningful alternative text;
- valid category and a sellable category/family;
- final EUR price and, when relevant, comparison price;
- deliverable present in the private `deliverables` bucket for digital goods;
- delivery / return / warranty information populated when applicable;
- product tested from product page → cart → checkout;
- market and tax/compliance decisions validated for the intended buyer country.

The public catalog also applies a code-level readiness filter, so incomplete placeholder records are not exposed even if a database row is accidentally marked `published`.

## 2. Successful payment but no fulfillment

1. Check Stripe for the Checkout Session and PaymentIntent.
2. Confirm the Live webhook received the event.
3. Check `public.stripe_events` for the Stripe event ID.
4. Check the matching order by `stripe_session_id`, `payment_intent_id` or order metadata.
5. Never fulfill manually from the browser success page alone.
6. If the payment is confirmed but the order remains unfulfilled, preserve the Stripe evidence, set the order to manual review if appropriate, and repair fulfillment through the server-side order workflow.
7. For a digital order, verify that the download token is present and that the delivery e-mail has either been sent or is explicitly marked for retry.

## 3. Webhook failure

The webhook intentionally returns HTTP 500 when a recoverable database/fulfillment step fails so Stripe can retry the event.

When investigating:

- validate the Stripe signature configuration;
- identify the exact event ID and event type;
- inspect `public.stripe_events` and the related order;
- check whether the order was already fulfilled, canceled or refunded;
- inspect Vercel runtime logs;
- do not mark an event as processed manually unless the underlying business action is already known to be complete.

Duplicate events are expected to be harmless because processing is guarded by the event log and idempotent fulfillment functions.

## 4. Delayed payment failures and checkout expiration

For `checkout.session.async_payment_failed` and `checkout.session.expired`, only a still-pending order is canceled. Reserved stock is then released. A later failure must never overwrite an already fulfilled order.

## 5. Refunds

A refunded Charge must:

- move the linked order to `refunded`;
- invalidate the order download token;
- invalidate item-level download tokens;
- update an applicable return request.

Before confirming a refund to a customer, verify the refund in Stripe and then verify the corresponding Assavendo order state.

## 6. Market activation

A market is not considered open merely because `ship_enabled` is true.

For checkout eligibility, the country must be explicitly sell-enabled and have all required market readiness statuses in an approved/legacy state. New countries should remain disabled until tax, shipping, compliance, pricing and payment decisions are complete.

## 7. Catalog incident response

If a bad or placeholder product appears publicly:

1. Set the product back to `draft`.
2. Confirm `public.products` has no unintended `published` row.
3. Verify the public storefront and sitemap no longer expose the product.
4. Keep the underlying asset only when it may be reused; otherwise clean it during the controlled test-data cleanup.

## 8. Cron supervision

The production cron endpoints require `CRON_SECRET`. The secret must exist only in the server environment and must never be placed in a `NEXT_PUBLIC_*` variable, source code or client bundle.

After configuring it, verify both scheduled endpoints and inspect Vercel logs for their first successful execution.

## 9. Rollback

For an application regression:

1. Stop further production changes.
2. Identify the last known-good Vercel deployment.
3. Prefer a Vercel rollback to the known-good production deployment when the current release is unhealthy.
4. If the regression involves database schema/data, do not roll back application code independently of the database state without checking compatibility.
5. Record the failing deployment, commit, database migration/change and customer impact.

## 10. Final zero-to-purchase validation

A release is not considered commercially validated until a controlled end-to-end test proves:

storefront → real product → cart → terms/waiver when required → Checkout → successful payment → webhook → paid order → fulfillment/delivery e-mail → download/order tracking → refund/revocation where applicable.

This validation must use Stripe Test mode for development and a deliberate Live smoke purchase only when a human operator is ready to authorize the real charge.

