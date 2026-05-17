# Supervisor Audit Logs

The supervisor system logs page is backed by the `system_audit_log` table and the `GET /api/system-logs` endpoint. Only users with the `SUPERVISOR` role can list these logs.

Logged events include:

- Authentication: login success, safe login failures, invite acceptance, password changes, password resets.
- Invitations: tenant user invited and pending invite removed.
- Tenant lifecycle: tenant created, suspended, reactivated, and legacy admin organization setup.
- Plans: plan created, updated, deactivated, deleted, and checkout blocked because a Stripe Price ID is missing.
- Subscriptions and billing: plan assigned to a tenant, checkout sessions created, subscription status updates, invoice payment results, one-time payment activation, recurring Stripe subscription sync.
- Stripe webhooks: webhook received, signature verification failure, ignored event types, stale checkout session ignored, checkout completion, public onboarding completed or failed.
- Entitlements: plan-limit and API-access denials.

Sensitive values are intentionally not stored or returned. Metadata is sanitized for keys that look like passwords, tokens, secrets, signatures, raw request bodies, or card/CVV fields. Raw Stripe event payloads are not persisted.

Stripe events appear as `WEBHOOK` category logs with `STRIPE_WEBHOOK` as the actor role. Business changes caused by Stripe, such as invoice failures or subscription activation, point at the local subscription/public signup when available.

This is an audit/event trail for a SaaS demo, not a full observability platform. It does not provide external log streaming, distributed tracing, retention automation, replay queues, or long-term archival yet.
