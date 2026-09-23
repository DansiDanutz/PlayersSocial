# PlayersSocial

Source for [playerssocial.vercel.app](https://playerssocial.vercel.app/), the Players Club site.

## Current baseline

The source was located in the neighboring local `Players` checkout. `dist/index.html` is byte-for-byte identical to the production page retrieved on 23 September 2026. The original checkout also supplied the Sites hosting registration and the six Players-specific Supabase migrations included here.

The page is a static, self-contained HTML file with inline CSS and JavaScript. It calls Supabase directly from the browser using a publishable key; database permissions and admin authorization must be enforced in Supabase. No private Supabase credentials belong in this repository. The SQL migrations are historical source files; do not apply them to a fresh or production database without checking its existing migration state.

## Local preview

```sh
python3 -m http.server 8000 --directory dist
```

Open <http://localhost:8000>. The browser needs network access for Google Fonts, Maps, WhatsApp links, and Supabase features.

## Deployment

The existing Vercel project is `playerssocial` in the `irises-projects-ce549f63` team. `vercel.json` serves the `dist` directory. The Vercel project is connected to this GitHub repository, so pushes to `main` deploy the site automatically.

The `.openai/hosting.json` file records the original Sites project registration. It does not deploy the Vercel project.
