# Stripe Billing Foundation

This backend includes a Stripe Checkout and webhook foundation for supervisor-managed SaaS subscriptions.

## Required Environment Variables

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_CURRENCY=usd
FRONTEND_URL=http://localhost:5173
```

Optional route overrides:

```bash
STRIPE_SUCCESS_PATH=/platform/billing/success
STRIPE_CANCEL_PATH=/platform/billing/cancel
```

Optional seed price IDs:

```bash
STRIPE_PRICE_FREE=
STRIPE_PRICE_PRO=price_...
STRIPE_PRICE_ENTERPRISE=price_...
```

Plans must have a `stripePriceId` before checkout can be started. The app does not create Stripe products or prices during startup.

## Endpoints

- `POST /api/billing/checkout-session` requires `SUPERVISOR` auth and returns a Stripe Checkout URL.
- `POST /billing/webhook` is public but verifies the Stripe signature using `STRIPE_WEBHOOK_SECRET`.

## Local Webhook Testing

```bash
stripe listen --forward-to localhost:<BACKEND_PORT>/billing/webhook
```

After adding the billing migration, apply migrations with:

```bash
corepack pnpm db:migrate
```
