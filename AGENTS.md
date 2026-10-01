# AGENTS.md

Notes for agents and contributors working on this repository. `README.md` is for people using
the skill; `celebration-card/SKILL.md` is what Claude follows when it builds a card.

## Repository layout

```text
celebration-card/                the skill; installers copy only this folder
  SKILL.md                       the workflow (story, audio route, concept, media, build, sync,
                                 QA, deliver) and the guardrails
  references/                    loaded on demand by SKILL.md:
                                   runtime-api.md (engine, scenes, cues, every fx module),
                                   visual-cookbook.md, occasions.md, qa.md, deploy-and-share.md,
                                   suno.md, elevenlabs.md, synth-music.md, audio-sources.md
  scripts/                       one CLI per job (table below)
  assets/template/               the card every build starts from: index.html, main.js,
                                 content.js, styles.css, runtime/, fx/, scenes/, music/,
                                 song-preview.html (dev tool, never published)
  evals/                         evals.json (test prompts) and files/ (their inputs, with CREDITS.md)
assets/logo.svg                  README logo; one file that works on GitHub light and dark
README.md                        user-facing: plain English, keep it short
AGENTS.md                        this file
```

Ignored and local only: `celebration-card-workspace/` (eval runs and logo working files),
`.claude/`, `.playwright-mcp/`, `.env`.

The README title is an HTML `<h1>` so the logo can sit above it.

## Scripts

| Script | Purpose |
| --- | --- |
| `serve.py` | local preview server with HTTP Range (audio seeking) and no caching; if port 8765 is busy it takes the next free one and prints it |
| `snap.mjs` | headless QA: phone and desktop frames at exact song times through `card.snap()`, a tap test for audio, console errors and failed requests in `qa-report.json` |
| `prepare_media.py` | photos to WebP plus thumbnails with all metadata stripped; videos to H.264 MP4 plus a poster; writes `media.json` |
| `analyze_audio.py` | tempo, beats, downbeats, meter, sections, energy and loudness bands for any song, written to `analysis.json` |
| `deploy.py` | publish to Cloudflare Pages, Vercel, Netlify or surge.sh: prints a plan, publishes only with `--yes`, verifies the live page, records `<card>/deploy.json` |

## Conventions

- The skill folder stays self-contained, and no file in it refers to a parent folder. Template
  modules import across folders through the `card/` alias from the import map
  (`import { ease } from 'card/runtime/anim.js'`); same-folder imports use `./name.js`.
- The template has no build step: native ES modules, with `three` and `tone` pinned in the import
  map. Any HTML page that loads card modules needs the `"card/": "./"` line and sits next to
  `index.html`.
- Animation is a pure function of song time, so any moment can be seeked, replayed and
  screenshotted. Details are in `SKILL.md` and `references/runtime-api.md`.
- Scripts run on Python 3.9+ (the macOS system Python must work) with the standard library plus
  numpy and Pillow. Audio and video go through ffmpeg/ffprobe subprocesses, always as argument
  lists, never a shell string. Temporary files live in `tempfile.TemporaryDirectory()` blocks.
- `deploy.py` never publishes without `--yes`, reads tokens only from the environment, and never
  uploads hidden files, key or credential files, files with no extension, or links that point
  outside the card folder. Keep those guarantees when editing it.
- When behavior changes, update `SKILL.md` and the relevant reference in the same change. Keep
  `SKILL.md` about what to do, with detail in the references. Its `description` must stay within
  1024 characters.
- README and docs are in plain English: short sentences, and no jargon the reader has to look up.
- Commits go straight to `main` with a plain one-line message and no trailers.

## Security grade

The skill is listed at https://www.skillsdirectory.com/skills/donth77-celebration-card, which
grades it with a static pattern scanner. Check a change before pushing at
https://www.skillsdirectory.com/security/scan (a GitHub link or a ZIP of `celebration-card/`).
The grade comes from `SKILL.md`; findings in bundled files are listed but not counted. As of
2026-10-01 it scores A (100/100) with three findings left, all for the scripts running ffmpeg and
the hosting CLIs through `subprocess`.

The scanner matches text, not behavior. These have set it off before, so keep them out of the
skill folder (code, comments and docs alike):

- parent-folder path sequences (reported as path traversal)
- a property or file name ending in `.locked` (reported as file encryption)
- names of private key files (reported as SSH key access)
- hand-written deletion such as `shutil.rmtree` (reported as destructive file operations)
- literal package-install commands in hints or docs (reported as package installation)
- reading environment variables in `snap.mjs` (reported as environment harvesting)

The aim is to avoid false alarms, not to hide behavior. If a change really needs one of these,
keep it and accept the finding.

## Testing

```bash
# the demo card: serve it, then capture frames and check that audio starts on tap
python3 celebration-card/scripts/serve.py celebration-card/assets/template
node celebration-card/scripts/snap.mjs http://localhost:8765/ --out /tmp/card-qa --tap --desktop \
  --times gate,start,verse1+2bar,verse2+2bar,finale+2bar,outro+1bar,end

# the synthesized songs: open these while the server runs and read the report on the page
#   http://localhost:8765/song-preview.html?song=song.js&rate=22050
#   http://localhost:8765/song-preview.html?song=examples/fanfare.js&rate=22050

# the scripts, using the eval files
python3 celebration-card/scripts/analyze_audio.py celebration-card/evals/files/jules-40/song.mp3 --out /tmp/analysis.json
python3 celebration-card/scripts/prepare_media.py celebration-card/evals/files/jules-40/photos --out /tmp/card/assets/media
python3 celebration-card/scripts/deploy.py <card-folder> --to netlify-anon     # plan only: nothing is published
```

After `snap.mjs`, open the PNGs and look at them; `qa-report.json` should show no errors and no
failed scenes. `snap.mjs` needs the `playwright` package: it finds a copy in the project or the
npx cache, or takes `--playwright <path>`.

`deploy.py --yes` publishes for real and has not been run end to end yet. Do it only with the
owner's go-ahead, then check the live link, the preview image and audio seeking.

`evals/evals.json` holds three end-to-end prompts. A full round with and without the skill costs
about 3 million tokens, so prefer targeted checks.
