# Scanner API

The scanner uses individually provisioned operator credentials and a provisioned device secret. Scanner tokens expire after 12 hours and are revoked when the operator or device is updated/deactivated. Set independent random secrets of at least 32 bytes for `ADMIN_SECRET_KEY` and `SCANNER_TOKEN_SECRET`; there is no default admin key. Admin credentials must be sent in `x-admin-key` or `Authorization: Bearer ...`, never in a URL.

The scanner must fail closed: network errors, non-2xx responses, malformed responses, and failed check-ins must not admit anyone. Verification is not admission; only a successful check-in response records entry.

## Provision Operators And Devices

These management endpoints require the admin key.

- `POST /api/admin/scanner-devices` with `{ "deviceId": "<stable-device-id>", "name": "Entrance A" }` provisions a device and returns a random `deviceSecret` once. Store it in the app's secure storage. It cannot be retrieved later.
- `GET /api/admin/scanner-devices` lists device metadata without secrets.
- `PATCH /api/admin/scanner-devices/:deviceId` accepts `{ "isActive": false }` to revoke the device, `{ "isActive": true }` to re-enable it, or `{ "rotateSecret": true }` to rotate its secret. Any update revokes existing tokens.
- `POST /api/admin/scanner-operators` with `{ "username": "operator.name", "password": "at-least-12-characters", "role": "SCANNER" }` creates an operator. Roles are `SCANNER` and `SUPERVISOR`.
- `GET /api/admin/scanner-operators` lists operators without password hashes.
- `PATCH /api/admin/scanner-operators/:id` accepts a new `password`, `isActive`, and/or `role`; any update revokes existing tokens.

Both roles currently have the same scan permissions; the role is recorded for audit and future supervisor-only workflows. There is no override endpoint in this version: the agreed one-admission-per-session rule remains authoritative.

## Scanner Login

`POST /api/admin/scanner/login` is public and requires all credentials:

```json
{
    "username": "operator.name",
    "password": "operator-password",
    "deviceId": "stable-device-id",
    "deviceSecret": "one-time-provisioned-device-secret"
}
```

The response includes a short-lived bearer token, its lifetime, operator identity, and device identity. Send that token as `Authorization: Bearer <token>` to scanner endpoints. The server rechecks operator/device active state and token versions on each request, so deactivation and credential rotation take effect immediately.

`POST /api/admin/scanner/logout` revokes all active tokens for that operator. Call it before clearing the local token when possible.

## Verify A Ticket

`POST /api/admin/scanner/ticket/verify`

```json
{
    "ticketId": "TEDXABC123",
    "sessionId": "66a123456789012345678901"
}
```

`sessionId` identifies the logical Morning or Evening session. A single-session booking can omit it; a Full Day booking expands to its included sessions and must select one before check-in. The response includes `data.valid`, an `outcome` (`VERIFIED`, `DENIED`, or `DUPLICATE`), `selectedSession`, and `entitledSessions`. Each entitled session includes its previous admission state. Operator and device audit identity comes from the authenticated token, not the request body.

## Record Admission

`POST /api/admin/scanner/ticket/check-in` accepts the same `ticketId` and `sessionId` fields. Admission is for the whole booking group. The backend permits one admission per booking per logical session. A repeated admission returns HTTP 409; a Full Day booking can be admitted once in Morning and once in Evening. A session ID can be omitted only if the booking has exactly one entitled session.

The entry log and booking check-in status update run in a MongoDB transaction. The database must support transactions (for example, MongoDB Atlas or a replica set). A unique partial index on booking/session/ENTRY adds a concurrency guard.

## Analytics And Audit

- `GET /api/admin/scanner/analytics/scans?from=<ISO>&to=<ISO>&sessionId=<id>&operatorId=<id>&deviceId=<id>` returns scan totals by outcome, actual admission totals, unique bookings admitted, session breakdown, and recent activity.
- `GET /api/admin/scanner/scan-attempts?page=1&limit=20&outcome=DENIED&sessionId=<id>&operatorId=<id>&deviceId=<id>&from=<ISO>&to=<ISO>` returns filtered, paginated attempt records.
- Admins can use the equivalent `/api/admin/analytics/scans` and `/api/admin/scan-attempts` endpoints with the admin key.
- `GET /api/admin/dashboard` includes all-time scan outcome counts and admission counts by session.

Scan attempts (`VERIFIED`, `DENIED`, `DUPLICATE`) are not admissions. Entry logs with action `ENTRY` are the source of truth for admitted groups. Denied check-in requests and duplicate races are also recorded.

The Expo app still needs to be updated to use these scanner routes, securely store the device secret/token, select the session, display the server result, and only show admission after check-in succeeds. It must not use local mock data or admit while the API is unreachable.
