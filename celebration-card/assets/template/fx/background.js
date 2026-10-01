// Animated full-screen shader backgrounds (plain WebGL, no Three.js needed).
// Presets: 'mesh' (soft gradient blobs), 'aurora', 'bokeh', 'sunset', 'starfield', 'rays', 'paper'.
//
//   const bg = createBackground('#bg', { preset: 'aurora', colors: ['#0b1026', '#1d2b64', '#7cf2c8', '#c38bff'] });
//   card.addSystem(bg, -10);                          // renders every frame, behind everything
//   bg.set({ colors: [...], intensity: 1.4 }, 2.0);   // glide to new colours over 2 s (e.g. at the chorus)
//   bg.setPreset('rays');                             // switch look (instant; cover with a transition)
//
// Colours: 4 hex values, darkest/background first. Audio level and beat pulse feed uLevel/uBeat.
// Rendered at reduced resolution (scale) — soft gradients don't need full res, phones thank you.

import { hexToRgb, lerp } from 'card/runtime/anim.js';

const HEAD = `precision mediump float;
uniform vec2 uRes; uniform float uTime, uLevel, uBeat, uIntensity;
uniform vec3 uC0, uC1, uC2, uC3;
varying vec2 vUv;
float hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=.5; } return v; }
vec3 grain(vec3 c){ return c + (hash(gl_FragCoord.xy + fract(uTime)) - .5) / 64.; }
`;

