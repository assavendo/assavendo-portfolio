# Stripe Integration TODO

This file is the single source of truth for remaining Stripe Checkout setup work in Assavendo.

## Values to Replace

The Checkout Session already uses real project values for all `sample_only` fields.

**Files containing placeholders:**
- None.

| Field | Current Value | What to Set |
|-------|---------------|-------------|
| mode | `payment` | Already configured for one-time payments. Change only if Assavendo introduces recurring products. |
| success_url | `${siteUrl}/paiement/retour?session_id={CHECKOUT_SESSION_ID}` | Already uses the real application success page. Keep the `{CHECKOUT_SESSION_ID}` template. |
| cancel_url | `${siteUrl}/commande?paiement=annule` | Already uses the real application return page. |
| line_items[].price | Not used | The existing cart is priced server-side with runtime `price_data`; no placeholder Stripe Price ID is present. |

## Configured Parameters

These parameters were configured from Checkout Studio and are implemented in the existing Checkout Session call.

**Files containing these parameters:**
- [app/actions/checkout.ts](app/actions/checkout.ts)

| Parameter | Value |
|-----------|-------|
| ui_mode | `hosted_page` |
| billing_address_collection | `auto` |
| phone_number_collection.enabled | `false` |
| automatic_tax.enabled | `false` |
| allow_promotion_codes | `false` |
| submit_type | `auto` |
| shipping_address_collection.allowed_countries | Checkout Studio country list |
| name_collection.individual.enabled | `true` |
| integration_identifier | `hosted_web_0002` |
| origin_context | `web` |
| mode | `payment` |
| line_items | Existing server-generated cart line items |
| success_url | Existing Assavendo payment-return URL |
| cancel_url | Existing Assavendo order-cancel URL |

Per the Checkout Studio rules, `payment_method_collection` is intentionally not included because this integration uses `mode: payment`.

## Setup and Next Steps

### Environment variables

Production already uses server-side Stripe secrets through Vercel:

- `STRIPE_SECRET_KEY` — sensitive, server-only.
- `STRIPE_WEBHOOK_SECRET` — sensitive, server-only.
- `NEXT_PUBLIC_SITE_URL=https://assavendo.vercel.app`.
- `STRIPE_TAX_ENABLED=false` — intentionally disabled until the merchant's tax registrations are confirmed.

Do not expose secret Stripe keys in browser code, source control, or AI-agent output.

### Stripe webhook

The Live webhook endpoint is configured and enabled as:

`https://assavendo.vercel.app/api/stripe/webhook`

The endpoint is configured for Checkout, invoice, and refund lifecycle events. Verify its delivery health in Stripe Workbench after the production deployment is running.

### Tax

Stripe Tax settings are active and the Live account now has an active GB tax registration. However, Checkout Studio explicitly configured `automatic_tax.enabled=false`, so the application correctly leaves automatic tax calculation disabled for Checkout. Do not enable `STRIPE_TAX_ENABLED` or change the Checkout tax setting independently of the finalized Checkout Studio configuration.

### Project structure

No new Checkout server endpoint was created because Assavendo already had an existing Checkout Session implementation.

Changed:
- [app/actions/checkout.ts](app/actions/checkout.ts) — Checkout Session parameters aligned with Checkout Studio.

Added:
- [STRIPE_INTEGRATION_TODO.md](STRIPE_INTEGRATION_TODO.md) — this source-of-truth file.

### How the integration works

1. Assavendo validates the cart and creates the order in Supabase.
2. The server builds Checkout line items from the validated cart.
3. Stripe Checkout opens as a Stripe-hosted payment page.
4. Stripe sends the payment lifecycle events to the Live webhook.
5. Assavendo verifies the webhook signature and fulfills the order idempotently.
6. The existing order record is linked to the Stripe Checkout Session.

### Testing

Use Stripe Test/Sandbox mode for payment testing.

A standard Stripe test card is:
- `4242 4242 4242 4242`
- Any future expiry date
- Any CVC
- Any postal code

Never use real payment-card data in development or testing.

### Before production validation

- Confirm the current branch changes are merged into the production branch only when ready.
- Confirm the Live Stripe account shows the expected Checkout branding and active GB tax registration.
- Run the project's verification/build checks.
- Open the live Checkout from the Assavendo storefront and verify the hosted payment flow end-to-end.
- Confirm the Stripe webhook receives and processes the Checkout event successfully.
- Confirm the order is fulfilled only from the webhook, not from the success page.
- Confirm refunds are reflected in the Assavendo order state.
- Keep Stripe Tax disabled until tax registrations are verified.

### Resources

- https://support.stripe.com
- https://docs.stripe.com/mcp
