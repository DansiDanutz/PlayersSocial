# /promotions — Mirela voucher promotion

**Status: draft. Do not merge until Dan approves. The migration is not applied.**

## What players see
`/promotions` (black/gold page, Mirela illustration). "Vorbește cu Mirela" starts a voice conversation with the
ElevenLabs agent `agent_9401m85046mpep7se0yxgbm4wjd0` in the browser. Mirela says she is an AI assistant, checks 18+,
asks whether the player agrees to 3 short questions (cash or tournaments · stakes 2-5 / 5-10+ lei · may we invite
you when poker resumes), confirms first and last name, then calls the browser tool `issue_voucher`.
The page posts to `/api/promo-voucher`, gets a serial (PPC-V-000123) and a 4-character check, Mirela reads the
serial and the page shows a green button that opens WhatsApp to the club (+40 750 409 972) with
`Confirm voucher PPC-V-000123 (K7QM) – Nume Prenume` already written.
Voucher: 500 lei used as 5 × 100 lei Bonus Cash Game; only condition: at the table with the minimum buy-in on the
table, any stake; valid 3 months from when poker resumes.

## Pages
- `/promotions` — the promotion (dist/promotions/index.html; images served by api/promo-asset.js)
- `/promotions/castigatori/` — public list: serial, first name, date (only vouchers confirmed on WhatsApp)
- `/staff/vouchere/` — super admins: full list, +1 coupon used, note, STOP, void

## Server
- `api/promo-voucher.js` — checks with the ElevenLabs API that the conversation belongs to the promotions agent and
  started in the last 20 minutes; one voucher per conversation; 5 requests / 10 min per IP; no phone collected.
  Preview deployments without keys answer a DEMO serial and store nothing.
- `supabase/migrations/20261124090000_players_promo_vouchers.sql` — table `players_promo_vouchers` (RLS on, no grants),
  `players_promo_voucher_issue`, `players_promo_voucher_attach_phone` (for Memo), public view
  `players_promo_winners_public`, admin functions. Test: `supabase/tests/players_promo_vouchers_test.sql`.

## Switching it on (after Dan approves)
1. Apply the migration (Supabase SQL editor or `supabase db push`), then run the test file (must print ALL PASSED).
2. Outside the repository, add the two server keys:
   `insert into public.players_server_keys(name, key_hash) values ('promo-voucher', public.players_sha256('<PROMO_VOUCHER_KEY>')), ('promo-voucher-memo', public.players_sha256('<PROMO_VOUCHER_MEMO_KEY>'));`
3. Vercel env (Production + Preview): `ELEVENLABS_API_KEY`, `PROMO_VOUCHER_KEY`. Memo env: `PROMO_VOUCHER_MEMO_KEY`.
4. Merge, check `/promotions` on the phone, then enable the Memo matching (separate PR on DansiDanutz/Phone, flag OFF by default).

## Service worker
`dist/sw.js` only intercepts same-origin GET navigations (network first) and caches only `/`. `/promotions` is
always fetched fresh; `/api/promo-voucher` is a POST and is never touched. No change needed.

# WhatsApp template draft — ppc_promo_voucher_invite (DRAFT, NOT SUBMITTED)

Category: MARKETING · Language: ro · Sender: club number +40 750 409 972 (confirm with Dan)
Only for people who opted in to club messages. Nothing here is submitted to Meta without Dan's approval.

**Header (image, optional):** og.jpg (Mirela + "Voucher 500 lei")

**Body:**
> Bună, {{1}}! 🎉 Players Poker Club îți oferă un voucher de 500 lei, folosit ca 5 × 100 lei Bonus Cash Game. Singura condiție: să fii la masă și să pui pe masă buy-in-ul minim, la orice miză.
> Vezi promoția și vorbește cu Mirela, asistenta virtuală a clubului: răspunzi la 3 întrebări scurte și primești voucherul pe loc.
> Pokerul e suspendat temporar până la noile autorizații; voucherul e valabil 3 luni de la reluare. Doar 18+.

- {{1}} = first name (sample: "Andrei")

**Footer:** Joacă responsabil · Răspunde STOP pentru dezabonare

**Buttons:**
1. URL — "Vezi promoția" → `https://playersclub.live/promotions` (static, no code/parameter)
2. Quick reply — "STOP"

No voucher code in the template: the serial is generated only after the conversation with Mirela.

**Cost (Meta, Romania, marketing):** about $0.086 per delivered message (rate card from Oct 1 2026), so 500 recipients ≈ $43. Free alternative: post the link (playersclub.live/promotions) on the club's status / groups / socials, or reply inside a 24h window when a player writes first.

# Memo: matching "Confirm voucher …" messages (PLAN ONLY — no change to Memo without Dan's approval)

Incoming text from the page button (wa.me/40750409972):
`Confirm voucher PPC-V-000123 (K7QM) – Andrei Popescu`

1. In Memo's club-mode inbound handler, before the normal "Sienna" reply, test:
   `/confirm\s+voucher\s+(PPC-V-\d{6})\s*\(([A-HJ-NP-Z2-9]{4})\)/i`
2. If it matches, call Supabase RPC `players_promo_voucher_attach_phone(p_server_key, p_serial, p_check, p_phone)`
   with the sender's WhatsApp number in +E.164 and the Memo key (`PROMO_VOUCHER_MEMO_KEY`, stored only in Memo's env).
3. Reply inside the free 24h service window, depending on `status`:
   - confirmed → "Mulțumim, {first_name}! Voucherul {serial} (500 lei = 5 × 100 lei) este înregistrat pe acest număr. Îl folosești după reluarea jocurilor de poker; te anunțăm când reîncepem." (+ "Pentru dezabonare scrie STOP.")
   - already_confirmed → "Voucherul {serial} este deja înregistrat pe acest număr."
   - phone_has_voucher → "Acest număr are deja voucherul {serial}. Voucherul este unul per persoană."
   - claimed_by_other / not_found → "Nu am putut confirma voucherul. Un coleg verifică și revine." + notify Dan (owner chat), no details to the sender.
   - opted_out → no promo text; plain acknowledgement.
4. STOP from any number → admin action opt_out (or a small `players_promo_voucher_opt_out_by_phone` RPC, to add later).
5. Never confirm a voucher as valid without the RPC result; never touch the WorldCup26 number or JEV.

Test plan: run against a local/branch database first with the TEST conversations, then enable in production after Dan approves.