const PRESETS = {
  mesh: `void main(){
    vec2 uv = vUv; float a = uRes.x/uRes.y; vec2 p = vec2(uv.x*a, uv.y); float t = uTime*.12;
    vec2 p1 = vec2(.25*a + .18*a*sin(t*1.3), .3 + .2*cos(t*1.1));
    vec2 p2 = vec2(.75*a + .2*a*cos(t*.9), .7 + .18*sin(t*1.4));
    vec2 p3 = vec2(.5*a + .3*a*sin(t*.7+2.), .5 + .3*cos(t*.8+1.));
    float w0 = .9, w1 = 1./(.02+pow(distance(p,p1),2.)), w2 = 1./(.02+pow(distance(p,p2),2.)), w3 = 1./(.03+pow(distance(p,p3),2.)) * (.7+.6*uLevel);
    vec3 c = (uC0*w0 + uC1*w1 + uC2*w2 + uC3*w3) / (w0+w1+w2+w3);
    c *= .92 + .08*uIntensity + .06*uBeat;
    gl_FragColor = vec4(grain(c),1.); }`,

  aurora: `void main(){
    vec2 uv = vUv; float t = uTime*.05;
    vec3 c = mix(uC0, uC1, smoothstep(0., 1.2, uv.y));
    for(int i=0;i<3;i++){
      float fi = float(i);
      float x = uv.x*(1.4+fi*.35) + t*(1.+fi*.4) + fi*3.7;
      float band = fbm(vec2(x, t*2. + fi)) ;
      float y = .55 + .18*sin(x*2.1 + fi) + (band-.5)*.5;
      float d = uv.y - y;
      float curtain = exp(-d*d*38.) * smoothstep(-.35, .05, d) * (.45 + .55*fbm(vec2(uv.x*9.+fi, t*6.)));
      vec3 col = mix(uC2, uC3, fract(fi*.5 + band));
      float k = curtain * (.22 + .3*uIntensity) * (.8 + .4*uLevel);
      c = mix(c, col, k * .6) + col * k * .35;
    }
    vec2 sp = vec2(uv.x * uRes.x/uRes.y, uv.y) * 90.; vec2 id = floor(sp); float h = hash(id);
    if (h > .985) { float d = length(fract(sp) - .5 - (vec2(hash(id+2.), hash(id+5.)) - .5)*.5);
      c += vec3(.9,.92,1.) * smoothstep(.12, 0., d) * (.5+.5*sin(uTime*2.+h*90.)) * (1.-uv.y*.2) * .8; }
    gl_FragColor = vec4(grain(c),1.); }`,

  bokeh: `void main(){
    vec2 uv = vUv; float a = uRes.x/uRes.y; vec2 p = vec2(uv.x*a, uv.y);
    vec3 c = mix(uC0, uC1, uv.y*.9);
    for(int i=0;i<14;i++){
      float fi = float(i); float r = .05 + .09*hash(vec2(fi, 3.1));
      float sp = .02 + .04*hash(vec2(fi, 7.7));
      vec2 q = vec2(hash(vec2(fi,1.))*a, fract(hash(vec2(fi,2.)) + uTime*sp));
      q.x += .05*sin(uTime*.3 + fi);
      float d = distance(p, q);
      float disc = smoothstep(r, r*.82, d) * (.18 + .12*hash(vec2(fi,9.)));
      vec3 col = mod(fi, 2.) < 1. ? uC2 : uC3;
      c += col * disc * (.7 + .6*uLevel + .3*uBeat) * uIntensity;
    }
    gl_FragColor = vec4(grain(c),1.); }`,

  sunset: `void main(){
    vec2 uv = vUv; float a = uRes.x/uRes.y;
    vec3 c = mix(uC2, uC1, smoothstep(.0, .55, uv.y)); c = mix(c, uC0, smoothstep(.45, 1., uv.y));
    vec2 sp = vec2(.5*a, .18 + .04*sin(uTime*.1)); float d = distance(vec2(uv.x*a, uv.y), sp);
    c += uC3 * (smoothstep(.16, .14, d) * .9 + exp(-d*4.5) * (.45 + .25*uLevel)) * uIntensity;
    float cl = fbm(vec2(uv.x*3. + uTime*.02, uv.y*7.)); c = mix(c, c*1.12 + .03, smoothstep(.55, .8, cl) * smoothstep(.2, .6, uv.y) * .5);
    gl_FragColor = vec4(grain(c),1.); }`,

  starfield: `void main(){
    vec2 uv = vUv; float a = uRes.x/uRes.y; vec2 p = vec2(uv.x*a, uv.y);
    vec3 c = mix(uC0, uC1, pow(uv.y, 1.5));
    float n = fbm(p*2.2 + vec2(uTime*.01, 0.)); c += mix(uC2, uC3, n) * smoothstep(.45, .85, n) * .35 * uIntensity;
    for(int L=0; L<3; L++){
      float fl = float(L); float sc = 60. + fl*55.;
      vec2 q = p*sc + vec2(uTime*(.6+fl*.5), 0.);
      vec2 id = floor(q); vec2 f = fract(q) - .5;
      float h = hash(id + fl*17.);
      if (h > .965) { vec2 o = vec2(hash(id+3.1), hash(id+5.7)) - .5; float d = length(f - o*.6);
        float tw = .55 + .45*sin(uTime*(1.5+h*3.) + h*60.);
        c += vec3(.9,.95,1.) * smoothstep(.09 - fl*.02, 0., d) * tw * (1.+uBeat*.5); }
    }
    gl_FragColor = vec4(grain(c),1.); }`,

  rays: `void main(){
    vec2 uv = vUv - vec2(.5, .42); uv.x *= uRes.x/uRes.y;
    float ang = atan(uv.y, uv.x) + uTime*.06; float r = length(uv);
    float rays = smoothstep(-.15, .15, sin(ang*12.));
    vec3 c = mix(uC0, uC1, rays*.55);
    c = mix(c, uC2, exp(-r*3.2) * (.6 + .3*uLevel + .25*uBeat) * uIntensity);
    c += uC3 * exp(-r*9.) * .35;
    c *= 1. - r*.35;
    gl_FragColor = vec4(grain(c),1.); }`,

  paper: `void main(){
    vec2 uv = vUv; vec2 p = uv*uRes/uRes.y;
    float fib = fbm(p*vec2(18., 3.)) * .5 + fbm(p*40.) * .5;
    vec3 c = mix(uC0, uC1, fib*.35);
    c = mix(c, uC2, smoothstep(.62, .9, fbm(p*1.6 + uTime*.01)) * .12);
    float v = smoothstep(1.15, .35, length(uv-.5)*1.25); c *= mix(.86, 1., v);
    gl_FragColor = vec4(grain(c),1.); }`,
};

