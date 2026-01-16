# Backend API Reference

Base path: `/api/v1`

Authentication: Most endpoints require a Bearer token in the `Authorization` header:

- Header: `Authorization: Bearer <token>`

---

## Auth

- POST `/api/v1/auth/signup`

  - Description: Create a new user (RIDER or CAPTAIN). Creates a `RiderProfile` or `CaptainProfile` depending on role.
  - Body (application/json):
    - `email` (string) - required
    - `password` (string) - required
    - `fullName` (string) - required
    - `phone` (string) - required
    - `role` ("RIDER" | "CAPTAIN") - required
    - `vehicleDetails` (object) - required when role is `CAPTAIN`:
      - `number` (string)
      - `model` (string)
      - `color` (string)
      - `type` ("CAR"|"BIKE"|"AUTO")
  - Response 201:
    - `message`: string
    - `user`: user object (password omitted)
    - `token`: JWT string

- POST `/api/v1/auth/login`

  - Description: Authenticate user and return a JWT.
  - Body (application/json):
    - `email` (string)
    - `password` (string)
  - Response 200:
    - `message`: string
    - `user`: user object (password omitted)
    - `token`: JWT string

- GET `/api/v1/auth/profile` (authenticated)
  - Description: Return profile information for the logged-in user.
  - Response 200:
    - `user`: object with `id`, `email`, `fullName`, `phone`, `role`, `createdAt`, and nested `riderProfile` or `captainProfile` when present.

---

## Captain (requires `CAPTAIN` role where noted)

- PATCH `/api/v1/captain/toggle-status` (authenticated, role: CAPTAIN)

  - Description: Toggle captain online/offline. When going online: creates a `Shift` with `startTime`. When going offline: closes the active `Shift` by setting `endTime`.
  - Body: none
  - Response 200:
    - `message`: string
    - `isOnline`: boolean

- POST `/api/v1/captain/update-location` (authenticated, role: CAPTAIN)

  - Description: Update captain's current location (stores in `CaptainProfile` and Redis geo set).
  - Body (application/json):
    - `latitude` (number)
    - `longitude` (number)
  - Response 200:
    - `message`: string
    - `location`: { `latitude`, `longitude` }
    - `isOnline`: boolean

- GET `/api/v1/captain/nearby` (authenticated, role: RIDER)

  - Query params:
    - `latitude` (number) - required
    - `longitude` (number) - required
    - `radius` (number) - optional (km, default 5)
  - Response 200:
    - `captains`: array of nearby captains:
      - `id` (CaptainProfile id)
      - `fullName` (string)
      - `lastLat` (number)
      - `lastLng` (number)
      - `rating` (number)

- GET `/api/v1/captain/status` (authenticated, role: CAPTAIN)

  - Description: Returns online/available status of the captain.
  - Response 200:
    - `isOnline`: boolean
    - `isAvailable`: boolean

- GET `/api/v1/captain/analytics` (authenticated, role: CAPTAIN)
  - Description: Daily analytics (for current day) for the captain's `CaptainProfile`.
  - Response 200:
    - `totalEarnings`: number (sum of `fare` from COMPLETED rides today)
    - `totalTrips`: number (count of COMPLETED rides today)
    - `totalOnlineHours`: number (sum of shift durations today, in hours, decimal)
    - `date`: string (YYYY-MM-DD)

---

## Ride

- GET `/api/v1/ride/details/:userId` (authenticated)

  - Description: Fetch the most recent active ride for the user. If request made by a RIDER, returns ride info including captain details. If made by a CAPTAIN, returns ride info including rider details (flattened fields).
  - Params:
    - `userId` (number) - path param
  - Response 200:
    - `ride`: object or `null`. Example shapes:
      - For rider (when a captain is assigned):
        - `rideId`, `status`, `pickupAddress`, `pickupLat`, `pickupLng`, `dropoffAddress`, `dropoffLat`, `dropoffLng`, `fare`, `otp`, `captainName`, `captainRating`, `captainLocation`, `captainIsOnline`
      - For captain:
        - `rideId`, `status`, `riderName`, `pickupAddress`, `dropoffAddress`, `pickupLat`, `pickupLng`, `dropoffLat`, `dropoffLng`, `fare`, `otp`

