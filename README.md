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

## Videos

- Every game card (Șah, Table, Ping-Pong, Remi) and the hero have a static `▶ Promo` button (`.card-promo-button`, `data-promo-*`) that opens the promo in a dialog. These buttons are plain HTML, so the promos stay up regardless of events or the video list.
- The **Video** tab is rendered by `dist/videos.js` from `dist/videos/videos.json`, grouped by category (Club, Șah, Remi, Table, Ping-Pong).
- Event videos are normally uploaded from the admin dashboard (**Videoclipuri**): MP4 up to 50 MB, optional poster, category and type. They go to the public `players-videos` bucket and the `players_videos` table (migration `20261006150000_players_videos.sql`), and the Video tab shows them first in their category.
- To ship a video with the site instead: add the MP4 (vertical, ideally under 15 MB) and a 540×960 poster JPG to `dist/videos/`, then append an entry to `videos` with `category` (an existing category id), `type` (`promo`, `premium` or `event`), `title`, `description`, `src` and `poster`. To add a new category, append it to `categories` (with `card` set to the game card anchor, or `""`).

## Deployment

The existing Vercel project is `playerssocial` in the `irises-projects-ce549f63` team. `vercel.json` serves the `dist` directory. The Vercel project is connected to this GitHub repository, so pushes to `main` deploy the site automatically.

The `.openai/hosting.json` file records the original Sites project registration. It does not deploy the Vercel project.

## Tests

Browser tests use Playwright against `dist/` with every Supabase call mocked, so they need no credentials and never touch production data. They run on desktop and a phone-sized viewport, and in GitHub Actions on every push and pull request.

```sh
npm install
npx playwright install chromium
npm test
```

`supabase/tests/players_events_test.sql` checks database permissions and the admin event functions. Run it in the Supabase SQL editor: it always rolls back and ends with `ALL PASSED` on success.
