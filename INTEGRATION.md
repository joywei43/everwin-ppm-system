# PPM and Live Update

This version uses the Everest Worker API. Set VITE_API_URL to override the default API URL. Sign in with the existing Live Update staff account (admin01).

Deploy the matching backend changes from everestpoker-website first:

1. Run backend/schema.sql on the existing D1 database. CREATE IF NOT EXISTS / INSERT OR IGNORE preserve the waiting list. This adds the private ppm table.
2. Deploy backend/worker.mjs using the existing Worker configuration and existing D1 binding and ADMIN_PASSWORD secret. Do not replace the production database ID with the example placeholder.
3. Add the PPM hosting origin to ALLOWED_ORIGINS if hosted outside everestpokerroom.com.
4. Build this repository with npm install and npm run build. Publish dist at /ppm/ on the Everest domain, or configure the allowed origin for another host.
5. Publish the updated waiting-list/index.html.

The private /ppm endpoint requires authentication. Saves use a version check and a D1 transaction to update private PPM state and public table occupancy together. Existing queue/calls are preserved. Resting players keep their occupied seat. Closed tables are hidden in the updated public page. PPM polls every three seconds; conflicting operations are rejected and latest state is loaded. Failed operations must be retried. No offline edits are queued.

Existing browser-local history is not imported. Initial cloud state starts with four empty tables T1, T2, T3, T5. Use PPM for table/seat operations after switching; the older waiting-list admin remains for queue operations.

Validation: TypeScript, Vite production build, existing backend auth tests, SQLite-backed PPM tests (backend/ppm.test.mjs in website repository).
