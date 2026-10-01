// The card's composition: which music, which scenes when, and which moments fire on the beat.
// Times are musical anchors from the song's sections (see music/song.js or the audio analysis):
// 'verse1', 'finale+2bar', 'outro-1b', 'end' … so the visuals stay locked to the music.

import { createCard, readPalette } from './runtime/card.js';
import content from './content.js';
import { FxLayer } from './fx/layer.js';
import { Confetti } from './fx/confetti.js';
import { Fireworks } from './fx/fireworks.js';
import { createBackground } from './fx/background.js';
import { sfx } from './fx/sfx.js';
import { bindContent, buildKeepsake } from './scenes/keepsake.js';
import { opening } from './scenes/opening.js';
import { wish } from './scenes/wish.js';
// Photos supplied? Add the optional gallery scene: import { photoGallery } from './scenes/photo-gallery.js';
import { finale } from './scenes/finale.js';
import { letter } from './scenes/letter.js';

bindContent(content);
buildKeepsake(content);

const palette = readPalette();
const fx = new FxLayer('#fx');
const confetti = fx.add(new Confetti({ colors: [...palette.accents, '#ffffff'] }));
const fireworks = fx.add(new Fireworks({
  colors: [...palette.accents, '#fff4d6'],
  onBurst: ({ size }) => sfx.boom(0.3 + 0.25 * size),
}));
const bg = createBackground('#bg', { preset: 'aurora', colors: [palette.bg, '#2a1450', '#7ae7ff', '#ff6b9a'] });

const card = await createCard({
  content,
  // Audio route — pick one:
  //   { synth: () => import('./music/song.js') }                                   Claude-composed (this demo)
  //   { src: 'assets/audio/song.mp3', analysis: 'assets/audio/analysis.json' }    Suno / ElevenLabs / PD / CC0 file
  //   { src: 'assets/audio/song.mp3', analysis: '…', plan: { bpm, meter, sections: [['intro', 8], …] } }
  //                                                       plan = timing to use until the real song + analysis exist
  audio: { synth: () => import('./music/song.js') },
  scenes: [
    { id: 'opening', from: 'start', to: 'verse1', scene: opening },
    { id: 'wish', from: 'verse1', to: 'outro+1bar', scene: wish },   // 3D cake, balloons, blow out the candles
    { id: 'finale', from: 'lift', to: 'outro', scene: finale },      // overlaps: big number + fireworks over the 3D sky
    { id: 'letter', from: 'outro', to: 'end', scene: letter },
  ],
  cues: [
    { at: 'finale', run: () => { confetti.cannons({ count: 120 }); sfx.cork(); } },
    // fireworks launched a beat early so they burst on each downbeat of the finale
    {
      every: 'bar', from: 'finale+1bar', to: 'finale+6bar', offset: '-1b',
      run: (ctx, i) => fireworks.launch({ x: [0.25, 0.75, 0.4, 0.62, 0.3][i % 5], y: 0.2 + (i % 3) * 0.07, type: ['peony', 'ring', 'willow', 'heart', 'palm'][i % 5], rise: ctx.timing.spb }),
    },
    { at: 'finale+6bar', offset: '-1b', run: (ctx) => fireworks.launch({ type: 'text', text: String(content.finale.big), font: '900 200px "Fraunces"', x: 0.5, y: 0.3, size: 0.9, rise: ctx.timing.spb, hold: 2.2 }) },
    { at: 'outro', run: () => confetti.rain({ duration: 6, rate: 45 }) },
  ],
  systems: [bg, fx],
  ctx: { bg, fx, confetti, fireworks, sfx },
  onOpen: () => { sfx.unlock(); sfx.paper(); },
});

card.on('mute', (m) => { sfx.muted = m; });
