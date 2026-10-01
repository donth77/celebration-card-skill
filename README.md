<p align="center">
  <img src="assets/logo.svg" width="128" alt="Celebration Card Skill logo: a party popper firing a play button">
</p>

<h1 align="center">Celebration Card Skill</h1>

A Claude Code skill that makes interactive celebration cards: short websites with music,
animation and photos that you send as a link. Use it for birthdays, retirements, anniversaries,
weddings, graduations, new babies, farewells, team cards and more. Tell Claude who the card is for
and what they love. Claude plans the card around a song, builds it, tests it on a phone-sized
screen, and can publish it for you.

## What you get

- A website the person opens on their phone. They tap an envelope (or a gift box, a door…), the
  music starts, and the card plays for one to three minutes.
- Visuals made for them: 3D scenes, fireworks that spell their name or age, confetti, their photos
  and videos, and something to do, like blowing out candles.
- A letter at the end that stays on screen, with a replay button.
- If you want it: a published link on Cloudflare, Vercel, Netlify or surge.sh, plus a QR code for
  a paper card.

## Music

Pick one, or let Claude suggest:

- **A custom Suno song.** Claude writes the Suno prompt first: lyrics with their name, the
  style, and the settings. You make the song in Suno, and Claude times the card to it.
- **Music Claude composes**, played right in the browser. Free, and includes public-domain tunes
  like Happy Birthday.
- **Your own song.** Claude measures its tempo and sections so the big moments land with the music.
- **ElevenLabs music**, if you have a paid account.
- **A free public-domain or CC0 recording.**

## How to use

1. Open Claude Code in the folder where you want the card. Ask for a card: who it's for, the
   occasion, and a few personal details. Mention any photos, videos or song you have.
2. Claude asks a few questions in one go (tone, message, music, whether to publish), or goes
   ahead with sensible choices if you'd rather.
3. Claude suggests an idea for the card and how it will follow the music.
4. If you picked Suno, Claude gives you the prompt to paste into Suno. Save the take you like as
   `song.mp3` and tell Claude. Until then, the card plays a stand-in track.
5. Claude builds the card, checks it in a phone-sized browser, and fixes what it finds.
6. You preview it with the sound on and ask for changes. All the words live in one file,
   `content.js`, so you can also edit them yourself.
7. To publish, Claude first shows you where the card will go and what will be uploaded. Nothing
   goes online until you say yes.

## What you need

- Claude Code
- Python 3.9 or newer with numpy and Pillow, and ffmpeg (`brew install ffmpeg` on a Mac)
- Node.js, for screenshots and publishing
- Optional: a Suno account for a custom song, or an ElevenLabs account
- Optional, to publish: an account on Cloudflare, Vercel, Netlify or surge.sh. Log in once from
  Claude Code, for example `! npx wrangler login` for Cloudflare.

## Install

```bash
ln -s "$(pwd)/celebration-card" ~/.claude/skills/celebration-card
```

Or copy the `celebration-card` folder into `~/.claude/skills/`.

## Example requests

```text
A birthday card for my sister Maya, turning 30. She loves plants and 90s R&B. From me, Sam.
Photos are in ~/Pictures/maya.
```

```text
My dad is retiring after 34 years teaching chemistry. No photos, go big with 3D. He loves fly
fishing and terrible puns. Make the music yourself.
```

```text
Our 10th anniversary. Write a Suno prompt for a song with my wife's name in it (Priya, said
PREE-yah), then build the site around the song.
```

```text
Here's the song we always dance to (song.mp3) and some trip photos. Make Jules a 40th birthday
card that hits the big moments in the music, and publish it to Cloudflare.
```

```text
Change the last line of the letter, make the fireworks gold, and redeploy.
```

## Costs

Building a card uses only Claude. Music Claude composes is free. Suno and ElevenLabs use your
own plan's credits, and Claude asks before spending them. Cloudflare Pages, Netlify, surge.sh and
Vercel's free plan cost nothing for a card like this.

## Privacy

Cards often hold family photos. Claude removes location data from photos, gives published cards a
hard-to-guess link, and tells search engines not to list them. Anyone who has the link can still
open the card, so share it like you would a photo album.

## What's in this repo

- `celebration-card/`: the skill itself: instructions, scripts and the card template
- `celebration-card/evals/`: test requests used while building the skill
- `assets/`: the logo at the top of this page

To try the demo card: run `python3 celebration-card/scripts/serve.py celebration-card/assets/template`,
then open http://localhost:8765 with the sound on.
