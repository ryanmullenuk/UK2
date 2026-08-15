# pixelUK

An interactive digital map of the United Kingdom made from exactly 10,000 individually selectable squares.

## What is included

- A geographically accurate, programme-generated UK map including Great Britain, Northern Ireland and relevant islands
- Exactly 10,000 addressable land squares rendered on a high-performance canvas
- Pointer hover, click, tap and drag selection
- Multiple-square selection and live pricing
- Colour choice for patterns, initials and pixel art
- Buyer profile, advertisement and outbound-link display states ready for live ownership data
- Checkout review screen ready to hand off to a secure payment and ownership service
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

The site is a static React application hosted entirely by GitHub Pages. It has no sign-in, ChatGPT hosting or external application layer.

The repository includes a GitHub Actions workflow for GitHub Pages. Each push to `main` publishes the latest version at [pixeluk.co.uk](https://pixeluk.co.uk/). The `public/CNAME` file preserves the custom-domain setting during deployment.

## Connecting the live purchase flow

All 10,000 squares currently start available. Permanent sales require a server-side ownership service; payment keys and purchase enforcement must not be placed in the GitHub Pages front end.

Recommended production flow:

1. Store one database row per square, keyed by the existing pixel ID, with `available`, `reserved` and `owned` states.
2. When checkout starts, call a server-side function that reserves every requested ID in one database transaction. A unique primary key and conditional update prevent overlapping orders.
3. Give reservations a short expiry so abandoned checkouts return their squares to sale.
4. Create a one-time [Stripe Checkout Session](https://docs.stripe.com/payments/checkout) on the server and attach the reservation or order ID as metadata.
5. Redirect the buyer to Stripe's hosted payment page. Never expose the Stripe secret key in this repository or browser code.
6. Verify Stripe's signed `checkout.session.completed` webhook, then atomically change the reserved rows to `owned` and store their permanent colour, owner profile, advert and link.
7. Load public ownership rows when the map opens and subscribe to database changes so sold squares update for every visitor.

[Supabase Edge Functions](https://supabase.com/docs/guides/functions) are a suitable server-side layer for creating Checkout Sessions and receiving signed Stripe webhooks. Any public database tables should have Row Level Security enabled, with browser access limited to safe ownership reads.

## Map data note

The map mask is generated from the [ONS UK TopoJSON dataset](https://github.com/ONSvisual/uk-topojson), projected onto a square grid and corrected to exactly 10,000 land squares. No map image is used at runtime.

To regenerate the checked-in mask from the source geography:

```bash
pnpm run map:generate
```

Source: Office for National Statistics licensed under the Open Government Licence v3.0. Contains OS data © Crown copyright and database right.
