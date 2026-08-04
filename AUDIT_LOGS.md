# Audit Logs

Pricify writes internal application events to the `system_audit_log` table. Audit access is restricted to internal administrator users.

Logged events include:

- Authentication: successful logins, safe login failures, invitation acceptance, password changes, and password resets.
- Invitations: user invitations and pending invitation removal.
- Tenant and organization setup: tenant creation, suspension, reactivation, and internal organization setup.
- Operational changes: user, hotel, affiliate, contract, integration, proforma, and system-level events that call the shared audit service.

Sensitive values are intentionally not stored or returned. Metadata is sanitized for keys that look like passwords, tokens, secrets, signatures, raw request bodies, or card/CVV fields.

This is an internal audit trail, not a full observability platform. It does not provide external log streaming, distributed tracing, retention automation, replay queues, or long-term archival.
