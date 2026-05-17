# Stripe Billing And Public Onboarding

This backend supports public SaaS plan selection, Stripe Checkout, signed webhook provisioning, and a supervisor-only manual checkout fallback.

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

Never expose Stripe secret keys to the frontend. The app does not create Stripe products or prices during startup.

## Public Buyer Flow

1. Public users view active plans from `GET /api/public/plans`.
2. Plan cards route to `/onboarding?planId=<id>`.
3. The onboarding form calls `POST /api/public/onboarding/checkout-session`.
4. Stripe Checkout collects payment.
5. `POST /billing/webhook` verifies the Stripe signature and completes provisioning transactionally.
6. After successful provisioning, the platform creates the tenant, first tenant `ADMIN`, activation invite, and local subscription/access record.

No tenant, admin user, or subscription/access record is created until Stripe confirms payment through the signed webhook.

## Plan Billing Types

Plans support two billing types:

- `RECURRING`: uses Stripe Checkout `subscription` mode and requires a recurring Stripe Price ID.
- `ONE_TIME`: uses Stripe Checkout `payment` mode and requires a one-time Stripe Price ID.

The `stripePriceId` stored on the plan must match the selected billing type. If a plan has no Stripe Price ID, public plans can still display it, but `canSubscribe` is false and checkout is disabled.

Stripe Price type is not validated by the frontend. If Checkout returns “You must provide at least one recurring price in subscription mode,” the plan likely has a one-time Price ID while using `RECURRING`, or a recurring Price ID while using `ONE_TIME`.

## Revenue Reporting

Local records may still use “subscription” to mean tenant plan access.

- `monthlyRecurringRevenue` includes active recurring plans only.
- `oneTimeRevenue` reports completed one-time plan payments separately.
- One-time payments must not be counted as MRR.

## Webhook And Idempotency

The webhook endpoint is public, but every request must pass Stripe signature verification with `STRIPE_WEBHOOK_SECRET`.

Public onboarding completion is transactional and idempotent:

- Duplicate Stripe webhook deliveries do not create duplicate tenants, users, invites, or subscriptions.
- `public_signup` stores durable references to the created tenant, admin user, subscription, completion time, last Stripe event, and failure reason.
- Old checkout sessions are expired when superseded when Stripe allows it.
- If an old checkout link was already paid, webhook handling completes provisioning rather than orphaning the buyer.

## Supervisor Fallback Checkout

`POST /api/billing/checkout-session` remains an internal/manual fallback and requires `SUPERVISOR` authentication. It uses an existing `tenantId` and `planId`. Public visitors must not call this endpoint.

## Local Webhook Testing

Install the Stripe CLI, then forward webhook events to the backend:

```bash
stripe listen --forward-to localhost:<BACKEND_PORT>/billing/webhook
```

Apply migrations before testing billing locally:

```bash
corepack pnpm db:migrate
```

## Troubleshooting

- `Plan has no Stripe Price ID`: add `stripePriceId` to the plan before starting checkout.
- `You must provide at least one recurring price in subscription mode`: the plan billing type and Stripe Price type do not match.
- `Webhook succeeded but invite not received`: check backend mail logs. In development, the invite link may be printed by the backend mail service instead of delivered by email.
- `Duplicate webhook delivery`: Stripe retries are expected. The webhook should log and return safely without creating duplicate records.
- `Old checkout link expired`: start onboarding again from the plan card so the backend creates a fresh valid session.
- Webhook signature mismatch: confirm `STRIPE_WEBHOOK_SECRET` matches the active `stripe listen` session.
- Test/live key mismatch: use test secret keys, test Price IDs, and the matching test webhook secret together.
