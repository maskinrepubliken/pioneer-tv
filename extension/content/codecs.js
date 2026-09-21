// Pioneer TV codec gate.
//
// Runs in the page's own world, before any of its scripts. A streaming site
// picks a codec by asking the browser what it can play, and Chromium says yes
// to everything it can decode in software. On a Pi 4 that is a trap: H.264 is
// the one codec the box handles well, while AV1 and VP9 land in a software
// decoder that eats four cores at 540p and still drops frames. So this answers
// for the browser: only H.264 video is supported. Audio is left alone.
(() => {
  const KEEP = /^(avc1|avc3|h264)\b/i;                                 // codec tokens we keep
  const VIDEO = /^(av01|av1|vp08|vp8|vp09|vp9|hev1|hvc1|hevc|h265|dvh1|dvhe|theora)\b/i;
  const WEBM = /^video\/webm\b/i;                                      // VP8/VP9/AV1 only

  function blocked(type) {
    if (typeof type !== 'string') return false;
    if (WEBM.test(type.trim())) return true;
    const m = /codecs\s*=\s*"?([^";]*)/i.exec(type);
    if (!m) return false;                                              // no codec list: not ours to judge
    return m[1].split(',').map((s) => s.trim()).some((c) => VIDEO.test(c) && !KEEP.test(c));
  }

  const wrap = (obj, name, fn) => {
    const orig = obj && obj[name];
    if (typeof orig !== 'function') return;
    const patched = fn(orig);
    try { Object.defineProperty(patched, 'name', { value: orig.name }); } catch {}
    try { Object.defineProperty(obj, name, { value: patched, writable: true, configurable: true }); } catch {}
  };

  wrap(window.MediaSource, 'isTypeSupported', (orig) => function (type) {
    return blocked(type) ? false : orig.call(this, type);
  });
  wrap(window.ManagedMediaSource, 'isTypeSupported', (orig) => function (type) {
    return blocked(type) ? false : orig.call(this, type);
  });
  wrap(window.HTMLMediaElement && HTMLMediaElement.prototype, 'canPlayType', (orig) => function (type) {
    return blocked(type) ? '' : orig.call(this, type);
  });
  wrap(window.MediaCapabilities && MediaCapabilities.prototype, 'decodingInfo', (orig) => function (config) {
    const type = config && config.video && config.video.contentType;
    if (blocked(type)) {
      return Promise.resolve({ supported: false, smooth: false, powerEfficient: false, keySystemAccess: null, configuration: config });
    }
    return orig.call(this, config);
  });
})();
