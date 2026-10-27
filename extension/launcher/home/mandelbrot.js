// Pioneer TV home: the Mandelbrot set, generated without end, like an open
// fire. It zooms in on one of a few places along the set's edge, out again
// and on to the next, very slowly (a quarter of an hour a round). Nearly
// all of it is ink; near the set's edge it glows as embers do, through rust
// to a dimmed ochre, brightest at the foot of the screen. The glow flickers
// gently (a few slow waves out of step, never a blink), and the edges
// waver upwards like the air over a flame.
//
// Drawn by the GPU (WebGL) at a third of the screen's width and fifteen
// frames a second, scaled up: the zoom is slow, so it looks smooth, and
// the Pi's GPU stays far from busy. Without WebGL, a coarser picture is
// worked out on the CPU, a little at a time. stop() draws nothing at all
// (the box resting, the TV off).
window.PioneerTV = window.PioneerTV || {};
(function (M) {
  // Places worth going to, deep enough to be rich, shallow enough for the
  // GPU's 32-bit floats (they blur below a width of about 1e-4).
  const PLACES = [
    [-0.743643887, 0.131825904],     // Seahorse Valley
    [-0.16070135, 1.0375665],        // the top bulb's spirals
    [-1.25066, 0.02012],             // along the antenna
    [0.2549870375, -0.0005679791],   // Elephant Valley
    [-0.7453, 0.1127],
    [-0.1011, 0.9563],
    [-1.7687788, -0.0017390],        // the antenna's little copy
    [0.001643721971, 0.822467633],
  ];
  const WIDE = 3.2;                  // the set's width on screen at the widest
  const DEEP = 1e-3;
  const CYCLE_S = 900;               // in, out and on to the next place
  const FPS = 15;

  const smooth = (t) => t * t * (3 - 2 * t);

  // Where the picture is at time t (seconds): the centre and the width.
  function view(t) {
    const n = Math.floor(t / CYCLE_S);
    const f = (t % CYCLE_S) / CYCLE_S;
    const here = PLACES[n % PLACES.length];
    const next = PLACES[(n + 1) % PLACES.length];
    // In for 55 %, out for 45 %; on the way out, over to the next place.
    const depth = f < 0.55 ? smooth(f / 0.55) : 1 - smooth((f - 0.55) / 0.45);
    const width = Math.exp(Math.log(WIDE) + (Math.log(DEEP) - Math.log(WIDE)) * depth);
    const move = f < 0.75 ? 0 : smooth((f - 0.75) / 0.25);
    // The fire's own clock, kept small for the GPU's floats (it starts over
    // once an hour, a step too small to see in the waver).
    return { x: here[0] + (next[0] - here[0]) * move, y: here[1] + (next[1] - here[1]) * move, width, depth, t: t % 3600 };
  }

  // How bright the fire burns at time t: around 1, a few slow waves out of
  // step with each other, so it never repeats and never blinks.
  function flicker(t) {
    return 1 + 0.06 * Math.sin(t * 0.83) + 0.04 * Math.sin(t * 1.37 + 1.3) + 0.025 * Math.sin(t * 2.71 + 2.1);
  }

  // The design system's colours, read from tokens.css.
  function palette() {
    // Any CSS colour (a hex, or rgb() as a registered property gives it),
    // through a pixel of a canvas.
    const css = getComputedStyle(document.documentElement);
    const pixel = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    const rgb = (name, fallback) => {
      pixel.fillStyle = fallback;
      pixel.fillStyle = css.getPropertyValue(name).trim() || fallback;
      pixel.fillRect(0, 0, 1, 1);
      return [...pixel.getImageData(0, 0, 1, 1).data.slice(0, 3)].map((x) => x / 255);
    };
    // Ink, an ember (ink and rust), rust, ochre.
    const ink = rgb('--pioneertv-surface-ink', '#1c1613');
    const rust = rgb('--pioneertv-surface-rust', '#7a4e33');
    return [ink, ink.map((x, i) => (x + rust[i]) / 2), rust, rgb('--pioneertv-ochre', '#f5cf5a')];
  }

  const FRAGMENT = `
    precision highp float;
    uniform vec2 size;
    uniform vec2 centre;
    uniform float width;
    uniform float time;
    uniform float bright;
    uniform int steps;
    uniform vec3 c0, c1, c2, c3;
    // Smooth noise, for the air over the flame.
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    // Far from the set: ink. Nearer: an ember, rust, then a dimmed ochre
    // right at the edge. t is how near, 0 to 1.
    vec3 shade(float t) {
      float g = pow(clamp(t, 0.0, 1.0), 2.2);
      return g < 0.5 ? mix(c0, c1, g / 0.5)
           : g < 0.8 ? mix(c1, c2, (g - 0.5) / 0.3)
           : mix(c2, c3, (g - 0.8) / 0.2);
    }
    void main() {
      vec2 uv = gl_FragCoord.xy / size;
      // The air over a flame: the picture wavers a little, the waves rising.
      vec2 rise = vec2(uv.x * 3.0, uv.y * 2.0 - time * 0.12);
      vec2 waver = vec2(noise(rise) - 0.5, noise(rise + 17.0) - 0.5) * width * 0.008;
      vec2 p = (gl_FragCoord.xy - size * 0.5) / size.x * width + centre + waver;
      vec2 z = vec2(0.0);
      float n = 0.0;
      for (int i = 0; i < 600; i++) {
        if (i >= steps) break;
        z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + p;
        if (dot(z, z) > 256.0) break;
        n += 1.0;
      }
      if (n >= float(steps)) { gl_FragColor = vec4(c0, 1.0); return; }
      // Smooth count: no bands between the steps.
      float nu = n + 1.0 - log2(log2(dot(z, z)) * 0.5);
      // Brightest at the foot, as a fire is; the flicker, and slow patches
      // of brighter and darker drifting up through it.
      float foot = mix(1.0, 0.5, smoothstep(0.0, 1.0, uv.y));
      float drift = 0.85 + 0.3 * noise(vec2(uv.x * 2.0, uv.y * 1.5 - time * 0.07));
      vec3 c = mix(c0, shade(log(max(nu, 1.0)) / log(float(steps))), clamp(0.8 * foot * drift * bright, 0.0, 1.0));
      gl_FragColor = vec4(c, 1.0);
    }`;
  const VERTEX = 'attribute vec2 a; void main() { gl_Position = vec4(a, 0.0, 1.0); }';

  function webgl(canvas) {
    const gl = canvas.getContext('webgl', { antialias: false, depth: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
    if (!gl) return null;
    const shader = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, 'a');
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
    const u = (name) => gl.getUniformLocation(prog, name);
    palette().forEach((c, i) => gl.uniform3fv(u(`c${i}`), c));
    return (v) => {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(u('size'), canvas.width, canvas.height);
      gl.uniform2f(u('centre'), v.x, v.y);
      gl.uniform1f(u('width'), v.width);
      gl.uniform1i(u('steps'), Math.round(120 + 240 * v.depth));
      gl.uniform1f(u('time'), v.t);
      gl.uniform1f(u('bright'), flicker(v.t));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
  }

  // Without WebGL: a small picture on the CPU, a band of rows per frame.
  function cpu(canvas) {
    const ctx = canvas.getContext('2d');
    const colours = palette().map((c) => c.map((x) => Math.round(x * 255)));
    const img = ctx.createImageData(canvas.width, canvas.height);
    let row = 0;
    let v = null;
    return (next) => {
      if (row === 0) v = next;
      const { width: w, height: h } = canvas;
      const steps = Math.round(80 + 120 * v.depth);
      const bright = flicker(v.t);
      const band = Math.ceil(h / 6);
      for (let y = row; y < Math.min(h, row + band); y++) {
        for (let x = 0; x < w; x++) {
          const px = (x - w / 2) / w * v.width + v.x;
          const py = (h / 2 - y) / w * v.width + v.y;
          let zx = 0, zy = 0, n = 0;
          while (n < steps && zx * zx + zy * zy <= 256) { const t = zx * zx - zy * zy + px; zy = 2 * zx * zy + py; zx = t; n++; }
          let c = colours[0];
          if (n < steps) {
            // As the shader's shade(): ink far off, glowing near the edge.
            const nu = n + 1 - Math.log2(Math.log2(zx * zx + zy * zy) / 2);
            const g = Math.min(1, Math.max(0, Math.log(Math.max(nu, 1)) / Math.log(steps))) ** 2.2;
            const [from, to, f] = g < 0.5 ? [0, 1, g / 0.5] : g < 0.8 ? [1, 2, (g - 0.5) / 0.3] : [2, 3, (g - 0.8) / 0.2];
            const glow = Math.min(1, 0.8 * (1 - 0.5 * (y / h)) * bright);     // brightest at the foot
            c = colours[from].map((a, k) => colours[0][k] + (a + (colours[to][k] - a) * f - colours[0][k]) * glow);
          }
          const o = (y * w + x) * 4;
          img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
        }
      }
      row += band;
      if (row >= h) { row = 0; ctx.putImageData(img, 0, 0); }
    };
  }

  // Starts drawing into the canvas; returns { stop, start, jump }.
  M.mandelbrot = function (canvas) {
    let draw = null;
    let gpu = true;
    const fit = () => {
      const scale = gpu ? 3 : 8;
      canvas.width = Math.max(160, Math.round(window.innerWidth / scale));
      canvas.height = Math.max(90, Math.round(window.innerHeight / scale));
    };
    fit();
    try { draw = webgl(canvas); } catch (err) { console.warn('mandelbrot: no WebGL', err); }
    if (!draw) { gpu = false; fit(); draw = cpu(canvas); }
    window.addEventListener('resize', fit);
    let begun = performance.now() - Math.random() * CYCLE_S * PLACES.length * 1000;
    let timer = null;
    const frame = () => { draw(view((performance.now() - begun) / 1000)); };
    const start = () => { if (!timer) { frame(); timer = setInterval(frame, gpu ? 1000 / FPS : 1000 / 30); } };
    const stop = () => { clearInterval(timer); timer = null; };
    start();
    // Straight to a point of a zoom: 0 the widest, 0.55 the deepest.
    const jump = (part) => { begun = performance.now() - part * CYCLE_S * 1000; frame(); };
    return { start, stop, jump, gpu };
  };
})(window.PioneerTV);
