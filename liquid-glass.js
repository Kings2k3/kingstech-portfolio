(() => {
  'use strict';

  let snapdomLoader = null;
  let snapdomResolved = null;

  function loadSnapdom() {
    if (snapdomResolved) return Promise.resolve(snapdomResolved);

    // Never let a slow CDN block first paint. The first environment capture can
    // use the local structural fallback, while the real DOM capture module keeps
    // loading in the background and upgrades the material as soon as it arrives.
    if (!snapdomLoader) {
      snapdomLoader = import('https://unpkg.com/@zumer/snapdom@2.24.1/dist/snapdom.mjs')
        .then((module) => {
          snapdomResolved = module.snapdom || null;
          if (snapdomResolved) scheduleIdleCapture(appleMobile ? 6000 : 1200);
          return snapdomResolved;
        })
        .catch(() => null);
    }

    const timeout = new Promise((resolve) => window.setTimeout(() => resolve(snapdomResolved), 900));
    return Promise.race([snapdomLoader, timeout]);
  }

  const root = document.documentElement;
  const targets = [...document.querySelectorAll('[data-liquid-glass]:not([data-liquid-mode="css"])')];
  if (!targets.length) return;

  const reduceMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const contrastQuery = matchMedia('(prefers-contrast: more)');
  const reduceTransparencyQuery = matchMedia('(prefers-reduced-transparency: reduce)');

  const MAX_SHAPES = 8;
  const compactViewport = matchMedia('(max-width: 760px)').matches;
  const appleMobile = /iP(?:hone|ad|od)/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const androidDevice = /Android/i.test(navigator.userAgent)
    || navigator.userAgentData?.platform === 'Android';
  const chromiumAndroid = androidDevice
    && /(Chrome\/|Chromium\/|EdgA\/|SamsungBrowser\/|OPR\/)/i.test(navigator.userAgent);
  // Chromium on Android enforces a relatively small active WebGL-context budget.
  // Keep the exact direct-canvas renderer everywhere that already works, and
  // consolidate only Android Chromium-family browsers into one shared context.
  const SHARED_CONTEXT_MODE = chromiumAndroid;
  const DPR_CAP = compactViewport ? 1.0 : 1.25;
  const CAPTURE_PIXEL_BUDGET = appleMobile ? 3_800_000 : (compactViewport ? 5_500_000 : 10_000_000);
  const ACTIVE_FPS = appleMobile ? 45 : 60;
  const IDLE_FPS = appleMobile ? 30 : 45;
  root.dataset.liquidDeviceProfile = appleMobile ? 'apple-mobile' : (compactViewport ? 'compact' : 'desktop');
  root.dataset.liquidContextStrategy = SHARED_CONTEXT_MODE ? 'shared' : 'direct';
  const STRUCTURAL_SCENE_ONLY = appleMobile;
  const GROUP_PRESETS = {
    // Container glass: clear center, optically active perimeter.
    'navigation':          { strength: 1.10, blur: 6.5,  dim: 0.05, saturate: 1.01, brightness: 1.00, edge: 1.42, clarity: 0.64, chroma: 0.48, reflection: 1.38 },
    'header-icons':        { strength: 1.12, blur: 2.8,  dim: 0.04, saturate: 1.02, brightness: 1.00, edge: 1.24, clarity: 0.60, chroma: 0.88, reflection: 1.22 },
    'header-mobile-icon':  { strength: 1.12, blur: 2.8,  dim: 0.04, saturate: 1.02, brightness: 1.00, edge: 1.24, clarity: 0.60, chroma: 0.88, reflection: 1.22 },
    'footer-icon':         { strength: 1.12, blur: 2.8,  dim: 0.04, saturate: 1.02, brightness: 1.00, edge: 1.24, clarity: 0.60, chroma: 0.88, reflection: 1.22 },

    // Dense panels preserve legibility but retain a visible lens perimeter.
    'fit-selector':        { strength: 1.06, blur: 26.0, dim: 0.72, saturate: 0.96, brightness: 0.99, edge: 1.30, clarity: 0.76, chroma: 0.56, reflection: 1.26 },
    'theme-studio':        { strength: 1.06, blur: 26.0, dim: 0.72, saturate: 0.96, brightness: 0.99, edge: 1.30, clarity: 0.76, chroma: 0.56, reflection: 1.26 },
    'mobile-navigation':   { strength: 1.02, blur: 28.0, dim: 0.70, saturate: 0.94, brightness: 0.98, edge: 1.12, clarity: 0.80, chroma: 0.48, reflection: 1.04 },

    // The colored rail should visibly bend through these lenses.
    'execution-desktop':   { strength: 1.14, blur: 2.2,  dim: 0.03, saturate: 1.04, brightness: 1.00, edge: 1.34, clarity: 0.56, chroma: 1.00, reflection: 1.24 },
    'execution-mobile':    { strength: 1.10, blur: 2.6,  dim: 0.05, saturate: 1.03, brightness: 1.00, edge: 1.28, clarity: 0.60, chroma: 0.92, reflection: 1.18 },

    // Standalone controls: obvious lensing, restrained center distortion.
    'hero-glass':          { strength: 1.12, blur: 1.4,  dim: 0.02, saturate: 1.03, brightness: 1.00, edge: 1.30, clarity: 0.58, chroma: 0.95, reflection: 1.22 },
    'contact-glass':       { strength: 1.12, blur: 1.4,  dim: 0.02, saturate: 1.03, brightness: 1.00, edge: 1.30, clarity: 0.58, chroma: 0.95, reflection: 1.22 },
    'service-icons':       { strength: 1.14, blur: 1.0,  dim: 0.00, saturate: 1.04, brightness: 1.00, edge: 1.38, clarity: 0.52, chroma: 1.00, reflection: 1.28 },
    'contact-arrows':      { strength: 1.14, blur: 1.0,  dim: 0.00, saturate: 1.04, brightness: 1.00, edge: 1.38, clarity: 0.52, chroma: 1.00, reflection: 1.28 },
    'portrait-status':     { strength: 1.06, blur: 1.0,  dim: 0.02, saturate: 1.03, brightness: 1.00, edge: 1.24, clarity: 0.56, chroma: 0.90, reflection: 1.16 },
  };

  const SCENE_CACHE_BUILD = '20260816-live-theme-settled-v2';

  const captureImageDataUrlCache = new Map();

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('Failed to encode image blob.'));
      reader.readAsDataURL(blob);
    });
  }

  async function imageToDataURL(img) {
    const source = img.currentSrc || img.src;
    if (!source || source.startsWith('data:') || source.startsWith('blob:')) return source;
    if (captureImageDataUrlCache.has(source)) return captureImageDataUrlCache.get(source);

    let dataURL = null;

    // These portfolio assets are same-origin and have already been loaded by the
    // browser. Read them from the HTTP cache ourselves so SnapDOM never needs to
    // start its own timed image request during a capture.
    try {
      const url = new URL(source, location.href);
      if (url.origin === location.origin) {
        const response = await fetch(url.href, {
          cache: 'force-cache',
          credentials: 'same-origin',
        });
        if (response.ok) dataURL = await blobToDataURL(await response.blob());
      }
    } catch (_) {}

    // If the explicit cached fetch is unavailable, the already-decoded DOM image
    // is still safe to read because it is same-origin.
    if (!dataURL && img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d', { alpha: true });
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          dataURL = canvas.toDataURL('image/png');
        }
      } catch (_) {}
    }

    if (dataURL) captureImageDataUrlCache.set(source, dataURL);
    return dataURL;
  }

  async function inlineCaptureImages() {
    const images = [...document.querySelectorAll(
      '.portrait-img, .wordmark-logo'
    )];
    const restores = [];

    await Promise.all(images.map(async (img) => {
      try {
        if (!img.complete || img.naturalWidth < 1) {
          await img.decode().catch(() => {});
        }
        const dataURL = await imageToDataURL(img);
        if (!dataURL || dataURL === img.src) return;

        restores.push({
          img,
          src: img.getAttribute('src'),
          srcset: img.getAttribute('srcset'),
          sizes: img.getAttribute('sizes'),
        });

        img.removeAttribute('srcset');
        img.removeAttribute('sizes');
        img.setAttribute('src', dataURL);
        await img.decode().catch(() => {});
      } catch (_) {}
    }));

    return () => {
      for (const state of restores) {
        if (state.src == null) state.img.removeAttribute('src');
        else state.img.setAttribute('src', state.src);
        if (state.srcset == null) state.img.removeAttribute('srcset');
        else state.img.setAttribute('srcset', state.srcset);
        if (state.sizes == null) state.img.removeAttribute('sizes');
        else state.img.setAttribute('sizes', state.sizes);
      }
    };
  }
  const SCENE_CACHE_DB = 'raynerdtech-liquid-scenes';
  const SCENE_CACHE_STORE = 'scenes';
  const SCENE_CACHE_MAX_AGE = 1000 * 60 * 60 * 24 * 14;
  let sceneCacheDbPromise = null;
  let lastGlobalRender = 0;
  const groups = [];
  let pointer = { x: innerWidth * 0.5, y: innerHeight * 0.32, lastX: innerWidth * 0.5, lastY: innerHeight * 0.32, t: performance.now() };
  let lightPointer = { x: pointer.x, y: pointer.y };
  let pageFocused = true;
  let sceneCanvas = null;
  let sceneCtx = null;
  let sceneVersion = 0;
  let documentWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
  let documentHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
  let captureTimer = 0;
  let idleCaptureTimer = 0;
  let idleCaptureHandle = 0;
  let scrollActiveUntil = 0;
  let capturing = false;
  let recaptureRequested = false;
  let lastForegroundUpdate = 0;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mix = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a || 1), 0, 1);
    return t * t * (3 - 2 * t);
  };

  function commonAncestor(elements) {
    if (!elements.length) return null;
    let node = elements[0];
    while (node) {
      if (elements.every((el) => node.contains(el))) return node;
      node = node.parentElement;
    }
    return elements[0].parentElement;
  }

  function parsePx(value, fallback = 0) {
    const n = Number.parseFloat(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function parseColor(value) {
    const input = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(input)) {
      return [
        parseInt(input.slice(1, 3), 16) / 255,
        parseInt(input.slice(3, 5), 16) / 255,
        parseInt(input.slice(5, 7), 16) / 255,
      ];
    }
    if (/^#[0-9a-f]{3}$/i.test(input)) {
      return [
        parseInt(input[1] + input[1], 16) / 255,
        parseInt(input[2] + input[2], 16) / 255,
        parseInt(input[3] + input[3], 16) / 255,
      ];
    }
    const probe = document.createElement('span');
    probe.style.color = input;
    probe.style.display = 'none';
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    const nums = resolved.match(/[\d.]+/g)?.map(Number) || [176, 141, 87];
    return [nums[0] / 255, nums[1] / 255, nums[2] / 255];
  }

  function currentAccent() {
    return parseColor(getComputedStyle(root).getPropertyValue('--accent') || '#B08D57');
  }

  function currentBackground() {
    const rgb = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g)?.map(Number) || [0, 0, 0];
    return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`;
  }

  function currentBackgroundRgb() {
    return getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g)?.map(Number) || [0, 0, 0];
  }

  const vertexShader = `#version 300 es
    precision highp float;
    in vec2 a_position;
    out vec2 v_uv;
    void main() {
      v_uv = a_position * 0.5 + 0.5;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }
  `;

  const fragmentShader = `#version 300 es
    precision highp float;
    #define MAX_SHAPES ${MAX_SHAPES}

    in vec2 v_uv;
    out vec4 outColor;

    uniform sampler2D u_scene;
    uniform vec2 u_resolution;
    uniform float u_dpr;
    uniform float u_time;
    uniform int u_shapeCount;
    uniform vec4 u_shapes[MAX_SHAPES];       // center x,y, halfW, halfH (device pixels)
    uniform vec4 u_meta[MAX_SHAPES];         // variant, tint, optical control, radius (device pixels)
    uniform float u_activeIndex;
    uniform float u_hoverIndex;
    uniform vec2 u_press;
    uniform vec2 u_velocity;
    uniform vec2 u_light;
    uniform vec3 u_accent;
    uniform float u_pressEnergy;
    uniform float u_hoverEnergy;
    uniform float u_materialize;
    uniform float u_focus;
    uniform float u_merge;
    uniform float u_scrollEdge;
    uniform float u_scrollProgress;
    uniform float u_reducedMotion;
    uniform float u_reducedTransparency;
    uniform float u_increasedContrast;
    uniform vec4 u_selection;             // center x,y, halfW, halfH (device pixels)
    uniform vec2 u_selectionVelocity;
    uniform float u_selectionAmount;
    uniform float u_selectionRadius;
    uniform float u_selectionFluidity;
    uniform vec4 u_selectionClip;         // center x,y, halfW, halfH (device pixels)
    uniform float u_selectionClipRadius;
    uniform float u_edgeGain;
    uniform float u_centerClarity;
    uniform float u_chromaGain;
    uniform float u_reflectionGain;
    uniform vec3 u_backgroundColor;
    uniform float u_navContinuousBody;

    float sdRoundBox(vec2 p, vec2 b, float r) {
      r = min(r, min(b.x, b.y));
      vec2 q = abs(p) - b + r;
      return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
    }

    float smin(float a, float b, float k) {
      if (k <= 0.001) return min(a, b);
      float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
      return mix(b, a, h) - k * h * (1.0 - h);
    }

    float luma(vec3 c) {
      return dot(c, vec3(0.2126, 0.7152, 0.0722));
    }

    vec3 sceneAt(vec2 px) {
      vec2 uv = clamp(px / u_resolution, vec2(0.001), vec2(0.999));
      return texture(u_scene, uv).rgb;
    }

    float rawShapeDistance(int i, vec2 px) {
      vec4 shape = u_shapes[i];
      vec4 meta = u_meta[i];
      vec2 p = px - shape.xy;
      float activeShape = 1.0 - step(0.45, abs(float(i) - u_activeIndex));
      float hovered = 1.0 - step(0.45, abs(float(i) - u_hoverIndex));
      float motionAllowed = 1.0 - u_reducedMotion;

      float speed = length(u_velocity) / max(u_dpr, 0.001);
      if ((activeShape + hovered) > 0.5 && speed > 0.01 && motionAllowed > 0.5) {
        vec2 axis = normalize(u_velocity + vec2(0.001));
        vec2 tangent = vec2(-axis.y, axis.x);
        vec2 local = vec2(dot(p, axis), dot(p, tangent));
        float stretch = 1.0 + min(0.105, speed * 0.0015) * (0.35 * hovered + 0.85 * activeShape);
        local.x /= stretch;
        local.y *= 1.0 + min(0.055, speed * 0.0008) * (0.25 * hovered + 0.75 * activeShape);
        p = axis * local.x + tangent * local.y;
      }

      float touchDistance = distance(px, u_press) / max(u_dpr, 0.001);
      float localPress = activeShape * u_pressEnergy * motionAllowed * exp(-(touchDistance * touchDistance) / 2700.0);
      float localHover = hovered * u_hoverEnergy * motionAllowed * exp(-(touchDistance * touchDistance) / 8500.0);

      // The silhouette itself flexes toward the finger instead of relying on a
      // generic CSS scale. This keeps the response local and gel-like.
      vec2 fingerDelta = u_press - shape.xy;
      float fingerLength = length(fingerDelta);
      vec2 fingerAxis = fingerLength > (0.5 * u_dpr) ? fingerDelta / fingerLength : vec2(0.0);
      p -= fingerAxis * (5.8 * u_dpr * localPress);
      p -= u_velocity * (0.0022 * activeShape * motionAllowed);
      p *= 1.0 / (1.0 + 0.035 * localPress + 0.010 * localHover);

      // Nearby pieces in the same material flex slightly when one is pressed.
      // This is intentionally much weaker than the active control.
      float centerDistance = distance(shape.xy, u_press) / max(u_dpr, 0.001);
      float neighborPulse = (1.0 - activeShape) * u_pressEnergy * u_merge * motionAllowed
        * exp(-(centerDistance * centerDistance) / 42000.0);
      p *= 1.0 / (1.0 + 0.012 * neighborPulse);

      return sdRoundBox(p, shape.zw, meta.w);
    }

    float glassDistance(vec2 px) {
      float d = 1e6;
      float interaction = clamp(max(u_pressEnergy, u_hoverEnergy * 0.62), 0.0, 1.0);
      // At rest, grouped controls stay clearly separated. Interaction raises
      // the smooth-union radius so nearby pieces naturally neck together.
      float k = (2.5 + 31.0 * u_merge * (0.34 + interaction * 0.92)) * u_dpr;
      for (int i = 0; i < MAX_SHAPES; i++) {
        if (i >= u_shapeCount) break;
        float sd = rawShapeDistance(i, px);
        d = i == 0 ? sd : smin(d, sd, k);
      }
      return d;
    }

    int nearestShape(vec2 px) {
      float best = 1e6;
      int idx = 0;
      for (int i = 0; i < MAX_SHAPES; i++) {
        if (i >= u_shapeCount) break;
        float d = rawShapeDistance(i, px);
        if (d < best) {
          best = d;
          idx = i;
        }
      }
      return idx;
    }

    vec2 glassNormal(vec2 px) {
      float e = 1.20 * u_dpr;
      float dx = glassDistance(px + vec2(e, 0.0)) - glassDistance(px - vec2(e, 0.0));
      float dy = glassDistance(px + vec2(0.0, e)) - glassDistance(px - vec2(0.0, e));
      return normalize(vec2(dx, dy) + 1e-6);
    }

    float selectionDistance(vec2 px) {
      if (u_selectionAmount < 0.001 || u_selection.z < 0.5 || u_selection.w < 0.5) return 1e6;
      vec2 p = px - u_selection.xy;
      float speed = length(u_selectionVelocity) / max(u_dpr, 0.001);
      if (speed > 0.01 && u_reducedMotion < 0.5) {
        vec2 axis = normalize(u_selectionVelocity + vec2(0.001));
        vec2 tangent = vec2(-axis.y, axis.x);
        vec2 local = vec2(dot(p, axis), dot(p, tangent));
        // Normal selectors stay restrained. Theme Studio's mode selector gets
        // the more elastic, shared-container travel seen in Apple's segmented glass.
        float maxStretch = mix(0.22, 0.46, u_selectionFluidity);
        float stretchRate = mix(0.00105, 0.00172, u_selectionFluidity);
        float maxSquash = mix(0.075, 0.115, u_selectionFluidity);
        float squashRate = mix(0.00042, 0.00062, u_selectionFluidity);
        float stretch = 1.0 + min(maxStretch, speed * stretchRate);
        local.x /= stretch;
        local.y *= 1.0 + min(maxSquash, speed * squashRate);
        p = axis * local.x + tangent * local.y;
      }
      float radius = max(0.0, min(min(u_selection.z, u_selection.w), u_selectionRadius));
      return sdRoundBox(p, u_selection.zw, radius);
    }

    float selectionClipMask(vec2 px) {
      if (u_selectionClip.z < 0.5 || u_selectionClip.w < 0.5) {
        // Theme Studio always supplies a real clip when its segmented track is
        // visible. A zero-sized clip means the track has scrolled out of the
        // studio-body viewport, so the lobe must disappear rather than escape.
        return u_selectionFluidity > 0.5 ? 0.0 : 1.0;
      }
      float radius = max(0.0, min(min(u_selectionClip.z, u_selectionClip.w), u_selectionClipRadius));
      float d = sdRoundBox(px - u_selectionClip.xy, u_selectionClip.zw, radius);
      return 1.0 - smoothstep(-0.75 * u_dpr, 1.25 * u_dpr, d);
    }

    vec2 selectionNormal(vec2 px) {
      float e = 1.05 * u_dpr;
      float dx = selectionDistance(px + vec2(e, 0.0)) - selectionDistance(px - vec2(e, 0.0));
      float dy = selectionDistance(px + vec2(0.0, e)) - selectionDistance(px - vec2(0.0, e));
      return normalize(vec2(dx, dy) + 1e-6);
    }

    vec3 scattered(vec2 px, float radius) {
      if (radius < 0.30) return sceneAt(px);
      vec2 x = vec2(radius, 0.0);
      vec2 y = x.yx;
      vec2 d = vec2(radius * 0.70);
      vec3 c = sceneAt(px) * 0.32;
      c += sceneAt(px + x) * 0.11;
      c += sceneAt(px - x) * 0.11;
      c += sceneAt(px + y) * 0.11;
      c += sceneAt(px - y) * 0.11;
      c += sceneAt(px + d) * 0.06;
      c += sceneAt(px - d) * 0.06;
      c += sceneAt(px + vec2(d.x, -d.y)) * 0.06;
      c += sceneAt(px + vec2(-d.x, d.y)) * 0.06;
      return c;
    }

    void main() {
      vec2 px = v_uv * u_resolution;
      vec3 untouched = sceneAt(px);
      float d = glassDistance(px);
      float inside = 1.0 - smoothstep(-0.85 * u_dpr, 0.90 * u_dpr, d);
      float outer = (1.0 - smoothstep(0.0, 34.0 * u_dpr, d)) * (1.0 - inside);
      float rimBand = exp(-abs(d) / (2.55 * u_dpr));

      // Navigation scroll-edge treatment lives outside the material, immediately beneath it.
      if (u_scrollEdge > 0.5 && u_shapeCount > 0) {
        vec4 navShape = u_shapes[0];
        float bottom = navShape.y - navShape.w;
        float band = smoothstep(bottom - 30.0 * u_dpr, bottom - 1.0 * u_dpr, px.y) * (1.0 - step(bottom, px.y));
        if (band > 0.001 && inside < 0.001) {
          float y = luma(untouched);
          vec3 separated = mix(untouched * 0.73, mix(untouched, vec3(0.96), 0.28), smoothstep(0.48, 0.70, y));
          float a = band * u_scrollProgress * 0.68;
          outColor = vec4(separated, a);
          return;
        }
      }

      if (inside < 0.001 && outer < 0.001) {
        discard;
      }

      vec2 n = glassNormal(px);
      int nearest = nearestShape(px);
      vec4 shape = u_shapes[nearest];
      vec4 meta = u_meta[nearest];
      float variant = meta.x;
      float tintEnabled = meta.y;
      float opticalStrength = variant < 0.5 ? clamp(meta.z, 0.65, 1.65) : 1.0;
      float clearDim = variant > 0.5 ? clamp(meta.z, 0.0, 1.4) : 0.72;
      float maxDimCss = max(shape.z, shape.w) * 2.0 / max(u_dpr, 0.001);
      float large = smoothstep(130.0, 420.0, maxDimCss);
      float smallControl = 1.0 - large;
      float thickness = 1.0 + large * 0.52;

      vec3 local = sceneAt(px);
      float localLum = luma(local);
      vec3 s1 = sceneAt(px + vec2(9.0, 0.0) * u_dpr);
      vec3 s2 = sceneAt(px - vec2(9.0, 0.0) * u_dpr);
      vec3 s3 = sceneAt(px + vec2(0.0, 9.0) * u_dpr);
      vec3 s4 = sceneAt(px - vec2(0.0, 9.0) * u_dpr);
      float contrast = (abs(localLum - luma(s1)) + abs(localLum - luma(s2)) + abs(localLum - luma(s3)) + abs(localLum - luma(s4))) * 0.82;

      if (inside < 0.001 && outer > 0.001) {
        // Content-aware shadow: stronger over detail, deeper for larger material.
        float detail = clamp(contrast * 4.6, 0.0, 1.0);
        float sh = exp(-max(d, 0.0) / ((12.0 + 10.0 * large) * u_dpr));
        float elevationBoost = mix(1.0, 1.20, u_navContinuousBody);
        float alpha = sh * outer * mix(0.11, 0.25, detail) * mix(0.92, 1.28, large) * u_materialize * elevationBoost;
        vec3 ambientShadow = mix(vec3(0.015, 0.018, 0.024), sceneAt(px + n * 22.0 * u_dpr) * 0.12, 0.36);
        outColor = vec4(ambientShadow, alpha * u_focus);
        return;
      }

      float depth = smoothstep(0.0, 46.0 * thickness * u_dpr, -d);

      // A very wide, shallow pill has a signed-distance medial axis running
      // horizontally through its center. The SDF normal necessarily flips there
      // from the top boundary to the bottom boundary. The generic material used
      // a ~70 CSS-pixel-deep optical edge on a navigation surface only ~76px
      // tall, so refraction was still strong at that normal discontinuity and
      // exposed it as a straight horizontal seam.
      //
      // For navigation in both themes, confine normal-dependent boundary behavior to
      // the physical perimeter. The center remains one continuous captured
      // environment/material and never crosses the rounded-rectangle medial-axis
      // normal flip. Other material groups retain the existing optical model.
      float navOpticalWindow = 1.0;
      if (u_navContinuousBody > 0.5) {
        float inwardCss = max(-d, 0.0) / max(u_dpr, 0.001);
        // The previous 18px window split this ~76px-tall pill into a visible
        // perimeter zone and a separate flat inner rectangle. The first continuous
        // pass still left a 6.5px straight optical rail. Keep the directional
        // boundary optics much closer to the physical edge so they read as
        // material thickness instead of another horizontal band.
        float navEdgeDepthCss = 4.0;
        navOpticalWindow = 1.0 - smoothstep(1.15, navEdgeDepthCss, inwardCss);
      }

      float edgePower = (1.0 - smoothstep(0.0, 46.0 * thickness * u_dpr, -d)) * navOpticalWindow;
      vec2 radial = normalize(px - shape.xy + vec2(0.001));

      float touchDist = distance(px, u_press) / max(u_dpr, 0.001);
      float activeShape = 1.0 - step(0.45, abs(float(nearest) - u_activeIndex));
      float pressLift = activeShape * u_pressEnergy * (1.0 - u_reducedMotion) * exp(-(touchDist * touchDist) / 3800.0);

      // Lensing is the primary visual signature: strongest at the sculpted
      // optical edge, with restrained center magnification and motion drag.
      float fresnel = pow(clamp(edgePower, 0.0, 1.0), 1.18);
      float opticalEdge = pow(clamp(fresnel, 0.0, 1.0), 0.78);
      float bend = (1.48 + 37.5 * opticalEdge * u_edgeGain) * thickness * opticalStrength * u_dpr * u_materialize * (1.0 + 0.18 * pressLift) * navOpticalWindow;
      float magnify = (0.94 + 0.59 * large) * depth * thickness * opticalStrength * u_dpr * u_materialize * navOpticalWindow;
      vec2 motion = u_velocity * 0.0;
      // Navigation keeps a tiny, continuous whole-body lens warp that never depends
      // on the discontinuous SDF normal. Edge refraction is added only at the
      // physical rim. This keeps the complete header one material in both themes.
      vec2 navBodyDelta = px - shape.xy;
      vec2 navBodyWarp = u_navContinuousBody > 0.5
        ? -navBodyDelta * vec2(0.00135, 0.0042) * opticalStrength * u_materialize
        : vec2(0.0);
      vec2 refractedPx = px + navBodyWarp + n * bend - radial * magnify + motion;

      // Active navigation/tab state is not a CSS capsule. It is a moving optical
      // lobe inside the same material plane, springing between controls and
      // stretching in the direction of travel.
      float selectionD = selectionDistance(px);
      float selectionClip = selectionClipMask(px);
      float selectionMask = (1.0 - smoothstep(-1.2 * u_dpr, 2.2 * u_dpr, selectionD)) * u_selectionAmount * selectionClip;
      float selectionEdge = exp(-abs(selectionD) / (4.2 * u_dpr)) * u_selectionAmount * selectionClip;
      if (selectionMask > 0.001 || selectionEdge > 0.001) {
        vec2 selectionN = selectionNormal(px);
        vec2 selectionRadial = normalize(px - u_selection.xy + vec2(0.001));
        refractedPx += selectionN * (8.0 + 17.0 * selectionEdge) * (1.0 + 0.28 * u_selectionFluidity) * opticalStrength * u_dpr * u_selectionAmount;
        refractedPx -= selectionRadial * (3.2 + 1.25 * u_selectionFluidity) * selectionMask * opticalStrength * u_dpr;
      }

      // Large glass scatters slightly more; Clear remains materially clearer.
      float reducedFrost = mix(1.0, 2.35, u_reducedTransparency);
      float scatterRadius = (0.18 + 0.72 * large + 0.52 * opticalEdge) * mix(1.0, 0.56, variant) * reducedFrost * u_dpr * u_materialize;
      vec3 refracted = scattered(refractedPx, scatterRadius);
      // Keep the optical center readable while allowing the perimeter to behave
      // like a visibly thick lens. This is the key difference from frosted CSS glass.
      float centerOpticalMix = clamp(1.0 - u_centerClarity, 0.12, 0.58);
      // Do not switch the light navbar back to a raw/local center. That old
      // branch was the visible "inner height". The same processed WebGL body
      // now fills the complete pill; only the rim gains extra directional optics.
      float opticalMix = u_navContinuousBody > 0.5
        ? 1.0
        : mix(centerOpticalMix, 1.0, smoothstep(0.08, 0.88, opticalEdge));
      refracted = mix(local, refracted, opticalMix);

      // Wavelength separation concentrates at the lens edge rather than becoming a constant rainbow border.
      // Navigation has no normal-dependent chromatic sampling in its quiet center.
      // This keeps the entire pill continuous instead of allowing a medial-axis
      // normal flip to draw a horizontal band in either theme.
      float chroma = (0.025 + 1.30 * pow(opticalEdge, 1.35) * u_chromaGain) * thickness * opticalStrength * u_dpr * u_materialize * navOpticalWindow;
      vec3 redTap = scattered(refractedPx + n * chroma, scatterRadius * 0.66);
      vec3 blueTap = scattered(refractedPx - n * chroma * 1.16, scatterRadius * 0.66);
      refracted.r = redTap.r;
      refracted.b = blueTap.b;

      // Regular adapts tint + dynamic range to whatever moves beneath it.
      if (variant < 0.5) {
        float brightNeed = 1.0 - smoothstep(0.25, 0.68, localLum);
        float detailNeed = clamp(contrast * 4.2, 0.0, 1.0);
        float adapt = (0.045 + 0.082 * brightNeed + 0.058 * detailNeed) * u_materialize;
        vec3 neutral = mix(vec3(0.965, 0.955, 0.935), vec3(0.10, 0.12, 0.15), 1.0 - smoothstep(0.28, 0.72, localLum));
        // The long navigation shell should transmit the environment rather than
        // reading as a warm beige capsule on light backgrounds. Keep its adaptive
        // neutral response colorless while preserving the same WebGL body.
        neutral = mix(neutral, vec3(0.975), u_navContinuousBody);
        adapt *= mix(1.0, 0.54, u_navContinuousBody);
        refracted = mix(refracted, neutral, adapt);
        float rangeCompression = 0.065 + 0.045 * large;
        refracted = (refracted - 0.5) * (1.0 - rangeCompression) + 0.5;
      } else {
        // Clear intentionally relies on localized dimming rather than Regular's adaptive tinting.
        refracted *= 1.0 - (0.10 + 0.20 * clearDim + 0.11 * u_reducedTransparency) * u_materialize;
      }

      // Selective functional tint: only marked primary actions receive it.
      if (tintEnabled > 0.5) {
        float accentLum = luma(u_accent);
        float tone = mix(0.70, 1.18, localLum);
        vec3 mappedAccent = clamp(u_accent * tone + vec3(0.02 * (1.0 - accentLum)), 0.0, 1.0);
        refracted = mix(refracted, mappedAccent, (0.20 + 0.06 * edgePower) * u_materialize);
      }

      // Small controls need enough material separation to remain legible on very
      // quiet light/dark backgrounds. This is optical body response, not a CSS fill.
      float lightSmallBody = smoothstep(0.70, 0.95, localLum) * smallControl;
      float darkSmallBody = (1.0 - smoothstep(0.08, 0.34, localLum)) * smallControl;
      refracted *= 1.0 - 0.045 * lightSmallBody;
      refracted += vec3(0.024) * darkSmallBody;

      // Ambient content color bleeds back into the surface near its edge.
      vec3 spill = sceneAt(px + n * (18.0 + 28.0 * fresnel) * opticalStrength * u_dpr);
      float lightScene = smoothstep(0.66, 0.92, localLum);
      float spillWeight = (0.040 + 0.035 * large) * fresnel * opticalStrength * u_focus * u_materialize * mix(1.0, 0.52, lightScene);
      refracted = mix(refracted, spill, spillWeight);

      if (u_selectionAmount > 0.001) {
        float selectionD2 = selectionDistance(px);
        float selectionClip2 = selectionClipMask(px);
        float selectionMask2 = (1.0 - smoothstep(-1.0 * u_dpr, 2.4 * u_dpr, selectionD2)) * u_selectionAmount * selectionClip2;
        float selectionEdge2 = exp(-abs(selectionD2) / (4.6 * u_dpr)) * u_selectionAmount * selectionClip2;
        vec3 selectionEnv = sceneAt(px + selectionNormal(px) * 20.0 * u_dpr);
        refracted = mix(refracted, selectionEnv, selectionMask2 * 0.040);
        vec3 themeGold = vec3(176.0 / 255.0, 141.0 / 255.0, 87.0 / 255.0);
        vec3 selectionTint = mix(u_accent, themeGold, step(0.5, u_selectionFluidity));
        float selectionAccent = mix(0.060, 0.62, u_selectionFluidity);
        refracted = mix(refracted, selectionTint, selectionMask2 * selectionAccent);
        refracted += mix(vec3(1.0), selectionEnv, 0.18) * selectionEdge2 * 0.070 * u_focus;
      }

      // A subtle reflected environment component helps the material read even
      // over quiet dark regions without inventing a decorative border.
      vec2 tangent = vec2(-n.y, n.x);
      vec3 reflectA = sceneAt(px + tangent * (18.0 + 16.0 * large) * u_dpr);
      vec3 reflectB = sceneAt(px - tangent * (18.0 + 16.0 * large) * u_dpr);

      // Geometry-aware specular highlight follows the smoothed pointer/device light.
      vec2 lightDir = normalize(u_light - px + vec2(0.001));
      float sideMix = 0.5 + 0.5 * dot(tangent, lightDir);
      vec3 reflected = mix(reflectB, reflectA, sideMix);
      float reflectionAmount = (0.018 + 0.104 * opticalEdge + 0.012 * large + 0.042 * smallControl) * u_reflectionGain * opticalStrength * u_focus * u_materialize * navOpticalWindow;
      refracted = mix(refracted, reflected, reflectionAmount);

      float facing = max(dot(n, lightDir), 0.0);
      float spec = pow(facing, 2.35);
      float darkBackdropBoost = mix(1.28, 0.88, smoothstep(0.18, 0.72, localLum));
      float navRimBoost = mix(1.0, 1.14, u_navContinuousBody);
      float highlight = rimBand * (0.19 + 1.64 * spec + 0.24 * smallControl) * u_reflectionGain * opticalStrength * u_materialize * u_focus * darkBackdropBoost * navRimBoost;
      vec3 highlightColor = mix(vec3(1.0), spill, 0.15);
      refracted += highlightColor * highlight * (0.50 + 0.19 * u_increasedContrast);
      float opposite = rimBand * pow(max(dot(-n, lightDir), 0.0), 3.0) * mix(0.085, 0.14, darkBackdropBoost - 0.88);
      // On the long navigation pill, subtractive opposite-side shading reads as a
      // straight inner rail. Preserve it everywhere else; navigation gets depth
      // from the outer shadow, bright rim and environment reflection instead.
      opposite *= mix(1.0, 0.10, u_navContinuousBody);
      refracted -= opposite;

      // A second, displaced inner highlight describes the lens thickness. It
      // bends with the signed-distance geometry instead of drawing a border.
      // Internal thickness bands work well on compact controls and deeper panels,
      // but on the extremely wide navigation pill they become long, straight
      // horizontal stripes. Keep the real outer WebGL lens/refraction above while
      // removing these displaced inner bands from navigation in both themes.
      float navInternalThickness = 1.0 - u_navContinuousBody;
      float innerLens = exp(-abs(d + (7.2 + 4.1 * large) * u_dpr) / (4.8 * u_dpr));
      float caustic = innerLens * (0.24 + 0.76 * pow(facing, 2.10)) * opticalEdge * navInternalThickness;
      refracted += mix(vec3(1.0), spill, 0.22) * caustic * (0.19 + 0.075 * smallControl) * u_reflectionGain * opticalStrength * u_materialize * u_focus;

      float innerShade = exp(-abs(d + (17.0 + 7.0 * large) * u_dpr) / (8.0 * u_dpr));
      refracted -= vec3(0.032) * innerShade * opticalEdge * (0.70 + 0.30 * large) * u_materialize * navInternalThickness;

      // Touch interaction illuminates from within and sends a damped energy wave
      // through nearby glass. The color comes from the environment/tint rather
      // than a fixed blue glow.
      if (u_pressEnergy > 0.001 && u_reducedMotion < 0.95) {
        float distTouch = distance(px, u_press) / max(u_dpr, 0.001);
        float wave = exp(-distTouch / 126.0) * (0.76 + 0.24 * sin(distTouch * 0.048 - u_time * 8.3));
        vec3 energyColor = mix(vec3(1.0), spill, 0.22);
        if (tintEnabled > 0.5) energyColor = mix(energyColor, u_accent, 0.24);
        refracted += energyColor * wave * u_pressEnergy * 0.095;
      }

      if (u_increasedContrast > 0.5) {
        float y = luma(refracted);
        refracted = mix(refracted, vec3(y > 0.50 ? 0.965 : 0.055), 0.10);
      }

      // Losing focus makes the material recede instead of competing with the active surface.
      refracted = mix(local, refracted, mix(0.58, 0.94, u_focus));

      // Navigation is one continuous WebGL body from top edge to bottom edge in both
      // themes. There is no separate inner-height sampling branch. The full body
      // uses the same processed environment; only the narrow physical perimeter
      // receives additional normal-dependent lensing.

      // The optical rim is directional and environmental, not a decorative CSS stroke.
      float lightEdgeShade = smoothstep(0.62, 0.92, localLum) * rimBand * (0.025 + 0.035 * smallControl) * u_materialize;
      // The remaining top/bottom line after the continuous-body fix came from
      // this subtractive rim shade. Remove that rail from navigation only; the
      // WebGL perimeter still has refraction, highlight, reflection and shadow.
      lightEdgeShade *= (1.0 - u_navContinuousBody);
      refracted -= vec3(lightEdgeShade);
      float edgeAlpha = rimBand * (0.050 + 0.030 * smallControl + 0.065 * u_increasedContrast) * u_materialize;
      edgeAlpha *= mix(1.0, 0.42, u_navContinuousBody);
      float surfaceAlpha = mix(0.90, 0.82, variant);
      surfaceAlpha = mix(surfaceAlpha, 0.975, u_reducedTransparency);
      surfaceAlpha = clamp(surfaceAlpha + edgeAlpha, 0.0, 0.99);
      outColor = vec4(clamp(refracted, 0.0, 1.0), surfaceAlpha);
    }
  `;

  function createProgram(gl) {
    function compile(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader) || 'Unknown shader compile error';
        gl.deleteShader(shader);
        throw new Error(message);
      }
      return shader;
    }

    const program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexShader));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentShader));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(program) || 'Unknown WebGL link error');
    }
    return program;
  }

  const SHARED_UNIFORM_NAMES = [
    'u_scene', 'u_resolution', 'u_dpr', 'u_time', 'u_shapeCount', 'u_shapes[0]', 'u_meta[0]',
    'u_activeIndex', 'u_hoverIndex', 'u_press', 'u_velocity', 'u_light', 'u_accent',
    'u_pressEnergy', 'u_hoverEnergy', 'u_materialize', 'u_focus', 'u_merge',
    'u_scrollEdge', 'u_scrollProgress', 'u_reducedMotion', 'u_reducedTransparency', 'u_increasedContrast',
    'u_selection', 'u_selectionVelocity', 'u_selectionAmount', 'u_selectionRadius', 'u_selectionFluidity',
    'u_selectionClip', 'u_selectionClipRadius', 'u_edgeGain', 'u_centerClarity', 'u_chromaGain', 'u_reflectionGain',
    'u_backgroundColor', 'u_navContinuousBody'
  ];

  class SharedWebGLRenderer {
    constructor() {
      this.canvas = document.createElement('canvas');
      this.canvas.width = 1;
      this.canvas.height = 1;
      this.canvas.setAttribute('aria-hidden', 'true');
      this.gl = this.canvas.getContext('webgl2', {
        alpha: true,
        antialias: false,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
      });
      if (!this.gl) throw new Error('WebGL2 unavailable for shared Liquid Glass renderer');

      this.program = createProgram(this.gl);
      this.gl.useProgram(this.program);
      this.locations = {};
      for (const name of SHARED_UNIFORM_NAMES) {
        this.locations[name] = this.gl.getUniformLocation(this.program, name);
      }

      this.buffer = this.gl.createBuffer();
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
      this.gl.bufferData(
        this.gl.ARRAY_BUFFER,
        new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]),
        this.gl.STATIC_DRAW,
      );
      this.position = this.gl.getAttribLocation(this.program, 'a_position');
      this.gl.enableVertexAttribArray(this.position);
      this.gl.vertexAttribPointer(this.position, 2, this.gl.FLOAT, false, 0, 0);

      this.contextLost = false;
      this.canvas.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        this.contextLost = true;
        root.dataset.liquidWebglVerified = 'false';
      });
      this.canvas.addEventListener('webglcontextrestored', () => {
        // A spontaneous restore is rare. Reloading is safer than trying to
        // rebuild every texture/program behind live DOM controls mid-session.
        this.contextLost = false;
        root.dataset.liquidWebglVerified = 'false';
      });
    }

    ensureCapacity(width, height) {
      const requiredWidth = Math.max(1, Math.ceil(width));
      const requiredHeight = Math.max(1, Math.ceil(height));
      if (requiredWidth <= this.canvas.width && requiredHeight <= this.canvas.height) return;

      // Grow only, and only when a larger material surface actually appears.
      // This avoids the old per-group WebGL contexts without repeatedly
      // reallocating the shared drawing buffer during normal animation.
      this.canvas.width = Math.max(this.canvas.width, requiredWidth);
      this.canvas.height = Math.max(this.canvas.height, requiredHeight);
    }

    begin(width, height) {
      this.ensureCapacity(width, height);
      const gl = this.gl;
      const topViewportY = this.canvas.height - height;
      gl.useProgram(this.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.enableVertexAttribArray(this.position);
      gl.vertexAttribPointer(this.position, 2, gl.FLOAT, false, 0, 0);
      gl.enable(gl.SCISSOR_TEST);
      gl.viewport(0, topViewportY, width, height);
      gl.scissor(0, topViewportY, width, height);
      return { sourceX: 0, sourceY: 0, width, height };
    }
  }

  let sharedWebGLRenderer = null;
  function getSharedWebGLRenderer() {
    if (!sharedWebGLRenderer) sharedWebGLRenderer = new SharedWebGLRenderer();
    return sharedWebGLRenderer;
  }

  class LiquidGroup {
    constructor(name, members, host) {
      this.name = name;
      this.members = members.slice(0, MAX_SHAPES);
      this.host = host;

      // The WebGL geometry is calculated relative to `host`. Make that same
      // element the canvas containing block. Previously some grouped hosts
      // (notably services-grid/contact-list) were position:static, so the
      // absolute canvas was painted relative to a different ancestor and the
      // optical lens appeared beside the DOM icon.
      if (getComputedStyle(this.host).position === 'static') {
        this.host.style.position = 'relative';
        this.host.dataset.liquidPositionAnchor = '1';
      }
      this.host.dataset.liquidRenderHost = '1';

      this.pad = ['portrait-status', 'service-icons', 'contact-arrows', 'footer-icon'].includes(name) ? 0 : (name === 'theme-studio' ? 38 : 30);
      this.preset = GROUP_PRESETS[name] || {};
      this.canMerge = this.members.length > 1 && !this.members.some((m) => m.dataset.liquidMerge === '0');
      this.mergeBase = this.canMerge ? (name === 'hero-glass' || name === 'contact-glass' ? 0.18 : 0.10) : 0;
      this.merge = this.mergeBase;
      this.scrollEdge = 0;
      this.isFixed = ['navigation', 'theme-studio', 'mobile-navigation'].includes(name);
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'liquid-surface-canvas';
      this.canvas.setAttribute('aria-hidden', 'true');
      this.canvas.dataset.liquidRenderer = name;
      this.host.insertBefore(this.canvas, this.host.firstChild);

      this.sharedPresentation = SHARED_CONTEXT_MODE;
      this.displayCtx = null;
      this.renderer = null;
      this.quadBuffer = null;

      if (this.sharedPresentation) {
        // Android Chromium: every visible material keeps its own DOM canvas and
        // texture, but all GPU work runs through one shared WebGL2 context. The
        // result is copied 1:1 into the group's canvas immediately after draw.
        this.displayCtx = this.canvas.getContext('2d', { alpha: true });
        if (!this.displayCtx) throw new Error('2D presentation canvas unavailable for Liquid Glass group');
        this.renderer = getSharedWebGLRenderer();
        this.gl = this.renderer.gl;
        this.program = this.renderer.program;
        this.locations = this.renderer.locations;
      } else {
        // Existing renderer path: unchanged for iPhone/iPad, Firefox Android,
        // and desktop browsers so approved visuals/compositing remain identical.
        this.gl = this.canvas.getContext('webgl2', {
          alpha: true,
          antialias: false,
          premultipliedAlpha: false,
          preserveDrawingBuffer: false,
        });
        if (!this.gl) throw new Error('WebGL2 unavailable for Liquid Glass group');
        this.program = createProgram(this.gl);
        this.gl.useProgram(this.program);
        this.locations = {};
        for (const uniformName of SHARED_UNIFORM_NAMES) {
          this.locations[uniformName] = this.gl.getUniformLocation(this.program, uniformName);
        }
        this.quadBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
        this.gl.bufferData(
          this.gl.ARRAY_BUFFER,
          new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]),
          this.gl.STATIC_DRAW,
        );
        const position = this.gl.getAttribLocation(this.program, 'a_position');
        this.gl.enableVertexAttribArray(position);
        this.gl.vertexAttribPointer(position, 2, this.gl.FLOAT, false, 0, 0);
      }
      this.setupTexture();
      this.cropCanvas = document.createElement('canvas');
      this.cropCtx = this.cropCanvas.getContext('2d', { alpha: false });
      this.filterCanvas = document.createElement('canvas');
      this.filterCtx = this.filterCanvas.getContext('2d', { alpha: false });
      this.cssWidth = 1;
      this.cssHeight = 1;
      this.dpr = 1;
      this.lastLayoutKey = '';
      this.lastCropKey = '';
      this.activeIndex = -1;
      this.visualActiveIndex = -1;
      this.hoverIndex = -1;
      this.press = { x: 0, y: 0, energy: 0, target: 0, springVelocity: 0 };
      this.hoverEnergy = 0;
      this.hoverSpringVelocity = 0;
      this.velocity = { x: 0, y: 0 };
      this.materialize = reduceMotionQuery.matches ? 1 : 0;
      this.materializeSpringVelocity = 0;
      this.mergeSpringVelocity = 0;
      this.selection = {
        x: 0, y: 0, w: 0, h: 0,
        targetX: 0, targetY: 0, targetW: 0, targetH: 0,
        vx: 0, vy: 0, vw: 0, vh: 0,
        r: 0, targetR: 0, vr: 0,
        amount: 0, targetAmount: 0, amountVelocity: 0,
        clipX: 0, clipY: 0, clipW: 0, clipH: 0, clipR: 0,
        initialized: false,
      };
      this.lastPointer = { x: 0, y: 0, t: performance.now() };
      this.visibleLastFrame = false;
      this.bindInteractions();
      this.resize(true);
    }

    setupTexture() {
      const gl = this.gl;
      gl.useProgram(this.program);
      this.texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(this.locations.u_scene, 0);
    }

    destroy() {
      if (this.sharedPresentation) {
        // Never lose the shared context when a responsive group disappears.
        try { if (this.texture) this.gl.deleteTexture(this.texture); } catch (_) {}
      } else {
        // Preserve the original direct-context lifecycle on browsers that use it.
        try { this.gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch (_) {}
      }
      this.canvas.remove();
      this.members.forEach((member) => { delete member.dataset.liquidRendered; });
    }

    isVisible() {
      const style = getComputedStyle(this.host);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.015) return false;
      const rect = this.host.getBoundingClientRect();
      return rect.bottom > -80 && rect.top < innerHeight + 80 && rect.right > -80 && rect.left < innerWidth + 80;
    }

    resize(force = false) {
      const hostWidth = Math.max(1, this.host.clientWidth || this.host.getBoundingClientRect().width);
      const hostHeight = Math.max(1, this.host.clientHeight || this.host.getBoundingClientRect().height);
      const cssWidth = Math.ceil(hostWidth + this.pad * 2);
      const cssHeight = Math.ceil(hostHeight + this.pad * 2);
      const dpr = Math.min(devicePixelRatio || 1, DPR_CAP);
      const key = `${cssWidth}|${cssHeight}|${dpr}`;
      if (!force && key === this.lastLayoutKey) return false;
      this.lastLayoutKey = key;
      this.cssWidth = cssWidth;
      this.cssHeight = cssHeight;
      this.dpr = dpr;
      this.canvas.style.position = 'absolute';
      this.canvas.style.right = 'auto';
      this.canvas.style.bottom = 'auto';
      this.canvas.style.left = `${-this.pad}px`;
      this.canvas.style.top = `${-this.pad}px`;
      this.canvas.style.width = `${cssWidth}px`;
      this.canvas.style.height = `${cssHeight}px`;
      this.canvas.width = Math.max(1, Math.round(cssWidth * dpr));
      this.canvas.height = Math.max(1, Math.round(cssHeight * dpr));
      this.cropCanvas.width = this.canvas.width;
      this.cropCanvas.height = this.canvas.height;
      this.filterCanvas.width = this.canvas.width;
      this.filterCanvas.height = this.canvas.height;
      if (!this.sharedPresentation) this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      this.lastCropKey = '';
      return true;
    }

    getGeometry() {
      const hostRect = this.host.getBoundingClientRect();
      const hostWidth = Math.max(1, this.host.clientWidth || hostRect.width);
      const hostHeight = Math.max(1, this.host.clientHeight || hostRect.height);
      const scaleX = hostRect.width / hostWidth || 1;
      const scaleY = hostRect.height / hostHeight || 1;
      const shapes = new Float32Array(MAX_SHAPES * 4);
      const meta = new Float32Array(MAX_SHAPES * 4);

      this.members.forEach((el, i) => {
        const rect = el.getBoundingClientRect();
        const localLeft = (rect.left - hostRect.left) / scaleX + this.pad;
        const localTop = (rect.top - hostRect.top) / scaleY + this.pad;
        const localWidth = rect.width / scaleX;
        const localHeight = rect.height / scaleY;
        const centerX = (localLeft + localWidth * 0.5) * this.dpr;
        const centerY = (this.cssHeight - (localTop + localHeight * 0.5)) * this.dpr;
        shapes.set([centerX, centerY, localWidth * 0.5 * this.dpr, localHeight * 0.5 * this.dpr], i * 4);

        const style = getComputedStyle(el);
        const radius = Math.max(parsePx(style.borderTopLeftRadius, localHeight * 0.25), 2);
        const variant = el.dataset.liquidVariant === 'clear' ? 1 : 0;
        const tint = Number(el.dataset.liquidTint || 0) > 0 ? 1 : 0;
        const strengthMultiplier = Number(this.preset.strength || 1);
        const opticalControl = variant
          ? clamp(Number(el.dataset.liquidClearDim || 0.72) * strengthMultiplier, 0, 1.4)
          : clamp(Number(el.dataset.liquidStrength || 1) * strengthMultiplier, 0.58, 1.34);
        meta.set([variant, tint, opticalControl, radius * this.dpr], i * 4);
      });

      return { shapes, meta, hostRect, scaleX, scaleY };
    }

    updateCropIfNeeded() {
      if (!sceneCanvas || !sceneCtx || !this.isVisible()) return false;
      this.resize();
      const hostRect = this.host.getBoundingClientRect();
      const hostWidth = Math.max(1, this.host.clientWidth || hostRect.width);
      const hostHeight = Math.max(1, this.host.clientHeight || hostRect.height);
      const scaleX = hostRect.width / hostWidth || 1;
      const scaleY = hostRect.height / hostHeight || 1;
      const visualPadX = this.pad * scaleX;
      const visualPadY = this.pad * scaleY;
      const docX = window.scrollX + hostRect.left - visualPadX;
      const docY = window.scrollY + hostRect.top - visualPadY;
      const sourceW = hostRect.width + visualPadX * 2;
      const sourceH = hostRect.height + visualPadY * 2;
      const key = [sceneVersion, Math.round(docX * 2) / 2, Math.round(docY * 2) / 2, Math.round(sourceW * 2) / 2, Math.round(sourceH * 2) / 2, this.canvas.width, this.canvas.height].join('|');
      if (key === this.lastCropKey) return false;
      this.lastCropKey = key;

      const ctx = this.cropCtx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = currentBackground();
      ctx.fillRect(0, 0, this.cropCanvas.width, this.cropCanvas.height);

      const ratioX = sceneCanvas.width / Math.max(1, documentWidth);
      const ratioY = sceneCanvas.height / Math.max(1, documentHeight);
      let sx = docX * ratioX;
      let sy = docY * ratioY;
      let sw = sourceW * ratioX;
      let sh = sourceH * ratioY;

      const srcLeft = Math.max(0, sx);
      const srcTop = Math.max(0, sy);
      const srcRight = Math.min(sceneCanvas.width, sx + sw);
      const srcBottom = Math.min(sceneCanvas.height, sy + sh);
      if (srcRight > srcLeft && srcBottom > srcTop) {
        const dx = ((srcLeft - sx) / sw) * this.cropCanvas.width;
        const dy = ((srcTop - sy) / sh) * this.cropCanvas.height;
        const dw = ((srcRight - srcLeft) / sw) * this.cropCanvas.width;
        const dh = ((srcBottom - srcTop) / sh) * this.cropCanvas.height;
        ctx.drawImage(sceneCanvas, srcLeft, srcTop, srcRight - srcLeft, srcBottom - srcTop, dx, dy, dw, dh);
      }

      const [br, bg, bb] = currentBackgroundRgb();
      const bodyLum = (0.2126 * br + 0.7152 * bg + 0.0722 * bb) / 255;
      const lightTheme = bodyLum > 0.62;
      const largeControl = this.name === 'theme-studio' || this.name === 'mobile-navigation' || this.name === 'fit-selector' || this.name === 'navigation';

      // Do not collapse the light navigation capture to a one-pixel-tall
      // scanline. That workaround created a visually separate inner strip. The
      // normal captured environment is kept across the full navigation height;
      // the shader itself confines directional optics to the perimeter.

      if ((this.preset.blur || 0) > 0.1) {
        const fctx = this.filterCtx;
        fctx.setTransform(1, 0, 0, 1, 0, 0);
        fctx.clearRect(0, 0, this.filterCanvas.width, this.filterCanvas.height);
        const blurPx = ((this.preset.blur || 0) + (lightTheme && largeControl ? 0.9 : 0)) * this.dpr;
        const saturate = (this.preset.saturate || 1) * (lightTheme && largeControl ? 0.97 : 1);
        const brightness = (this.preset.brightness || 1) * (lightTheme ? 0.985 : 1);
        fctx.filter = `blur(${blurPx}px) saturate(${saturate}) brightness(${brightness})`;
        fctx.drawImage(this.cropCanvas, 0, 0);
        fctx.filter = 'none';
        ctx.clearRect(0, 0, this.cropCanvas.width, this.cropCanvas.height);
        ctx.drawImage(this.filterCanvas, 0, 0);
      }

      const dynamicDim = (this.preset.dim || 0) + (lightTheme ? (this.name === 'theme-studio' ? 0.10 : this.name === 'mobile-navigation' ? 0.10 : this.name === 'fit-selector' ? 0.10 : this.name === 'navigation' ? 0.04 : this.name === 'execution-desktop' ? 0.12 : this.name === 'execution-mobile' ? 0.12 : this.name === 'hero-glass' || this.name === 'contact-glass' ? 0.06 : this.name === 'service-icons' || this.name === 'contact-arrows' ? 0.06 : 0.00) : 0);
      if (dynamicDim > 0.001) {
        ctx.fillStyle = `rgba(${br}, ${bg}, ${bb}, ${dynamicDim})`;
        ctx.fillRect(0, 0, this.cropCanvas.width, this.cropCanvas.height);
      }

      const gl = this.gl;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.cropCanvas);
      return true;
    }

    resetMaterialization() {
      this.materialize = reduceMotionQuery.matches ? 1 : 0;
      this.materializeSpringVelocity = 0;
    }

    bindInteractions() {
      this.members.forEach((el, index) => {
        el.addEventListener('pointerdown', (event) => {
          this.activeIndex = index;
          this.visualActiveIndex = index;
          this.hoverIndex = -1;
          const isHeaderControl = this.name === 'header-icons' || this.name === 'header-mobile-icon';
          this.press.target = isHeaderControl ? 1.08 : 1;
          this.velocity.x = 0;
          this.velocity.y = 0;
          // Header controls use a centered gel expansion: they move outward
          // from their own bounds and spring back, rather than translating up/down.
          this.setPressCenter(index);
        });
        const release = () => {
          this.press.target = 0;
          this.activeIndex = -1;
          this.hoverIndex = -1;
          this.velocity.x = 0;
          this.velocity.y = 0;
        };
        el.addEventListener('pointerup', release);
        el.addEventListener('pointercancel', release);
      });
    }

    setPressPoint(index, event) {
      const el = this.members[index];
      if (!el || !event) return this.setPressCenter(index);
      const hostRect = this.host.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const hostWidth = Math.max(1, this.host.clientWidth || hostRect.width);
      const hostHeight = Math.max(1, this.host.clientHeight || hostRect.height);
      const scaleX = hostRect.width / hostWidth || 1;
      const scaleY = hostRect.height / hostHeight || 1;
      // Contact is captured only on pointerdown. There is deliberately no
      // pointermove steering of the material or its light source.
      const inset = Math.min(8, Math.max(3, Math.min(elRect.width, elRect.height) * 0.12));
      const contactX = clamp(event.clientX, elRect.left + inset, elRect.right - inset);
      const contactY = clamp(event.clientY, elRect.top + inset, elRect.bottom - inset);
      const localX = (contactX - hostRect.left) / scaleX + this.pad;
      const localYTop = (contactY - hostRect.top) / scaleY + this.pad;
      this.press.x = localX;
      this.press.y = this.cssHeight - localYTop;
    }

    setPressCenter(index) {
      const el = this.members[index];
      if (!el) return;
      const hostRect = this.host.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const hostWidth = Math.max(1, this.host.clientWidth || hostRect.width);
      const hostHeight = Math.max(1, this.host.clientHeight || hostRect.height);
      const scaleX = hostRect.width / hostWidth || 1;
      const scaleY = hostRect.height / hostHeight || 1;
      const localX = ((elRect.left + elRect.width * 0.5) - hostRect.left) / scaleX + this.pad;
      const localYTop = ((elRect.top + elRect.height * 0.5) - hostRect.top) / scaleY + this.pad;
      this.press.x = localX;
      this.press.y = this.cssHeight - localYTop;
    }

    updateSelectionTarget() {
      let selected = null;
      if (this.name === 'navigation') {
        selected = this.host.querySelector('.nav-links a.active, .nav-links a[aria-current="true"]');
      } else if (this.name === 'fit-selector') {
        selected = this.host.querySelector('.fit-tab.active');
      } else if (this.name === 'theme-studio') {
        selected = this.host.querySelector('.segmented .segment.active');
      }

      if (this.name === 'navigation') {
        this.selection.targetAmount = 0;
        return;
      }

      if (!selected || getComputedStyle(selected).display === 'none') {
        this.selection.targetAmount = 0;
        return;
      }

      const hostRect = this.host.getBoundingClientRect();
      const hostWidth = Math.max(1, this.host.clientWidth || hostRect.width);
      const hostHeight = Math.max(1, this.host.clientHeight || hostRect.height);
      const scaleX = hostRect.width / hostWidth || 1;
      const scaleY = hostRect.height / hostHeight || 1;
      const rect = selected.getBoundingClientRect();
      const localLeft = (rect.left - hostRect.left) / scaleX + this.pad;
      const localTop = (rect.top - hostRect.top) / scaleY + this.pad;
      const localWidth = rect.width / scaleX;
      const localHeight = rect.height / scaleY;

      // Theme Studio's active lobe lives on the panel's WebGL canvas, not inside
      // the scrolling `.segmented` DOM node. CSS overflow therefore cannot clip
      // the shader. Explicitly intersect the segmented track with the scrollable
      // studio body and pass that rectangle to the shader so the gold lobe can
      // never paint over the sticky header while the panel is scrolled.
      if (this.name === 'theme-studio') {
        const track = this.host.querySelector('.segmented');
        const viewport = this.host.querySelector('.studio-body');
        if (track && viewport) {
          const trackRect = track.getBoundingClientRect();
          const viewportRect = viewport.getBoundingClientRect();
          const left = Math.max(trackRect.left, viewportRect.left, hostRect.left);
          const right = Math.min(trackRect.right, viewportRect.right, hostRect.right);
          const top = Math.max(trackRect.top, viewportRect.top, hostRect.top);
          const bottom = Math.min(trackRect.bottom, viewportRect.bottom, hostRect.bottom);
          if (right > left && bottom > top) {
            const clipLeft = (left - hostRect.left) / scaleX + this.pad;
            const clipTop = (top - hostRect.top) / scaleY + this.pad;
            const clipWidth = (right - left) / scaleX;
            const clipHeight = (bottom - top) / scaleY;
            this.selection.clipX = clipLeft + clipWidth * 0.5;
            this.selection.clipY = this.cssHeight - (clipTop + clipHeight * 0.5);
            this.selection.clipW = clipWidth * 0.5;
            this.selection.clipH = clipHeight * 0.5;
            const trackRadius = parseFloat(getComputedStyle(track).borderTopLeftRadius) || Math.min(trackRect.width, trackRect.height) * 0.25;
            const clipped = Math.abs(left - trackRect.left) > 0.5 || Math.abs(right - trackRect.right) > 0.5 || Math.abs(top - trackRect.top) > 0.5 || Math.abs(bottom - trackRect.bottom) > 0.5;
            this.selection.clipR = clipped ? 0 : Math.min(trackRadius, clipWidth * 0.5, clipHeight * 0.5);
          } else {
            this.selection.clipX = this.selection.clipY = 0;
            this.selection.clipW = this.selection.clipH = this.selection.clipR = 0;
          }
        }
      } else {
        this.selection.clipX = this.selection.clipY = 0;
        this.selection.clipW = this.selection.clipH = this.selection.clipR = 0;
      }

      this.selection.targetX = localLeft + localWidth * 0.5;
      this.selection.targetY = this.cssHeight - (localTop + localHeight * 0.5);
      this.selection.targetW = localWidth * 0.5;
      this.selection.targetH = localHeight * 0.5;
      const computedRadius = parseFloat(getComputedStyle(selected).borderTopLeftRadius) || Math.min(localWidth, localHeight) * 0.24;
      this.selection.targetR = Math.min(Math.min(localWidth * 0.5, localHeight * 0.5), computedRadius);
      this.selection.targetAmount = 1;

      if (!this.selection.initialized) {
        this.selection.x = this.selection.targetX;
        this.selection.y = this.selection.targetY;
        this.selection.w = this.selection.targetW;
        this.selection.h = this.selection.targetH;
        this.selection.r = this.selection.targetR;
        this.selection.initialized = true;
      }
    }

    springStep(value, velocity, target, stiffness, damping, dt) {
      const acceleration = (target - value) * stiffness - velocity * damping;
      velocity += acceleration * dt;
      value += velocity * dt;
      return [value, velocity];
    }

    updateDynamics(dt) {
      const reduced = reduceMotionQuery.matches;
      this.updateSelectionTarget();

      if (reduced) {
        this.press.energy = this.press.target;
        this.press.springVelocity = 0;
        this.hoverEnergy = this.hoverIndex >= 0 ? 1 : 0;
        this.hoverSpringVelocity = 0;
        this.materialize = 1;
        this.materializeSpringVelocity = 0;
        this.merge = this.canMerge ? this.mergeBase : 0;
        this.mergeSpringVelocity = 0;
        this.selection.x = this.selection.targetX;
        this.selection.y = this.selection.targetY;
        this.selection.w = this.selection.targetW;
        this.selection.h = this.selection.targetH;
        this.selection.r = this.selection.targetR;
        this.selection.amount = this.selection.targetAmount;
        this.selection.vx = this.selection.vy = this.selection.vw = this.selection.vh = this.selection.vr = 0;
        this.selection.amountVelocity = 0;
      } else {
        [this.press.energy, this.press.springVelocity] = this.springStep(
          this.press.energy, this.press.springVelocity, this.press.target, 360, 31, dt
        );
        [this.hoverEnergy, this.hoverSpringVelocity] = this.springStep(
          this.hoverEnergy, this.hoverSpringVelocity, this.hoverIndex >= 0 ? 1 : 0, 235, 28, dt
        );
        [this.materialize, this.materializeSpringVelocity] = this.springStep(
          this.materialize, this.materializeSpringVelocity, 1, 150, 24, dt
        );

        const mergeTarget = this.canMerge
          ? clamp(this.mergeBase + clamp(this.hoverEnergy, 0, 1.08) * 0.38 + clamp(this.press.energy, 0, 1.10) * 0.52, this.mergeBase, 0.98)
          : 0;
        [this.merge, this.mergeSpringVelocity] = this.springStep(
          this.merge, this.mergeSpringVelocity, mergeTarget, 250, 27, dt
        );

        if (this.selection.initialized) {
          const themeModeSelection = this.name === 'theme-studio';
          const posK = themeModeSelection ? 390 : 330;
          const posD = themeModeSelection ? 25 : 30;
          const sizeK = themeModeSelection ? 330 : 285;
          const sizeD = themeModeSelection ? 25 : 28;
          const radiusK = themeModeSelection ? 340 : 300;
          const radiusD = themeModeSelection ? 27 : 30;
          [this.selection.x, this.selection.vx] = this.springStep(this.selection.x, this.selection.vx, this.selection.targetX, posK, posD, dt);
          [this.selection.y, this.selection.vy] = this.springStep(this.selection.y, this.selection.vy, this.selection.targetY, posK, posD, dt);
          [this.selection.w, this.selection.vw] = this.springStep(this.selection.w, this.selection.vw, this.selection.targetW, sizeK, sizeD, dt);
          [this.selection.h, this.selection.vh] = this.springStep(this.selection.h, this.selection.vh, this.selection.targetH, sizeK, sizeD, dt);
          [this.selection.r, this.selection.vr] = this.springStep(this.selection.r, this.selection.vr, this.selection.targetR, radiusK, radiusD, dt);
        }
        [this.selection.amount, this.selection.amountVelocity] = this.springStep(
          this.selection.amount, this.selection.amountVelocity, this.selection.targetAmount, 260, 29, dt
        );
      }

      this.press.energy = clamp(this.press.energy, 0, 1.12);
      this.hoverEnergy = clamp(this.hoverEnergy, 0, 1.08);
      this.materialize = clamp(this.materialize, 0, 1.04);
      this.merge = clamp(this.merge, 0, 1.02);
      this.selection.amount = clamp(this.selection.amount, 0, 1.06);

      if (this.activeIndex < 0) {
        const decay = Math.pow(0.06, dt);
        this.velocity.x *= decay;
        this.velocity.y *= decay;
        if (this.press.energy < 0.025 && Math.abs(this.press.springVelocity) < 0.05) this.visualActiveIndex = -1;
      }
    }

    render(timeSeconds) {
      const visible = this.isVisible();
      if (!visible || !sceneCanvas) {
        this.visibleLastFrame = false;
        return;
      }
      if (!this.visibleLastFrame) {
        this.materialize = reduceMotionQuery.matches ? 1 : 0;
        this.materializeSpringVelocity = 0;
        this.visibleLastFrame = true;
      }
      this.resize();
      this.updateCropIfNeeded();
      const gl = this.gl;
      const outputRegion = this.sharedPresentation
        ? this.renderer.begin(this.canvas.width, this.canvas.height)
        : null;
      const { shapes, meta, hostRect, scaleX, scaleY } = this.getGeometry();
      const lightLocalX = this.cssWidth * 0.30;
      const lightLocalY = this.cssHeight * 0.82;
      const accent = currentAccent();
      const scrollProgress = smoothstep(8, 96, window.scrollY);

      gl.useProgram(this.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.uniform2f(this.locations.u_resolution, this.canvas.width, this.canvas.height);
      gl.uniform1f(this.locations.u_dpr, this.dpr);
      gl.uniform1f(this.locations.u_time, timeSeconds);
      gl.uniform1i(this.locations.u_shapeCount, this.members.length);
      gl.uniform4fv(this.locations['u_shapes[0]'], shapes);
      gl.uniform4fv(this.locations['u_meta[0]'], meta);
      gl.uniform1f(this.locations.u_activeIndex, this.visualActiveIndex);
      gl.uniform1f(this.locations.u_hoverIndex, this.hoverIndex);
      gl.uniform2f(this.locations.u_press, this.press.x * this.dpr, this.press.y * this.dpr);
      gl.uniform2f(this.locations.u_velocity, 0, 0);
      gl.uniform2f(this.locations.u_light, lightLocalX * this.dpr, lightLocalY * this.dpr);
      gl.uniform3f(this.locations.u_accent, accent[0], accent[1], accent[2]);
      gl.uniform1f(this.locations.u_pressEnergy, this.press.energy);
      gl.uniform1f(this.locations.u_hoverEnergy, this.hoverEnergy);
      gl.uniform1f(this.locations.u_materialize, this.materialize);
      gl.uniform1f(this.locations.u_focus, pageFocused ? 1 : 0.34);
      gl.uniform1f(this.locations.u_merge, this.merge);
      gl.uniform1f(this.locations.u_scrollEdge, this.scrollEdge);
      gl.uniform1f(this.locations.u_scrollProgress, scrollProgress);
      gl.uniform1f(this.locations.u_reducedMotion, reduceMotionQuery.matches ? 1 : 0);
      const panelFrost = (this.name === 'theme-studio' || this.name === 'fit-selector') ? 0.88 : (this.name === 'mobile-navigation' ? 0.90 : 0);
      gl.uniform1f(this.locations.u_reducedTransparency, Math.max(reduceTransparencyQuery.matches ? 1 : 0, panelFrost));
      gl.uniform1f(this.locations.u_increasedContrast, contrastQuery.matches ? 1 : 0);
      gl.uniform4f(
        this.locations.u_selection,
        this.selection.x * this.dpr,
        this.selection.y * this.dpr,
        Math.max(0, this.selection.w) * this.dpr,
        Math.max(0, this.selection.h) * this.dpr
      );
      gl.uniform2f(
        this.locations.u_selectionVelocity,
        this.selection.vx * this.dpr,
        this.selection.vy * this.dpr
      );
      gl.uniform1f(this.locations.u_selectionAmount, this.selection.amount);
      gl.uniform1f(this.locations.u_selectionRadius, Math.max(0, this.selection.r) * this.dpr);
      gl.uniform1f(this.locations.u_selectionFluidity, this.name === 'theme-studio' ? 1.0 : 0.0);
      gl.uniform4f(
        this.locations.u_selectionClip,
        this.selection.clipX * this.dpr,
        this.selection.clipY * this.dpr,
        Math.max(0, this.selection.clipW) * this.dpr,
        Math.max(0, this.selection.clipH) * this.dpr
      );
      gl.uniform1f(this.locations.u_selectionClipRadius, Math.max(0, this.selection.clipR) * this.dpr);
      const isLightTheme = document.documentElement.dataset.theme === 'light';
      const navContinuousBody = this.name === 'navigation';
      const navLightCleanup = navContinuousBody && isLightTheme;
      const centerClarity = navLightCleanup
        ? Math.max(this.preset.clarity ?? 0.68, 0.89)
        : (this.preset.clarity ?? 0.68);
      const chromaGain = navLightCleanup
        ? (this.preset.chroma ?? 0.75) * 0.22
        : (this.preset.chroma ?? 0.75);
      gl.uniform1f(this.locations.u_edgeGain, this.preset.edge ?? 1.0);
      gl.uniform1f(this.locations.u_centerClarity, centerClarity);
      gl.uniform1f(this.locations.u_chromaGain, chromaGain);
      gl.uniform1f(this.locations.u_reflectionGain, this.preset.reflection ?? 1.0);
      const backgroundRgb = currentBackgroundRgb();
      gl.uniform3f(
        this.locations.u_backgroundColor,
        (backgroundRgb[0] || 0) / 255,
        (backgroundRgb[1] || 0) / 255,
        (backgroundRgb[2] || 0) / 255
      );
      gl.uniform1f(this.locations.u_navContinuousBody, navContinuousBody ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);

      if (this.sharedPresentation) {
        gl.flush();
        // Present the shared framebuffer into this group's existing DOM canvas
        // at native pixel resolution. No scaling or visual post-effect is added.
        const ctx = this.displayCtx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        ctx.drawImage(
          this.renderer.canvas,
          outputRegion.sourceX,
          outputRegion.sourceY,
          outputRegion.width,
          outputRegion.height,
          0,
          0,
          this.canvas.width,
          this.canvas.height,
        );
      }
    }
  }

  function updateRuntimeDiagnostics() {
    const status = groups.map((group) => {
      const gl = group.gl;
      let linked = false;
      let error = -1;
      let lost = true;
      try {
        linked = !!gl && !!group.program && !!gl.getProgramParameter(group.program, gl.LINK_STATUS);
        lost = !gl || gl.isContextLost();
        error = gl ? gl.getError() : -1;
      } catch (_) {}
      return { name: group.name, linked, lost, error };
    });
    const verified = status.length > 0 && status.every((item) => item.linked && !item.lost && item.error === 0);
    const contextCount = SHARED_CONTEXT_MODE ? (sharedWebGLRenderer ? 1 : 0) : groups.length;
    root.dataset.liquidWebglVerified = verified ? 'true' : 'false';
    root.dataset.liquidWebglGroupCount = String(groups.length);
    root.dataset.liquidWebglContextCount = String(contextCount);
    window.__liquidGlassDiagnostics = {
      verified,
      groupCount: groups.length,
      contextCount,
      sharedContext: SHARED_CONTEXT_MODE,
      contextStrategy: SHARED_CONTEXT_MODE ? 'shared-android-chromium' : 'direct',
      groups: status,
      captureState: root.dataset.liquidCaptureState || 'pending',
      renderer: 'WebGL2',
    };
    return verified;
  }

  function buildGroups() {
    const byName = new Map();
    targets.forEach((target, i) => {
      const name = target.dataset.liquidGroup || `glass-${i}`;
      if (!byName.has(name)) byName.set(name, []);
      byName.get(name).push(target);
    });

    const existing = new Set(groups.map((group) => group.name));
    for (const [name, members] of byName) {
      if (existing.has(name)) continue;
      const explicitHost = document.querySelector(`[data-liquid-group-host="${CSS.escape(name)}"]`);
      const host = explicitHost || (members.length === 1 ? members[0] : commonAncestor(members));
      if (!host) continue;
      // Do not allocate a GPU context for mutually exclusive responsive UI.
      // It will be created on resize if that surface becomes visible.
      if (getComputedStyle(host).display === 'none') continue;
      try {
        const group = new LiquidGroup(name, members, host);
        members.forEach((member) => { member.dataset.liquidRendered = '1'; });
        groups.push(group);
      } catch (error) {
        host.querySelector(`.liquid-surface-canvas[data-liquid-renderer="${CSS.escape(name)}"]`)?.remove();
        members.forEach((member) => { delete member.dataset.liquidRendered; });
        console.error('[Liquid Glass] group failed:', name, error);
      }
    }
  }

  function refreshResponsiveGroups() {
    for (let i = groups.length - 1; i >= 0; i--) {
      const group = groups[i];
      if (getComputedStyle(group.host).display === 'none' || group.host.getClientRects().length === 0) {
        group.destroy();
        groups.splice(i, 1);
      }
    }
    buildGroups();
    root.dataset.liquidWebglGroups = String(groups.length);
    updateRuntimeDiagnostics();
  }

  function sampleDocumentColor(clientX, clientY, radius = 6) {
    if (!sceneCanvas || !sceneCtx) return { lum: 0.5, rgb: [0.5, 0.5, 0.5] };
    const docX = clientX + window.scrollX;
    const docY = clientY + window.scrollY;
    const rx = sceneCanvas.width / Math.max(1, documentWidth);
    const ry = sceneCanvas.height / Math.max(1, documentHeight);
    const x = clamp(Math.round(docX * rx), 0, sceneCanvas.width - 1);
    const y = clamp(Math.round(docY * ry), 0, sceneCanvas.height - 1);
    const r = Math.max(1, Math.round(radius * (rx + ry) * 0.5));
    const points = [[0,0],[r,0],[-r,0],[0,r],[0,-r]];
    const values = [];
    let center = [127, 127, 127];
    for (let i = 0; i < points.length; i++) {
      const [dx, dy] = points[i];
      const px = clamp(x + dx, 0, sceneCanvas.width - 1);
      const py = clamp(y + dy, 0, sceneCanvas.height - 1);
      const data = sceneCtx.getImageData(px, py, 1, 1).data;
      if (i === 0) center = [data[0], data[1], data[2]];
      values.push((0.2126 * data[0] + 0.7152 * data[1] + 0.0722 * data[2]) / 255);
    }
    return {
      lum: values.reduce((a, b) => a + b, 0) / values.length,
      rgb: center.map((v) => v / 255),
    };
  }

  function colorMix(a, b, t) {
    return a.map((v, i) => Math.round(mix(v, b[i], t)));
  }

  function rgbString(rgb) {
    return `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`;
  }

  let staticInkInitialized = false;
  function updateAdaptiveForegrounds() {
    if (staticInkInitialized) return;
    staticInkInitialized = true;
    document.querySelectorAll('[data-liquid-adaptive-ink="1"]').forEach((el) => {
      delete el.dataset.liquidAdaptiveInk;
      el.style.removeProperty('--liquid-ink');
      el.style.removeProperty('--liquid-ink-soft');
      el.style.removeProperty('--liquid-ink-muted');
      el.style.removeProperty('--liquid-active-bg');
      el.style.removeProperty('--liquid-active-border');
      el.style.removeProperty('--text-primary');
      el.style.removeProperty('--text-secondary');
      el.style.removeProperty('--text-muted');
    });
    root.dataset.liquidStaticInk = 'true';
  }

  function documentRect(element) {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left + window.scrollX,
      y: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height,
    };
  }

  // If the optional DOM snapshot module is unavailable, build a lightweight
  // environment map from the live page itself. Local photography is drawn at
  // its exact document position and text/surfaces become low-contrast detail,
  // so refraction remains functional instead of falling back to a flat blur.
  function buildEnvironmentalScene(scale) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(documentWidth * scale));
    canvas.height = Math.max(1, Math.round(documentHeight * scale));
    const ctx = canvas.getContext('2d', { alpha: false });
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.fillStyle = currentBackground();
    ctx.fillRect(0, 0, documentWidth, documentHeight);

    const accent = currentAccent().map((value) => Math.round(value * 255));
    const hero = document.querySelector('.hero');
    if (hero) {
      const rect = documentRect(hero);
      const cx = rect.x + rect.width * 0.78;
      const cy = rect.y + rect.height * 0.42;
      const radius = Math.max(rect.width, rect.height) * 0.62;
      const ambient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      ambient.addColorStop(0, `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, .16)`);
      ambient.addColorStop(.46, `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, .055)`);
      ambient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = ambient;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    }

    document.querySelectorAll('.surface-section, .fit-display, .services-grid, .about-card, .contact-grid, .contact-panel').forEach((element) => {
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return;
      const rect = documentRect(element);
      if (rect.width < 1 || rect.height < 1) return;
      ctx.globalAlpha = .34;
      ctx.fillStyle = style.backgroundColor === 'rgba(0, 0, 0, 0)'
        ? `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, .055)`
        : style.backgroundColor;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    });

    // Preserve the execution rail in the lightweight scene so the WebGL nodes
    // visibly bend its color even before the deferred high-quality DOM capture.
    document.querySelectorAll('.rm-rail').forEach((rail) => {
      const style = getComputedStyle(rail);
      if (style.display === 'none' || style.visibility === 'hidden') return;
      const rect = documentRect(rail);
      if (rect.width < 20 || rect.height < 4) return;
      const c1 = style.getPropertyValue('--sc1').trim() || '#b68b4c';
      const c2 = style.getPropertyValue('--sc2').trim() || c1;
      const c3 = style.getPropertyValue('--sc3').trim() || c2;
      const c4 = style.getPropertyValue('--sc4').trim() || c3;
      const c5 = style.getPropertyValue('--sc5').trim() || c4;
      const gradient = ctx.createLinearGradient(rect.x, 0, rect.x + rect.width, 0);
      gradient.addColorStop(0.06, c1);
      gradient.addColorStop(0.28, c2);
      gradient.addColorStop(0.50, c3);
      gradient.addColorStop(0.72, c4);
      gradient.addColorStop(0.94, c5);
      ctx.globalAlpha = 1;
      ctx.fillStyle = gradient;
      ctx.fillRect(rect.x + rect.width * 0.06, rect.y + rect.height * 0.5 - 6.5, rect.width * 0.88, 13);
    });

    // Rich photography is the most appropriate place for visible lensing.
    document.querySelectorAll('.portrait-img').forEach((image) => {
      const style = getComputedStyle(image);
      if (style.display === 'none' || style.visibility === 'hidden' || !image.complete || !image.naturalWidth) return;
      const rect = documentRect(image);
      try {
        ctx.globalAlpha = 1;
        ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);
      } catch (_) {
        // A cross-origin image should never disable the material as a whole.
      }
    });

    // Preserve enough environmental structure for fixed controls while
    // deliberately avoiding a second readable copy of the page content.
    document.querySelectorAll('h1, h2, h3, p, .project-title, .project-desc, .footer-tagline').forEach((element, index) => {
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < .02) return;
      const rect = documentRect(element);
      if (rect.width < 8 || rect.height < 3) return;
      const lineHeight = clamp(rect.height / 7, 2, 7);
      const lineCount = clamp(Math.round(rect.height / Math.max(lineHeight * 2.4, 10)), 1, 6);
      ctx.globalAlpha = .10;
      ctx.fillStyle = style.color;
      for (let line = 0; line < lineCount; line++) {
        const widthFactor = line === lineCount - 1 ? .58 + ((index + line) % 3) * .10 : .94;
        ctx.fillRect(rect.x, rect.y + line * lineHeight * 2.15, rect.width * widthFactor, lineHeight);
      }
    });

    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    return canvas;
  }

  function captureScale() {
    documentWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth, innerWidth);
    documentHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, innerHeight);
    return Math.min(
      1,
      Math.sqrt(CAPTURE_PIXEL_BUDGET / Math.max(1, documentWidth * documentHeight)),
      16384 / Math.max(1, documentWidth),
      16384 / Math.max(1, documentHeight),
    );
  }


  function sceneCacheBucket() {
    if (innerWidth <= 760) return 'mobile';
    if (innerWidth <= 1120) return 'tablet';
    return 'desktop';
  }

  function sceneAppearanceSignature() {
    return `${root.dataset.theme || 'dark'}|${root.dataset.background || 'black'}`;
  }

  function sceneCacheKey() {
    const widthBucket = Math.round(innerWidth / 160) * 160;
    return [
      SCENE_CACHE_BUILD,
      root.dataset.theme || 'dark',
      root.dataset.background || 'black',
      sceneCacheBucket(),
      widthBucket,
    ].join(':');
  }

  function openSceneCacheDb() {
    if (!('indexedDB' in window)) return Promise.resolve(null);
    if (sceneCacheDbPromise) return sceneCacheDbPromise;
    sceneCacheDbPromise = new Promise((resolve) => {
      try {
        const request = indexedDB.open(SCENE_CACHE_DB, 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(SCENE_CACHE_STORE)) db.createObjectStore(SCENE_CACHE_STORE, { keyPath: 'key' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
    return sceneCacheDbPromise;
  }

  async function loadCachedScene() {
    const expectedAppearance = sceneAppearanceSignature();
    const db = await openSceneCacheDb();
    if (!db) return false;
    const key = sceneCacheKey();
    const record = await new Promise((resolve) => {
      try {
        const tx = db.transaction(SCENE_CACHE_STORE, 'readonly');
        const request = tx.objectStore(SCENE_CACHE_STORE).get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => resolve(null);
      } catch (_) { resolve(null); }
    });
    if (!record?.blob || Date.now() - record.createdAt > SCENE_CACHE_MAX_AGE) return false;

    captureScale();
    const widthDelta = Math.abs(record.documentWidth - documentWidth) / Math.max(1, documentWidth);
    const heightDelta = Math.abs(record.documentHeight - documentHeight) / Math.max(1, documentHeight);
    if (widthDelta > .035 || heightDelta > .06) return false;

    try {
      const canvas = document.createElement('canvas');
      if ('createImageBitmap' in window) {
        const bitmap = await createImageBitmap(record.blob);
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d', { alpha: false });
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close?.();
      } else {
        const url = URL.createObjectURL(record.blob);
        try {
          const image = await new Promise((resolve, reject) => {
            const node = new Image();
            node.onload = () => resolve(node);
            node.onerror = reject;
            node.src = url;
          });
          canvas.width = image.naturalWidth;
          canvas.height = image.naturalHeight;
          canvas.getContext('2d', { alpha: false }).drawImage(image, 0, 0);
        } finally {
          URL.revokeObjectURL(url);
        }
      }
      if (expectedAppearance !== sceneAppearanceSignature()) return false;
      installScene(canvas, 'cache-ready');
      root.dataset.liquidCacheRestored = 'true';
      return true;
    } catch (_) {
      return false;
    }
  }

  function persistScene(canvas) {
    if (!canvas?.toBlob || !('indexedDB' in window)) return;
    const key = sceneCacheKey();
    const sourceDocumentWidth = documentWidth;
    const sourceDocumentHeight = documentHeight;
    const write = () => {
      try {
        canvas.toBlob(async (blob) => {
          if (!blob) return;
          const db = await openSceneCacheDb();
          if (!db) return;
          try {
            const tx = db.transaction(SCENE_CACHE_STORE, 'readwrite');
            tx.objectStore(SCENE_CACHE_STORE).put({
              key,
              blob,
              createdAt: Date.now(),
              documentWidth: sourceDocumentWidth,
              documentHeight: sourceDocumentHeight,
            });
          } catch (_) {}
        }, 'image/webp', .72);
      } catch (_) {}
    };
    if ('requestIdleCallback' in window) requestIdleCallback(write, { timeout: 2200 });
    else setTimeout(write, 120);
  }

  function installScene(canvas, state, expectedAppearance = null) {
    if (!canvas) return false;
    if (expectedAppearance && expectedAppearance !== sceneAppearanceSignature()) return false;
    sceneCanvas = canvas;
    sceneCtx = canvas.getContext('2d');
    sceneVersion += 1;
    groups.forEach((group) => { group.lastCropKey = ''; });
    const stamp = performance.now();
    groups.forEach((group) => group.render(stamp / 1000));
    root.classList.add('liquid-glass-ready');
    root.classList.remove('no-webgl-liquid');
    root.dataset.liquidCaptureState = state;
    updateAdaptiveForegrounds(stamp);
    updateRuntimeDiagnostics();
    if (root.dataset.liquidBootReady !== 'true') {
      root.dataset.liquidBootReady = 'true';
      window.dispatchEvent(new CustomEvent('ray:liquidready', { detail: { state } }));
    }
    return true;
  }

  function captureStructuralScene(expectedAppearance = sceneAppearanceSignature()) {
    try {
      const scale = captureScale();
      installScene(buildEnvironmentalScene(scale), 'structural-ready', expectedAppearance);
    } catch (error) {
      console.error('[Liquid Glass] structural environment refresh failed.', error);
    }
  }

  async function captureScene() {
    const expectedAppearance = sceneAppearanceSignature();
    if (performance.now() < scrollActiveUntil) {
      scheduleIdleCapture(500);
      return;
    }
    root.dataset.liquidCaptureState = 'upgrading';
    if (capturing) {
      recaptureRequested = true;
      return;
    }
    capturing = true;
    recaptureRequested = false;
    try {
      const scale = captureScale();
      let canvas = null;
      const snapdom = STRUCTURAL_SCENE_ONLY ? null : await loadSnapdom();
      if (snapdom) {
        let restoreCaptureImages = () => {};
        try {
          // SnapDOM normally fetches every <img> again so it can inline it into
          // the SVG/canvas export. The hero portrait is already loaded and is
          // same-origin, so temporarily hand SnapDOM a self-contained data URL.
          // This avoids its internal fetch timeout/AbortController entirely.
          restoreCaptureImages = await inlineCaptureImages();
          canvas = await snapdom.toCanvas(document.body, {
            scale,
            dpr: 1,
            embedFonts: false,
            compress: true,
            fast: true,
            cache: 'soft',
            outerTransforms: false,
            outerShadows: false,
            exclude: ['.liquid-surface-canvas', '[data-liquid-glass]'],
            excludeMode: 'hide',
          });
        } catch (_) {
          canvas = null;
        } finally {
          restoreCaptureImages();
        }
      }
      if (canvas) {
        if (expectedAppearance !== sceneAppearanceSignature()) {
          recaptureRequested = true;
          return;
        }
        if (installScene(canvas, 'snapdom-ready', expectedAppearance)) persistScene(canvas);
      } else if (!sceneCanvas) captureStructuralScene();
    } catch (error) {
      console.error('[Liquid Glass] high-quality environment capture failed; structural scene remains active.', error);
      if (!sceneCanvas) root.classList.add('no-webgl-liquid');
    } finally {
      capturing = false;
      if (recaptureRequested) scheduleIdleCapture(650);
    }
  }

  function scheduleCapture(delay = 120) {
    clearTimeout(captureTimer);
    captureTimer = window.setTimeout(captureScene, delay);
  }

  function scheduleIdleCapture(delay = 650) {
    clearTimeout(idleCaptureTimer);
    if (idleCaptureHandle && 'cancelIdleCallback' in window) cancelIdleCallback(idleCaptureHandle);
    idleCaptureHandle = 0;
    idleCaptureTimer = window.setTimeout(() => {
      const run = () => {
        idleCaptureHandle = 0;
        captureScene();
      };
      if ('requestIdleCallback' in window) {
        idleCaptureHandle = requestIdleCallback(run, { timeout: 1600 });
      } else {
        captureTimer = window.setTimeout(run, 60);
      }
    }, delay);
  }

  function resetTransientMaterial(groupName) {
    const group = groups.find((item) => item.name === groupName);
    group?.resetMaterialization();
  }

  refreshResponsiveGroups();
  if (groups.length) {
    console.info(
      SHARED_CONTEXT_MODE
        ? `[Liquid Glass] WebGL2 renderer initialized: ${groups.length} active material groups on 1 shared WebGL2 context (Android Chromium).`
        : `[Liquid Glass] WebGL2 renderer initialized: ${groups.length} active material groups.`
    );
    root.dataset.liquidWebglActive = 'true';
  }
  if (!groups.length) {
    root.classList.add('no-webgl-liquid');
    window.dispatchEvent(new CustomEvent('ray:liquidready', { detail: { state: 'fallback' } }));
    return;
  }

  addEventListener('blur', () => { pageFocused = false; });
  addEventListener('focus', () => { pageFocused = true; });

  addEventListener('scroll', () => {
    // Scrolling only changes the crop window. Re-snapshotting the whole DOM here
    // was the main source of post-scroll stalls.
    scrollActiveUntil = performance.now() + 180;
    groups.filter((group) => group.isFixed).forEach((group) => { group.lastCropKey = ''; });
  }, { passive: true });

  let resizeTimer = 0;
  let lastViewportWidth = innerWidth;
  let lastViewportHeight = innerHeight;
  addEventListener('resize', () => {
    const nextWidth = innerWidth;
    const nextHeight = innerHeight;
    const widthDelta = Math.abs(nextWidth - lastViewportWidth);
    const heightDelta = Math.abs(nextHeight - lastViewportHeight);
    lastViewportWidth = nextWidth;
    lastViewportHeight = nextHeight;

    // iOS Safari changes viewport height while its browser chrome expands/collapses.
    // Reallocating every WebGL canvas for those height-only changes can stutter and
    // has historically been problematic in WebKit. The glass geometry itself has
    // not changed, so only invalidate fixed crop windows in that case.
    if (appleMobile && widthDelta < 3 && heightDelta < 220) {
      groups.filter((group) => group.isFixed).forEach((group) => { group.lastCropKey = ''; });
      return;
    }

    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      refreshResponsiveGroups();
      groups.forEach((group) => group.resize(true));
      captureStructuralScene();
      scheduleIdleCapture(appleMobile ? 5000 : 1200);
    }, appleMobile ? 180 : 90);
  }, { passive: true });

  let activeAppearanceSequence = 0;

  function cancelAppearanceCaptureWork() {
    clearTimeout(captureTimer);
    clearTimeout(idleCaptureTimer);
    if (idleCaptureHandle && 'cancelIdleCallback' in window) cancelIdleCallback(idleCaptureHandle);
    idleCaptureHandle = 0;
    if (capturing) recaptureRequested = true;
  }

  function invalidateAppearanceMaterials() {
    groups.forEach((group) => {
      group.lastCropKey = '';
      group.resetMaterialization();
    });
  }

  window.addEventListener('ray:appearancechange', (event) => {
    // Commit phase: switch the GPU environment immediately. Do NOT restore an
    // IndexedDB scene here. The cache is a boot optimization; during a live
    // appearance change it can race the fresh scene and re-introduce pixels
    // from a previous material state.
    const sequence = Number(event.detail?.sequence || 0);
    if (sequence) activeAppearanceSequence = Math.max(activeAppearanceSequence, sequence);
    cancelAppearanceCaptureWork();
    invalidateAppearanceMaterials();

    const expectedAppearance = sceneAppearanceSignature();
    captureStructuralScene(expectedAppearance);
  });

  window.addEventListener('ray:appearancesettled', (event) => {
    // Settled phase: CSS theme transitions have finished. Rebuild the structural
    // environment from final computed styles. This is essential on iPhone/iPad,
    // where STRUCTURAL_SCENE_ONLY intentionally avoids SnapDOM and therefore
    // this scene remains the authoritative WebGL environment until the next
    // appearance change.
    const sequence = Number(event.detail?.sequence || 0);
    if (sequence && sequence < activeAppearanceSequence) return;
    if (sequence) activeAppearanceSequence = sequence;

    cancelAppearanceCaptureWork();
    captureScale();
    refreshResponsiveGroups();
    groups.forEach((group) => {
      group.resize(true);
      group.lastCropKey = '';
    });

    const expectedAppearance = sceneAppearanceSignature();
    captureStructuralScene(expectedAppearance);

    // Desktop/Android can upgrade to a pixel-accurate DOM capture after the
    // settled structural scene. Apple mobile deliberately stays structural.
    if (!STRUCTURAL_SCENE_ONLY) scheduleCapture(90);
  });

  const uiObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const target = mutation.target;
      if (target === document.getElementById('themeStudio') && mutation.attributeName === 'class' && target.classList.contains('open')) {
        resetTransientMaterial('theme-studio');
      }
      if (target === document.getElementById('mobileDrawer') && mutation.attributeName === 'class' && target.classList.contains('open')) {
        resetTransientMaterial('mobile-navigation');
      }
    }
  });
  uiObserver.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });

  [reduceMotionQuery, contrastQuery, reduceTransparencyQuery].forEach((query) => {
    query.addEventListener?.('change', () => {
      groups.forEach((group) => group.resetMaterialization());
      updateAdaptiveForegrounds(performance.now());
    });
  });

  let previousTime = performance.now();
  function frame(now) {
    const dt = Math.min(0.034, Math.max(0.001, (now - previousTime) / 1000));
    previousTime = now;
    const frameBudget = now < scrollActiveUntil ? 1000 / ACTIVE_FPS : 1000 / IDLE_FPS;
    const shouldDraw = (now - lastGlobalRender) >= frameBudget;
    groups.forEach((group) => {
      group.updateDynamics(dt);
      if (shouldDraw) group.render(now / 1000);
    });
    if (shouldDraw) {
      lastGlobalRender = now;
      updateAdaptiveForegrounds(now);
    }
    requestAnimationFrame(frame);
  }

  const initialCapture = () => {
    // First usable glass is local and immediate. On repeat visits an IndexedDB
    // scene can replace it almost immediately, avoiding a compulsory SnapDOM
    // pass during startup.
    captureStructuralScene();
    loadCachedScene().then((restored) => {
      scheduleIdleCapture(restored ? (appleMobile ? 14000 : 7000) : (appleMobile ? 7500 : 2600));
    });
    document.fonts?.ready?.then(() => {
      if (root.dataset.liquidCacheRestored !== 'true') scheduleIdleCapture(appleMobile ? 8500 : 3000);
    }, () => {});
  };

  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', initialCapture, { once: true });
  else initialCapture();

  requestAnimationFrame(frame);
})();


