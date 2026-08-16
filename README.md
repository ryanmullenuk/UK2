# pixelUK

An interactive digital map of the United Kingdom made from exactly 10,000 individually selectable squares.

## What is included

- A geographically accurate, programme-generated UK map including Great Britain, Northern Ireland and relevant islands
- Exactly 10,000 addressable land squares rendered on a high-performance canvas
- Pointer hover, click, tap and drag selection
- Multiple-square selection and live pricing
- Colour choice for patterns, initials and pixel art
- Permanent Supabase ownership records with public buyer profile, advertisement and outbound-link display states
- Stripe Checkout with transactional 30-minute square reservations and signed webhook fulfilment
- Responsive layouts and reduced-motion support

## Local setup

You need Node.js 22 or newer.

```bash
pnpm install
pnpm run dev
```

Open the local address shown in the terminal.

## Production build

```bash
pnpm run build
```

## Deployment

The public site is a static React application hosted by GitHub Pages. Supabase provides the database and server-side functions used for availability, reservations and ownership. Stripe hosts the secure payment screen. There is no ChatGPT hosting or sign-in layer.

The repository includes a GitHub Actions workflow for GitHub Pages. Each push to `main` publishes the latest version at [pixeluk.co.uk](https://pixeluk.co.uk/). The `public/CNAME` file preserves the custom-domain setting during deployment.

## Purchase infrastructure

The checked-in `supabase` directory contains the database migration and three Edge Functions:

- `map-data` returns public owner details and the live available count.
- `create-checkout` reserves selected squares atomically and creates the Stripe Checkout Session.
- `stripe-webhook` verifies Stripe's signature and permanently assigns paid squares.

Apply the migration and deploy the functions with the Supabase CLI:

```bash
supabase link --project-ref fgtokfjsasxflyxpiwif
supabase db push
supabase functions deploy map-data --no-verify-jwt
supabase functions deploy create-checkout --no-verify-jwt
supabase functions deploy stripe-webhook --no-verify-jwt
```

Set `SITE_URL`, `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` as encrypted Supabase Edge Function secrets. Never place Stripe secret keys in GitHub or browser code. Configure Stripe to send `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed` and `checkout.session.expired` to:

```text
https://fgtokfjsasxflyxpiwif.supabase.co/functions/v1/stripe-webhook
```

Stripe is currently expected to be in test mode. Complete and verify a test purchase before replacing the test key and webhook endpoint with live-mode credentials.

## Map data note

The map mask is generated from the [ONS UK TopoJSON dataset](https://github.com/ONSvisual/uk-topojson), projected onto a square grid and corrected to exactly 10,000 land squares. No map image is used at runtime.

To regenerate the checked-in mask from the source geography:

```bash
pnpm run map:generate
```

Source: Office for National Statistics licensed under the Open Government Licence v3.0. Contains OS data © Crown copyright and database right.
