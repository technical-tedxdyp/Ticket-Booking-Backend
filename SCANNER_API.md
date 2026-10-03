# Scanner API

## Event Scanner Access

For this one-day event, scanner phones use one shared `SCANNER_ACCESS_CODE`; no scanner operator or device records need to be created. Configure it as a private backend environment variable, at least 8 characters long, before deploying this version: startup validation requires it. Generate an unpredictable code and share it only with the event scanning team. Keep it separate from `ADMIN_SECRET_KEY` and `SCANNER_TOKEN_SECRET` (both remain independent random secrets of at least 32 bytes). Admin credentials must be sent in `x-admin-key` or `Authorization: Bearer ...`, never in a URL.

`POST /api/admin/scanner/access` accepts `{ "accessCode": "<shared-code>" }` and returns a signed bearer token that expires after 12 hours. The app stores the token in native SecureStore. Rotating `SCANNER_ACCESS_CODE` immediately invalidates existing scanner tokens. All scan/admission audit entries identify the source as `Event Scanner`, rather than an individual staff member or phone.

The scanner must fail closed: network errors, non-2xx responses, malformed responses, and failed check-ins must not admit anyone. Verification is not admission; only a successful check-in response records entry.

`POST /api/admin/scanner/logout` acknowledges that the app has cleared its local session. Shared scanner tokens are stateless; rotating `SCANNER_ACCESS_CODE` revokes all existing tokens.

## Verify A Ticket

`POST /api/admin/scanner/ticket/verify`

```json
{
    "ticketId": "TEDXABC123",
    "sessionId": "66a123456789012345678901"
}
```

`sessionId` identifies the logical Morning or Evening session. A single-session booking can omit it; a Full Day booking expands to its included sessions and must select one before check-in. The response includes `data.valid`, an `outcome` (`VERIFIED`, `DENIED`, or `DUPLICATE`), `selectedSession`, and `entitledSessions`. Each entitled session includes its previous admission state. Audit records identify the scanner as `Event Scanner` and the device as `event-scanner`.

## Record Admission

`POST /api/admin/scanner/ticket/check-in` accepts the same `ticketId` and `sessionId` fields. Admission is for the whole booking group. The backend permits one admission per booking per logical session. A repeated admission returns HTTP 409; a Full Day booking can be admitted once in Morning and once in Evening. A session ID can be omitted only if the booking has exactly one entitled session.

The entry log and booking check-in status update run in a MongoDB transaction. The database must support transactions (for example, MongoDB Atlas or a replica set). A unique partial index on booking/session/ENTRY adds a concurrency guard.

## Analytics And Audit

- `GET /api/admin/scanner/analytics/scans?from=<ISO>&to=<ISO>&sessionId=<id>` returns scan totals by outcome, actual admission totals, unique bookings admitted, session breakdown, and recent activity.
- `GET /api/admin/scanner/scan-attempts?page=1&limit=20&outcome=DENIED&sessionId=<id>&from=<ISO>&to=<ISO>` returns filtered, paginated attempt records.
- Admins can use the equivalent `/api/admin/analytics/scans` and `/api/admin/scan-attempts` endpoints with the admin key.
- `GET /api/admin/dashboard` includes all-time scan outcome counts and admission counts by session.

Scan attempts (`VERIFIED`, `DENIED`, `DUPLICATE`) are not admissions. Entry logs with action `ENTRY` are the source of truth for admitted groups. Denied check-in requests and duplicate races are also recorded.
Operator and device filters remain available for historical audit records created before the shared-code login.

The Expo app uses the shared access-code endpoint, securely stores its token, selects the session, and only confirms admission after successful check-in. It must not use local mock data or admit while the API is unreachable.
