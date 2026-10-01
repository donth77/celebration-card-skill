// Every word, name and photo in the card lives here, so the sender can tweak text later
// without touching code. Scenes read from this object; index.html elements with
// data-bind="path" are filled from it too (e.g. data-bind="gate.to").
//
// Photos come from scripts/prepare_media.py (assets/media/media.json lists them). For each one,
// look at the picture, write a short caption, and set `focus` to where the faces are
// (x, y from 0..1) so crops and zooms never cut off heads.

export default {
  recipient: 'Alex',
  from: 'Sam',
  occasion: 'birthday',
  milestone: 30,

  gate: { to: 'For Alex', seal: 'A', letter: 'Happy Birthday' },

  opening: { kicker: 'For Alex, with love', title: 'Happy Birthday', name: 'Alex' },

  // { src, caption, focus: [x, y], alt } — or { video, poster, caption } for muted clips
  photos: [],

  finale: { big: '30', line: 'Here’s to your best year yet', hint: 'tap the sky ✨' },

  letter: {
    greeting: 'Alex —',
    body: [
      'Thirty looks good on you. Thank you for the late-night pancakes, the terrible puns, and for showing up every single time it mattered.',
      'I hope this year is full of the things that make you laugh so hard you have to sit down.',
    ],
    signoff: 'Love always,',
    signature: 'Sam',
  },

  // Optional reply button on the end screen, so they can answer the sender in one tap.
  // Only set this if the sender wants their number/email in the page. Hidden when null.
  //   { label: 'Text Sam back 💬', href: 'sms:+15555550123?&body=' + encodeURIComponent('Thank you!!') }
  //   { label: 'Email Sam back', href: 'mailto:sam@example.com?subject=' + encodeURIComponent('Thank you!') }
  reply: null,

  credits: [
    'Music: “Happy Birthday to You” (Mildred & Patty Hill, public domain), arranged and synthesized for this card.',
  ],
};
