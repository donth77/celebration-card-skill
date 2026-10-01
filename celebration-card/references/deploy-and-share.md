# Deploy & share

The card is a static folder (index.html + assets). Any static host works. Pick based on whether the user has accounts, how long the link must live, and how private it should be. Facts are as of late 2026; free tiers change.

## Contents
1. [Before deploying](#before-deploying)
2. [Deploying with scripts/deploy.py](#deploying-with-scriptsdeploypy)
3. [Platform setup: logins, tokens, teams](#platform-setup)
4. [Other hosting options](#other-hosting-options)
5. [Link previews (Open Graph)](#link-previews)
6. [Privacy](#privacy)
7. [Sending it](#sending-it)
8. [The README hand-off](#the-readme-hand-off)

## Before deploying

- **QA passed** (qa.md).
- **Give the folder an unguessable slug:** `maya-30-k7f2q` rather than `maya`. Public hosts are public.
- **Clean up:**
  - delete unused scenes/fx modules, the `music/` folder if the card uses an audio file, and `music/preview.html`
  - remove placeholder art
  - keep `README.md` and `CREDITS.md`
- **Check sizes.** Some hosts cap individual files: Cloudflare Pages allows 25 MiB, git hosts 100 MiB. Prepared media is far below these. Long or 4K videos may not be. `deploy.py` checks this for you.

## Deploying with scripts/deploy.py

When the user wants the card published, use the bundled script rather than hand-running CLIs. It:
- stages a clean copy (no `qa/`, notes, `deploy.json` or dev tools)
- writes absolute `og:url`/`og:image` for the final address
- deploys and verifies the page, the preview image and audio seeking (HTTP 206) over HTTPS
- records everything in `<card>/deploy.json`, so redeploying after edits is one command

**1. Plan.** It's safe: nothing is published, and it also checks the login:
```bash
python3 <skill>/scripts/deploy.py <card> --to cloudflare --name maya-30-k7f2q     # or vercel | netlify | netlify-anon | surge
```
It prints the target URL, file count and size, what's excluded, and whether the CLI is logged in (or a token is set). If not logged in, it prints the exact login step: the user runs it themselves, e.g. `! npx wrangler login`, which opens a browser.

**2. Confirm with the user.** Show the plan, especially the public URL. Publishing puts their photos and words online. Only then continue.

**3. Publish:**
```bash
python3 <skill>/scripts/deploy.py <card> --to cloudflare --name maya-30-k7f2q --yes
```
It prints the live URL, the verification checks, a suggested message to send, and a QR-code command. If the host assigns a different address (a name already taken elsewhere), the script fixes the OG tags and redeploys once automatically.

**Redeploy after edits:** `python3 <skill>/scripts/deploy.py <card> --yes`. The platform and name come from `deploy.json`.

**Names:**
- Without `--name`, the script uses `<folder>-<5 random chars>`. Keep that unguessable suffix; the page holds personal photos.
- Names are lowercase letters, digits and dashes.
- If a name is taken on the platform, pick another.

**User defaults:** `~/.config/celebration-card/deploy.json`, e.g. `{"platform": "cloudflare", "team": "acme"}`, applies to every card. Resolution order: flags > the card's `deploy.json` > user defaults. Offer to create it when a user says "always deploy to X".

| `--to` | Result | Needs | Notes |
|---|---|---|---|
| `cloudflare` | `https://<name>.pages.dev` | `wrangler login`, or `CLOUDFLARE_API_TOKEN` (+ `CLOUDFLARE_ACCOUNT_ID`) | creates the Pages project on first deploy; 25 MiB per file; free and no expiry |
| `vercel` | `https://<name>.vercel.app` | `vercel login`, or `VERCEL_TOKEN` | the project is named after the card folder name; `--team` = Vercel scope; Hobby plan is for non-commercial use |
| `netlify` | `https://<name>.netlify.app` | `netlify login`, or `NETLIFY_AUTH_TOKEN` | creates the site on first deploy (`--team` = team slug) |
| `netlify-anon` | random `*.netlify.app` | nothing | **password-protected and deleted after ~60 min unless claimed**: a quick preview, not the final link |
| `surge` | `https://<name>.surge.sh` | `surge login`, or `SURGE_LOGIN` + `SURGE_TOKEN` | simple, no expiry |

## Platform setup

Prefer the CLI login: the user runs it once, interactively, and it's stored by the CLI.
- Cloudflare: `! npx wrangler login`
- Vercel: `! npx vercel login`
- Netlify: `! npx netlify-cli login`
- surge: `! npx surge login`

**Tokens** are for CI or headless machines. Set them in the environment and never paste them into chat or files that get published. `deploy.py` only reads them from the environment.
- **Cloudflare:** dash.cloudflare.com → My Profile → API Tokens → create from the "Edit Cloudflare Workers" template (it includes Pages), or a custom token with *Account → Cloudflare Pages → Edit*. Set `CLOUDFLARE_API_TOKEN`. Also set `CLOUDFLARE_ACCOUNT_ID` (from the dashboard sidebar) when the token covers several accounts.
- **Vercel:** vercel.com/account/tokens → `VERCEL_TOKEN`. Pass the team as `--team <scope>`.
- **Netlify:** app.netlify.com/user/applications → Personal access tokens → `NETLIFY_AUTH_TOKEN`.
- **surge:** `npx surge token` prints one → `SURGE_LOGIN` (email) + `SURGE_TOKEN`.

**Custom domains** (e.g. `maya.family-name.com`) are a one-time setup in the platform's dashboard: Pages → Custom domains, Vercel → Domains, Netlify → Domain management. Afterwards, set the custom URL in `og:url`/`og:image` and redeploy.

**Taking it down later:**
- Cloudflare: `npx wrangler pages project delete <name>`
- Vercel: `npx vercel remove <name> --yes`
- Netlify: `npx netlify-cli sites:delete <site-id>`
- surge: `npx surge teardown <name>.surge.sh`

Mention this in the README hand-off.

## Other hosting options

| Host | Account? | Command / how | Notes |
|---|---|---|---|
| **Netlify Drop** | not to try it; yes to keep it | drag the folder onto app.netlify.com/drop | anonymous drops are password-protected and **deleted after ~60 min unless claimed** (free account). New teams' sites may default to private: click "Make public" |
| Netlify CLI | yes (or `--allow-anonymous`, same 60-min rule) | `npx netlify deploy --prod --dir <card>` | |
| **Cloudflare Pages** | yes (free) | `npx wrangler pages deploy <card> --project-name maya-30-k7f2q` | fast global CDN, 25 MiB per file, no expiry |
| **Vercel** | yes | `npx vercel deploy --prod <card>` | share the *production* URL (preview URLs can sit behind Vercel login); Hobby plan is non-commercial |
| **surge.sh** | creates one in the terminal | `npx surge <card> maya-30-k7f2q.surge.sh` | simple, no expiry on free |
| GitHub Pages | yes | push to a repo, enable Pages | free plan needs a **public repo**: anyone can browse and clone the photos, and they persist in git history. Avoid for personal photos |
| claude.ai Artifacts | — | if your environment has an artifact publishing tool, it can host a private, shareable page | follow that tool's rules (allowed CDNs, file limits) |
| Any static host / S3 / own server | — | upload the folder | relative paths mean it works in a subfolder too |

These are the manual routes, for when the user prefers a drag-and-drop host or one the script doesn't cover. Either way, ask before deploying anywhere under the user's account, because it publishes their photos.

## Link previews

When the link is pasted into iMessage, WhatsApp or Slack, the preview comes from **static** `<meta>` tags (previewers don't run JS):

```html
<title>For Maya 💌</title>
<meta property="og:title" content="For Maya 💌" />
<meta property="og:description" content="Someone made you something. Tap to open — sound on." />
<meta property="og:image" content="https://maya-30-k7f2q.pages.dev/og.jpg" />   <!-- ABSOLUTE https URL -->
<meta property="og:url" content="https://maya-30-k7f2q.pages.dev/" />
<meta name="twitter:card" content="summary_large_image" />
```

- **Make a teaser image, not a spoiler:** the closed gate/envelope with "For Maya" works well.
- **Capture it at 1200×630:** resize the browser to 1200×630, open the card with no URL parameters, wait for `#gate.is-ready`, and save a JPEG screenshot as `<card>/og.jpg`. Keep it under 600 KB (WhatsApp) and at least 900 px wide (iMessage).
- **`og:image` and `og:url` must be absolute URLs.** `deploy.py` writes them for the live address automatically. Do it by hand for other hosts, because relative URLs silently fail in most apps.
- **Password-protected or private hosts block previews.** That's fine for privacy, but the link will show bare.

## Privacy

These pages often hold family photos, names and messages:
- `prepare_media.py` strips GPS/EXIF and renames files.
- Use unguessable slugs, and keep `<meta name="robots" content="noindex, nofollow">` (already in the template).
- For real privacy, use a host with password protection (Netlify/Vercel/Cloudflare Access paid features) or a private artifact. Explain that "unlisted" is not "private".
- Don't put phone numbers or emails in the page (the `reply` button) unless the sender wants that.
- Mention how to take the card down later (see "Taking it down later" above).

## Sending it

Suggest a short message to accompany the link (people open links from friends, but context helps):

> "Made you something for your birthday 🎂 Open it with sound on: https://…"

Other delivery ideas:
- **Timing:** send it at midnight on the day, or have the user schedule the text.
- **QR code** for a physical card or gift tag: `npx --yes qrcode -o qr.png "https://…"` (prints a PNG). Suggest putting it inside a paper card: "Scan me 🎶".
- **Group cards:** share the link in the team channel *after* the recipient opens it, so the reveal stays a surprise.
- **Video export** (for Instagram/WhatsApp status): screen-record the card on a phone. There's no built-in renderer.

## The README hand-off

Write `<card>/README.md` for the sender, in plain language:

```markdown
# Maya's 30th — card

**Preview:** in this folder run `python3 -m http.server 8000`, then open http://localhost:8000 (sound on). Opening index.html directly won't work.
**Edit words:** open `content.js` — every name, line and caption is there. Save and refresh.
**Change the song:** replace `assets/audio/song.mp3` (same name), then ask Claude to re-sync (it re-runs the analysis).
**Live at:** https://maya-30-k7f2q.pages.dev (Cloudflare Pages; settings in deploy.json). After editing, ask Claude to redeploy, or run `python3 <skill>/scripts/deploy.py . --yes`.
**Take it down:** `npx wrangler pages project delete maya-30-k7f2q`.
**Share:** send the link with "open with sound on". Link preview image: og.jpg (update og:image to the full URL after publishing).
**Credits & licences:** see CREDITS.md.
```
