# UK²

An interactive digital map of the United Kingdom made from exactly 10,000 individually selectable squares.

## What is included

- A programme-generated UK map including Great Britain, Northern Ireland and relevant islands
- Exactly 10,000 addressable land squares rendered on a high-performance canvas
- Pointer hover, click, tap and drag selection
- Multiple-square selection and live pricing
- Colour choice for patterns, initials and pixel art
- Mock buyer profiles, advertisements and outbound links
- Mock checkout ready to be replaced with a payment and ownership service
- Responsive layouts and reduced-motion support

## Local setup

You need Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open the local address shown in the terminal.

## Production build

```bash
npm run build
```

## Deployment

The repository includes a GitHub Actions workflow for GitHub Pages. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**. Each push to `main` then publishes the latest version.

## Connecting the live purchase flow

The current front end uses deterministic mock ownership data. A production service should provide:

1. Pixel availability and ownership records keyed by pixel ID
2. Temporary reservations to prevent competing checkouts
3. Stripe Checkout or an equivalent payment flow
4. Buyer profile, colour and destination-link moderation
5. A webhook that confirms payment before ownership is written permanently

Keep the canvas renderer and replace the mock owner assignment in `app/page.tsx` with data from the chosen API.

## Map data note

The map is an original, deliberately pixel-styled approximation. It is generated from vector paths and corrected to exactly 10,000 land squares at runtime; no map image is used.
