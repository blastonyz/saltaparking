# Iteration 01 - Roles, Maps, and Plate Validation

## Goal
Deliver a first end-to-end slice for role-driven navigation and operational flows:
- Usuario: geolocation + address search + view available parking spaces.
- Permisionario: check payment/debt status by plate.
- Admin: keep existing admin workflows.

## Functional Requirements
1. Login redirection by role:
- admin -> /admin
- permisionario -> /permisionario
- usuario (default) -> /usuario

2. Home role UX cleanup:
- Hide "Perfil del conductor / Guardar patente" block for permisionario.

3. Usuario map flow:
- Load Google Maps key from MAPS_AK via backend route.
- Get current location (if allowed).
- Allow searching an address.
- Fetch nearby available spaces from DB and show list + markers.

4. Permisionario plate flow:
- Input plate.
- Query backend for last payment status and debt state.
- Render a clear status card.

## Data Assumptions (DB)
### parking_spaces collection
Expected fields:
- name: string
- address: string
- lat: number
- lng: number
- availableSpots: number
- totalSpots: number
- ratePerHour: number
- zoneId?: string

### parking_payments collection
Expected fields:
- plate: string (normalized)
- status: "approved" | "pending" | "rejected"
- amount: number
- paidAt?: Date
- expiresAt?: Date
- zoneId?: string

## API Contract (Iteration 01)
1. GET /api/maps/config
- Auth required.
- Returns { apiKey, hasKey }.

2. GET /api/parking/spaces?lat=&lng=&radius=
- Auth required.
- Returns sorted spaces by distance and availability.

3. GET /api/permisionario/plate-status?plate=
- Auth required, role permisionario/admin.
- Returns normalized plate status summary:
  - hasPayment
  - paymentStatus
  - hasDebt
  - reason

## Non-Goals (this iteration)
- Full payment reconciliation from Mercado Pago webhooks.
- Real-time occupancy updates.
- Advanced map clustering and polygons.

## Next Iterations
1. Bind checkout payment records to plate/zone and auto-update parking_payments.
2. Add map polygons for cuadras and assignment to permisionarios.
3. Add operator actions for debt resolution and manual overrides.
