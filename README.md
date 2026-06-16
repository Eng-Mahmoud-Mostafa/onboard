# Onboard Tours CRM

Production-ready dark themed CRM for Onboard Tours, built with Vite React, TypeScript, React Router, TanStack Query, Vercel Serverless Functions, Prisma, Supabase PostgreSQL/Storage, and Resend OTP email login.

## Environment

Copy `.env.example` to `.env.local` locally and set the same variables in Vercel:

- `DATABASE_URL`
- `DIRECT_URL`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKET=crm-files`
- `RESEND_API_KEY`
- `OTP_FROM_EMAIL`
- `APP_URL=https://onboard-crm.com`
- `VITE_APP_URL=https://onboard-crm.com`
- `ADMIN_PROFILE_NAME=nesma`
- `ADMIN_PROFILE_PASSWORD`
- `ALLOWED_EMAIL_DOMAIN=onboard-tours.com`
- `PROFILE_RESET_EMAIL=info@onboard-tours.com`
- `SESSION_SECRET`
- `SEED_DEMO_DATA=false`

Never expose `RESEND_API_KEY` to the browser. It is only read by the API server.
Only `VITE_` variables are exposed to the frontend.

## Supabase

Create a Supabase project on the free plan, then copy the pooled PostgreSQL connection string into `DATABASE_URL` and the direct connection string into `DIRECT_URL`. Create a Storage bucket named `crm-files` or set `SUPABASE_STORAGE_BUCKET` to your chosen bucket name. The service role key is used only by the serverless API for file uploads.

## Development

```bash
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3000`. The Vite frontend runs on port 3000 and proxies `/api` to the Express API on port 3001.

## API

Core endpoints:

- `POST /api/auth/send-otp` (`/api/auth/request-otp` also works)
- `POST /api/auth/verify-otp` (`/api/auth/verify` also works)
- `GET /api/auth/session` (`/api/auth/me` also works)
- `POST /api/auth/logout` (`/api/auth/signout` also works)
- `GET /api/profiles`
- `POST /api/profiles`
- `POST /api/profiles/:id/unlock` (`/api/profiles/unlock` also works)
- `POST /api/profiles/reset/request`
- `POST /api/profiles/reset/confirm`
- `GET /api/dashboard`
- `GET /api/leads`, `/api/clients`, `/api/packages`, `/api/bookings`, `/api/payments`, `/api/tasks`, `/api/activity`
- `POST /api/leads`, `/api/clients`, `/api/packages`, `/api/bookings`, `/api/payments`, `/api/tasks`
- `GET /api/reports/summary`
- `GET /api/export/leads?format=csv`, `/api/export/clients?format=csv`, `/api/export/bookings?format=csv`, `/api/export/payments?format=csv`, `/api/export/reports?format=csv`
- `POST /api/import/leads`
- `POST /api/import/clients`
- `POST /api/import/tasks`
- `POST /api/files/upload`
- `GET /api/files`
- `DELETE /api/files/:id`

## Database

Prisma models:

- `User`
- `Profile`
- `Lead`
- `Client`
- `Package`
- `Booking`
- `Payment`
- `Task`
- `ActivityLog`
- `OtpToken`
- `ProfilePasswordResetToken`
- `Session`
- `UploadedFile`

The seed creates the configurable admin profile `nesma`. Demo data is only inserted in development or when `SEED_DEMO_DATA=true`.

## Auth And Security

- Email OTP login only.
- Only `@onboard-tours.com` emails are accepted.
- OTP expires after 10 minutes.
- OTP requests are rate limited to 3 per 15 minutes per email.
- Profile passwords are hashed with bcrypt.
- Auth and profile unlock state are stored in HTTP-only JWT cookies.
- Admin-only actions re-check authorization in the API.

## Deployment

1. Create or connect Supabase PostgreSQL and set `DATABASE_URL` plus `DIRECT_URL`.
2. Create the Supabase Storage bucket and set `SUPABASE_STORAGE_BUCKET`.
3. Add the Resend integration or set `RESEND_API_KEY` manually in Vercel.
4. Verify the sender domain in Resend and set `OTP_FROM_EMAIL`.
5. Set `APP_URL=https://onboard-crm.com` and `VITE_APP_URL=https://onboard-crm.com`.
6. Run `npm run db:deploy`, then `npm run db:seed` once to create the `nesma` admin profile.
7. Deploy to Vercel. `vercel.json` routes `/api/*` to the serverless API and all other paths to the Vite SPA.
8. In GoDaddy DNS, point `onboard-crm.com` to the records Vercel provides for the production domain.
