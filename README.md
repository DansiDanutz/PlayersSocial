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

## Accounts and admins

- The header always shows **Intră în cont**: sign in with Google (Supabase OAuth, `provider=google`) or an email link. Any member can sign in; their name and email prefill event registration.
- Admin access comes only from the `players_admins` table (`public.is_players_admin()`); there is no admin list in the page. Admins manage the list in the dashboard (**Administratori**) via `players_admin_list_admins` / `players_admin_add_admin` / `players_admin_remove_admin` (migration `20261006170000_players_admin_management.sql`). Admins cannot remove themselves or the last admin.

## Videos

- Every game card (Șah, Table, Ping-Pong, Remi) and the hero have a static `▶ Promo` button (`.card-promo-button`, `data-promo-*`) that opens the promo in a dialog. These buttons are plain HTML, so the promos stay up regardless of events or the video list.
- The **Video** tab is rendered by `dist/videos.js` from `dist/videos/videos.json`, grouped by category (Club, Șah, Remi, Table, Ping-Pong).
- Event videos are normally uploaded from the admin dashboard (**Videoclipuri**): MP4 up to 50 MB, optional poster, category and type. They go to the public `players-videos` bucket and the `players_videos` table (migration `20261006150000_players_videos.sql`), and the Video tab shows them first in their category.
- Videos that are not MP4 (e.g. iPhone MOV) or are over 50 MB are compressed in the browser before upload (`dist/video-compress.js`, WebCodecs via Mediabunny 1.61.3, MPL-2.0, vendored unmodified in `dist/vendor/`). Bitrate is sized from the duration to land around 45 MB; resolution drops to 720p/480p for longer videos; videos longer than ~10 minutes are refused. Needs a WebCodecs browser (Chrome, Edge, recent Safari).
- To ship a video with the site instead: add the MP4 (vertical, ideally under 15 MB) and a 540×960 poster JPG to `dist/videos/`, then append an entry to `videos` with `category` (an existing category id), `type` (`promo`, `premium` or `event`), `title`, `description`, `src` and `poster`. To add a new category, append it to `categories` (with `card` set to the game card anchor, or `""`).

## Dealers and floor managers

- `/dealers-payout/` is the printable dealer rules page (PDF next to it). Its last section is a signing form: the dealer types their name, draws a signature and signs from their own account; that creates their dealer card (`players_dealer_sign`).
- `/dealer/` is the dealer card: check-in / check-out (time editable), forgotten shifts, and every amount from the rules (monthly share, 3-month guarantee, deposit, next bonus, penalties).
- `/sef-de-sala/` is the floor manager panel: approve or correct shifts (flagged once the day after has passed), enter each dealer's daily tips and penalties, open any dealer card. Admins also add floor managers there; admins are floor managers automatically.
- On the signing form the person picks **Dealer** (signs, card created at once) or **Șef de sală** (sends an access request; the same request form appears on `/sef-de-sala/` for accounts without access). `api/floor-request.js` stores the request and emails a one-time link to the super admin from Gmail; `/aprobare/#t=…` shows the request with Aprobă / Respinge (migration `20261121150000_players_floor_requests.sql`, test `supabase/tests/players_floor_requests_test.sql`). Vercel settings: `FLOOR_REQUEST_KEY` (its SHA-256 lives in `players_server_keys`, inserted outside migrations), `GMAIL_USER`, `GMAIL_APP_PASSWORD` (a Google app password), optional `SUPER_ADMIN_EMAIL` (defaults to `GMAIL_USER`). Admins can also approve or reject pending requests in the "Șefi de sală" tab of `/sef-de-sala/` (`players_admin_list_floor_requests`, `players_admin_decide_floor_request`, migration `20261121190000_players_floor_requests_admin.sql`).
- `/echipa/` is the transparent team board: every active dealer and floor manager sees all active dealer cards one month at a time (‹ › switcher), as cards or as a table (the choice is remembered), with team totals, search, sort and the full card in a side panel. Data comes from `players_staff_board()` (migration `20261121170000_players_staff_board.sql`, no emails or signatures).
- All staff pages share one shadcn/ui-style design system in `dist/staff/staff.css` (tokens, header, segmented tabs, badges, skeletons; Inter only); `board.css` adds the board components on top of those tokens.
- `/cum-functioneaza/` is the staff guide (roles, daily steps, approval, FAQ), linked from every staff page. One account may be dealer, floor manager and admin at once.
- Signing in always happens on the home page (`/?login=1`); `app-shell.js` sends the visitor back to the staff page they came from.
- The database stores only raw facts (migration `20261121120000_players_dealers.sql`, all access through security definer functions). Every amount is computed in `dist/staff/dealer-math.js`, unit-tested in `tests/unit/dealer-math.test.js`. `supabase/tests/players_dealers_test.sql` checks the permissions and rolls back.

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