- POST `/api/v1/ride/calculate-fare` (authenticated, role: RIDER)

  - Body (application/json):
    - `vehicleType` ("CAR"|"BIKE"|"AUTO")
    - `pickupCoords`: { `lat`: number, `lng`: number }
    - `destCoords`: { `lat`: number, `lng`: number }
  - Response 200:
    - `estimatedCost`: number

- POST `/api/v1/ride/create-ride` (authenticated, role: RIDER)

  - Body (application/json):
    - `vehicleType`: "CAR"|"BIKE"|"AUTO"
    - `pickupCoords`: { `lat`, `lng` }
    - `destCoords`: { `lat`, `lng` }
    - `pickup` (string) - pickup address
    - `destination` (string) - dropoff address
  - Response 201:
    - `message`: string
    - `ride`: ride object (contains `id`, `riderId`, pickup/dropoff coords, `fare`, `otp`, `status`)
  - Notes: New ride notifies nearby captains via socket events; notifications are sent to captain user IDs.

- POST `/api/v1/ride/accept-ride` (authenticated, role: CAPTAIN)

  - Body (application/json):
    - `rideId` (number)
  - Response 200:
    - `message`: string
    - `ride`: object with `rideId`, `riderId`, `fare`, `status`, `pickupAddress`, `dropoffAddress`
  - Notes: Sets `captainId` on `Ride` (stores `CaptainProfile.id`) and marks `CaptainProfile.isAvailable = false`.

- POST `/api/v1/ride/arrived-at-pickup` (authenticated, role: CAPTAIN)

  - Body (application/json):
    - `rideId` (number)
  - Response 200:
    - `message`: string
    - `ride`: updated ride object (status `ARRIVED`)

- POST `/api/v1/ride/start-ride` (authenticated, role: CAPTAIN)

  - Body (application/json):
    - `rideId` (number)
    - `otp` (string)
  - Response 200:
    - `message`: string
    - `ride`: updated ride object (status `ONGOING`, `startedAt` set)

- POST `/api/v1/ride/complete-ride` (authenticated, role: CAPTAIN)

  - Body (application/json):
    - `rideId` (number)
  - Response 200:
    - `message`: string
    - `ride`: updated ride object (status `COMPLETED`, `fare` updated)
    - `distance`: number (km)
    - `duration`: number (minutes)
  - Notes: Marks `CaptainProfile.isAvailable = true` on completion.

- POST `/api/v1/ride/cancel-ride` (authenticated)

  - Body (application/json):
    - `rideId` (number)
  - Response 200:
    - `message`: string
    - `ride`: updated ride object (status `CANCELLED`)
  - Notes: Notifies rider and captain (or nearby captains) about cancellation.

- GET `/api/v1/ride/path/:rideId` (authenticated)
  - Params:
    - `rideId` (number)
  - Response 200:
    - `path`: array of `{ lat: number, lng: number }` ordered by time
    - `duration`: number (minutes)

---

## WebSocket Events (socket.io)

- Client emits: `CAPTAIN_LOCATION_UPDATE` with `{ location: { latitude, longitude } }` (authenticated socket)

  - Server updates `CaptainProfile` location, stores location in Redis (using `CaptainProfile.id`) and creates `RideLocationLog` entries for ongoing rides (every ~10s).

- Server emits (examples):
  - `NEW_RIDE_REQUEST` -> sent to captains with payload `{ rideId, pickupAddress, dropoffAddress, fare, riderName }`
  - `RIDE_ACCEPTED` -> sent to rider with payload `{ rideId, captainName, status, captainRating, captainLocation, fare, otp }`
  - `CAPTAIN_ARRIVED`, `RIDE_STARTED`, `RIDE_COMPLETED`, `RIDE_CANCELLED`, `CAPTAIN_LOCATION_UPDATE` with similar payloads.

---