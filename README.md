# Onboard Tours CRM

Professional dark themed CRM for Onboard Tours, built with Next.js, TypeScript, Tailwind CSS, Prisma, PostgreSQL, and Resend OTP email login.

## Environment

Copy `.env.example` to `.env.local` locally and set the same variables in Vercel:

- `DATABASE_URL`
- `RESEND_API_KEY`
- `OTP_FROM_EMAIL`
- `NEXT_PUBLIC_APP_URL=https://onboard-crm.com`
- `ADMIN_PROFILE_NAME=nesma`
- `ADMIN_PROFILE_PASSWORD`
- `ALLOWED_EMAIL_DOMAIN=onboard-tours.com`
- `SESSION_SECRET`
- `SEED_DEMO_DATA=false`

Never expose `RESEND_API_KEY` to the browser. It is only read by server actions and route handlers.

## Development

```bash
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3000`.

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

The seed creates the configurable admin profile `nesma`. Demo data is only inserted in development or when `SEED_DEMO_DATA=true`.

## Auth And Security

- Email OTP login only.
- Only `@onboard-tours.com` emails are accepted.
- OTP expires after 10 minutes.
- OTP requests are rate limited to 3 per 15 minutes per email.
- Profile passwords are hashed with bcrypt.
- Protected pages, server actions, and export routes re-check authorization server-side.
- Admin pages and exports require the unlocked admin profile.

## Deployment

1. Create a PostgreSQL database and set `DATABASE_URL`.
2. Add the Resend integration or set `RESEND_API_KEY` manually in Vercel.
3. Verify the sending domain in Resend and set `OTP_FROM_EMAIL`.
4. Set `NEXT_PUBLIC_APP_URL=https://onboard-crm.com`.
5. In GoDaddy DNS, point `onboard-crm.com` to Vercel using the records Vercel provides.
6. Run migrations in deployment with `npm run db:deploy`.

Exports are available to the admin profile as CSV from `/api/export/leads`, `/api/export/clients`, `/api/export/bookings`, `/api/export/payments`, and `/api/export/reports`.