const VERT = 'attribute vec2 p; varying vec2 vUv; void main(){ vUv = p*.5+.5; gl_Position = vec4(p,0.,1.); }';

export function createBackground(canvas, { preset = 'mesh', colors = ['#14102b', '#3b1d5c', '#ff7aa2', '#ffd27a'], scale = null, speed = 1, intensity = 1 } = {}) {
  canvas = typeof canvas === 'string' ? document.querySelector(canvas) : canvas;
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
  if (!gl) {
    // No WebGL: fall back to a CSS gradient so the card still has its colours.
    canvas.style.background = `linear-gradient(180deg, ${colors[1]}, ${colors[0]})`;
    return { update() {}, set() {}, setPreset() {}, canvas, fallback: true };
  }
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  let prog, U = {};
  const compile = (name) => {
    const src = PRESETS[name];
    if (!src) throw new Error(`background: unknown preset "${name}". Presets: ${Object.keys(PRESETS).join(', ')}`);
    const sh = (type, code) => { const s = gl.createShader(type); gl.shaderSource(s, code); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, HEAD + src));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    if (prog) gl.deleteProgram(prog);
    prog = p;
    gl.useProgram(p);
    const loc = gl.getAttribLocation(p, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    U = Object.fromEntries(['uRes', 'uTime', 'uLevel', 'uBeat', 'uIntensity', 'uC0', 'uC1', 'uC2', 'uC3'].map((n) => [n, gl.getUniformLocation(p, n)]));
    state.preset = name;
  };

  const toRgb = (cs) => cs.map((c) => hexToRgb(c).map((v) => v / 255));
  const state = { preset, cur: toRgb(colors), from: toRgb(colors), to: toRgb(colors), tStart: 0, tDur: 0, intensity, iFrom: intensity, iTo: intensity, speed };
  const resScale = scale ?? (preset === 'starfield' ? 0.75 : 0.5);
  compile(preset);

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(2, Math.round((r.width || innerWidth) * dpr * resScale));
    canvas.height = Math.max(2, Math.round((r.height || innerHeight) * dpr * resScale));
    gl.viewport(0, 0, canvas.width, canvas.height);
  };
  resize();
  addEventListener('resize', resize);

  let wall = 0;
  return {
    canvas, gl,
    get preset() { return state.preset; },
    /** Glide to new colours / intensity over `dur` seconds (wall-clock). */
    set({ colors: cs, intensity: inten } = {}, dur = 1.5) {
      state.from = state.cur.map((c) => [...c]);
      state.to = cs ? toRgb(cs) : state.to;
      state.iFrom = state.intensity; state.iTo = inten ?? state.iTo;
      state.tStart = wall; state.tDur = Math.max(0.001, dur);
    },
    setPreset(name) { if (name !== state.preset) compile(name); },
    update(ctx) {
      wall += ctx.dt;
      const u = Math.min(1, (wall - state.tStart) / (state.tDur || 0.001));
      const e = u * u * (3 - 2 * u);
      state.cur = state.from.map((c, i) => c.map((v, k) => lerp(v, state.to[i][k], e)));
      state.intensity = lerp(state.iFrom, state.iTo, e);
      gl.uniform2f(U.uRes, canvas.width, canvas.height);
      gl.uniform1f(U.uTime, (ctx.reducedMotion ? 0.25 : 1) * state.speed * (ctx.t + ctx.wall * 0.15));
      gl.uniform1f(U.uLevel, ctx.levels.level);
      gl.uniform1f(U.uBeat, ctx.reducedMotion ? 0 : ctx.levels.beat);
      gl.uniform1f(U.uIntensity, state.intensity);
      ['uC0', 'uC1', 'uC2', 'uC3'].forEach((n, i) => gl.uniform3fv(U[n], state.cur[i] || state.cur[state.cur.length - 1]));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
  };
}
