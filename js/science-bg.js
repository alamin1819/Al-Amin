/*
 * Site-wide scientific background (stars, particles, equations, orbits,
 * atoms, molecules, waves, nebula) behind every page.
 *
 * Usage: first element inside <body>:
 *
 *   <div class="science-bg" data-science-bg aria-hidden="true">
 *     <div class="science-bg-nebula science-bg-nebula-a"></div>
 *     <div class="science-bg-nebula science-bg-nebula-b"></div>
 *     <canvas data-science-scene></canvas>
 *   </div>
 *
 * The layer is fixed to the viewport, so it never repaints while scrolling.
 * Page content scrolls over it: equations, planets and shapes only appear in
 * areas that are currently empty and fade out when content moves over them;
 * stars and particles are dimmed behind content.
 *
 * Everything is drawn on one canvas at a low frame rate (all motion is
 * slow). Mouse parallax is a CSS transform on the canvas, so it never forces
 * a redraw.
 * The layout comes from a seeded random generator, so it is stable between
 * visits for the same screen size.
 */
(function () {
  "use strict";

  var root = document.querySelector("[data-science-bg]");
  if (!root) return;
  var canvas = root.querySelector("[data-science-scene]");
  var ctx = canvas && canvas.getContext("2d");
  if (!ctx) return;

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  var EQUATIONS = [
    "E = mc²", "F = ma", "V = IR", "PV = nRT", "λ = h/p", "c = λf", "ΣF = ma",
    "∇ × E = −∂B/∂t", "E = hν", "∇ · E = ρ/ε₀", "ΔxΔp ≥ ħ/2", "e^iπ + 1 = 0",
    "iħ ∂ψ/∂t = Ĥψ", "P = VI", "η = Pout/Pin", "Eg = hc/λ"
  ];
  var SYMBOLS = ["∫", "Σ", "π", "Ω", "∞", "Δ", "ħ", "λ", "α", "∂", "μ", "ψ"];

  // Page content the decorations must keep clear of
  var CONTENT = [
    "h1", "h2", "h3", "h4", "p", "li", "img", "a", "button", "dt", "dd",
    "blockquote", "figure", ".card", "[data-nav]", "[data-slider]"
  ].join(",");

  // Densities per screen size
  var PROFILES = {
    desktop: { stars: 140, particles: 42, link: 120, equations: 9, symbols: 8, planets: 2, atoms: 1, hexes: 2, waves: 2, fps: 15 },
    tablet: { stars: 90, particles: 24, link: 105, equations: 5, symbols: 5, planets: 1, atoms: 1, hexes: 1, waves: 1, fps: 12 },
    mobile: { stars: 50, particles: 12, link: 90, equations: 3, symbols: 3, planets: 1, atoms: 0, hexes: 0, waves: 0, fps: 12 }
  };

  /* ---------- helpers ---------- */

  // Small seeded PRNG (mulberry32) for stable "random" layouts
  function seeded(seed) {
    return function () {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function between(rand, min, max) {
    return min + rand() * (max - min);
  }

  function overlaps(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function hits(box, list) {
    for (var i = 0; i < list.length; i++) if (overlaps(box, list[i])) return true;
    return false;
  }

  function inside(x, y, list) {
    for (var i = 0; i < list.length; i++) {
      var z = list[i];
      if (x > z.x && x < z.x + z.w && y > z.y && y < z.y + z.h) return true;
    }
    return false;
  }

  /* ---------- state ---------- */

  var W = 0, H = 0, dpr = 1;
  var profile, rand;
  var contentEls = [], content = []; // content elements and their current viewport boxes
  var stars = [], particles = [], floaters = [], statics = [], waves = [];
  var mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  var running = false, lastFrame = 0, startTime = performance.now(), prevTime = 0;
  var floatFont = 'italic 15px Georgia, "Times New Roman", serif';
  var symbolFont = '17px Georgia, "Times New Roman", serif';

  // Current viewport boxes of the page content (padded), refreshed on scroll
  function measureContent() {
    var pad = W < 640 ? 10 : 16;
    content = [];
    for (var i = 0; i < contentEls.length; i++) {
      var r = contentEls[i].getBoundingClientRect();
      if (!r.width || !r.height || r.bottom < -pad || r.top > H + pad) continue;
      content.push({ x: r.left - pad, y: r.top - pad, w: r.width + pad * 2, h: r.height + pad * 2 });
    }
  }

  // Find a currently empty spot, away from content and other decorations.
  // `skip` is a floater being replaced (its old spot may be reused).
  function place(w, h, tries, skip) {
    var gap = 14;
    var taken = [];
    statics.forEach(function (s) {
      taken.push(s.box);
    });
    floaters.forEach(function (f) {
      if (f !== skip) taken.push(f.box);
    });
    for (var i = 0; i < (tries || 40); i++) {
      var box = { x: between(rand, 8, Math.max(8, W - w - 8)), y: between(rand, 8, Math.max(8, H - h - 8)), w: w, h: h };
      var padded = { x: box.x - gap, y: box.y - gap, w: w + gap * 2, h: h + gap * 2 };
      if (!hits(box, content) && !hits(padded, taken)) return box;
    }
    return null;
  }

  function makeFloater(kind, stagger, skip) {
    var text = kind === "eq" ? EQUATIONS[Math.floor(rand() * EQUATIONS.length)] : SYMBOLS[Math.floor(rand() * SYMBOLS.length)];
    ctx.font = kind === "eq" ? floatFont : symbolFont;
    var w = ctx.measureText(text).width;
    var drift = 30; // room for the upward drift during its lifetime
    var spot = place(w, 20 + drift, 40, skip);
    if (!spot) return null;
    var life = between(rand, 14, 22);
    return {
      kind: kind,
      text: text,
      x: spot.x,
      y: spot.y + drift,
      vy: -drift / life,
      life: life,
      // stagger the first cycle so they do not all fade in together
      born: stagger ? -rand() * life : 0,
      alpha: kind === "eq" ? between(rand, 0.16, 0.24) : between(rand, 0.1, 0.16),
      box: spot, // whole area it covers while drifting
      vis: 1 // fades to 0 while page content covers it
    };
  }

  function build() {
    W = document.documentElement.clientWidth;
    H = window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    profile = W >= 1024 ? PROFILES.desktop : W >= 640 ? PROFILES.tablet : PROFILES.mobile;
    rand = seeded(20260519 + profile.stars);
    contentEls = Array.prototype.filter.call(document.querySelectorAll(CONTENT), function (el) {
      return !el.closest("[data-science-bg]");
    });
    measureContent();

    var i;
    // Stars: about a third twinkle, the rest shine steadily (and fainter)
    stars = [];
    for (i = 0; i < profile.stars; i++) {
      var star = {
        x: rand() * W, y: rand() * H,
        r: between(rand, 0.3, 1.25),
        a: between(rand, 0.25, 0.75),
        speed: between(rand, 0.4, 1.4),
        phase: rand() * Math.PI * 2,
        warm: rand() < 0.15
      };
      star.twinkle = rand() < 0.35;
      if (!star.twinkle) star.a *= 0.5;
      stars.push(star);
    }

    particles = [];
    for (i = 0; i < profile.particles; i++) {
      particles.push({
        x: rand() * W, y: rand() * H,
        vx: between(rand, -6, 6), vy: between(rand, -4, 4),
        r: between(rand, 0.8, 1.8),
        a: between(rand, 0.25, 0.5),
        k: 1
      });
    }

    // fixed decorations first, so equations are placed around them
    floaters = [];
    statics = [];
    for (i = 0; i < profile.planets; i++) {
      var rx = W < 640 ? between(rand, 26, 38) : between(rand, 45, 85);
      var ry = rx * between(rand, 0.32, 0.45);
      var spot = place(rx * 2 + 24, ry * 2 + 24, 80);
      if (!spot) continue;
      statics.push({
        type: "planet", box: spot, vis: 1,
        cx: spot.x + spot.w / 2, cy: spot.y + spot.h / 2,
        rx: rx, ry: ry, tilt: between(rand, -0.35, 0.35),
        size: W < 640 ? between(rand, 2.5, 3.5) : between(rand, 3.5, 6.5),
        period: between(rand, 70, 110),
        phase: rand() * Math.PI * 2,
        ringed: i === 0 && W >= 640,
        hue: i % 2 === 0 ? [96, 165, 250] : [251, 191, 36]
      });
    }
    for (i = 0; i < profile.atoms; i++) {
      var at = place(64, 64, 80);
      if (at) statics.push({ type: "atom", box: at, vis: 1, x: at.x + 32, y: at.y + 32, r: 26, spin: rand() * Math.PI });
    }
    for (i = 0; i < profile.hexes; i++) {
      var hx = place(52, 52, 80);
      if (hx) statics.push({ type: "hex", box: hx, vis: 1, x: hx.x + 26, y: hx.y + 26, r: 18, spin: rand() * Math.PI });
    }

    for (i = 0; i < profile.equations; i++) pushFloater("eq");
    for (i = 0; i < profile.symbols; i++) pushFloater("sym");

    waves = [];
    for (i = 0; i < profile.waves; i++) {
      waves.push({ y: H * between(rand, 0.78, 0.92), amp: between(rand, 6, 12), len: between(rand, 160, 260), speed: between(rand, 0.15, 0.3), phase: rand() * 6 });
    }
  }

  function pushFloater(kind) {
    var f = makeFloater(kind, true);
    if (f) floaters.push(f);
  }

  // Ease an item's visibility toward 0 while content covers it, back to 1 when clear
  function fadeFor(item, box, dt) {
    var target = hits(box, content) ? 0 : 1;
    if (reduceMotion || dt === null) item.vis = target;
    else item.vis += (target - item.vis) * Math.min(1, dt * 4);
    return item.vis;
  }

  /* ---------- drawing ---------- */

  function draw(now) {
    var t = (now - startTime) / 1000;
    var dt = prevTime ? Math.min(0.2, (now - prevTime) / 1000) : null;
    prevTime = now;
    ctx.clearRect(0, 0, W, H);

    // waves (deepest layer, very faint)
    ctx.lineWidth = 1;
    waves.forEach(function (w, n) {
      ctx.strokeStyle = "rgba(125, 211, 252, " + (0.06 - n * 0.02) + ")";
      ctx.beginPath();
      for (var x = 0; x <= W; x += 8) {
        var y = w.y + Math.sin(x / w.len * Math.PI * 2 + w.phase + t * w.speed) * w.amp;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });

    // stars (dimmed behind content)
    stars.forEach(function (s) {
      var a = s.a * (s.twinkle ? 0.65 + 0.35 * Math.sin(t * s.speed + s.phase) : 1) * (inside(s.x, s.y, content) ? 0.1 : 1);
      ctx.fillStyle = s.warm ? "rgba(253, 230, 138, " + a + ")" : "rgba(226, 232, 240, " + a + ")";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    });

    // particles + constellation links (dimmed behind content)
    particles.forEach(function (p) {
      if (dt) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      if (p.x < -10) p.x = W + 10; else if (p.x > W + 10) p.x = -10;
      if (p.y < -10) p.y = H + 10; else if (p.y > H + 10) p.y = -10;
      p.k = inside(p.x, p.y, content) ? 0.1 : 1;
    });
    var link = profile.link;
    ctx.lineWidth = 0.6;
    for (var i = 0; i < particles.length; i++) {
      for (var j = i + 1; j < particles.length; j++) {
        var dx = particles[i].x - particles[j].x, dy = particles[i].y - particles[j].y;
        var d2 = dx * dx + dy * dy;
        if (d2 < link * link) {
          ctx.strokeStyle = "rgba(148, 197, 255, " + (1 - Math.sqrt(d2) / link) * 0.12 * Math.min(particles[i].k, particles[j].k) + ")";
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.stroke();
        }
      }
    }
    particles.forEach(function (p) {
      ctx.fillStyle = "rgba(186, 230, 253, " + p.a * p.k + ")";
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    });

    // orbits + planets, atoms, molecules
    statics.forEach(function (o) {
      var vis = fadeFor(o, o.box, dt);
      if (vis < 0.01) return;
      ctx.save();
      ctx.globalAlpha = vis;
      if (o.type === "planet") drawPlanet(o, t);
      else if (o.type === "atom") drawAtom(o, t);
      else drawHex(o, t);
      ctx.restore();
    });

    // equations and symbols: fade in, drift up, fade out, then reappear in an empty spot
    ctx.textBaseline = "top";
    for (var f = 0; f < floaters.length; f++) {
      var fl = floaters[f];
      var age = reduceMotion ? fl.life / 2 : t - fl.born;
      if (age > fl.life) {
        var next = makeFloater(fl.kind, false, fl);
        if (next) {
          next.born = t;
          next.vis = 0;
          floaters[f] = fl = next;
        } else {
          fl.born = t;
        }
        age = 0;
      }
      var y = fl.y + fl.vy * age;
      var vis = fadeFor(fl, { x: fl.x, y: y, w: fl.box.w, h: 20 }, dt);
      var life = Math.min(1, age / 3, (fl.life - age) / 3);
      if (life <= 0 || vis < 0.01) continue;
      ctx.font = fl.kind === "eq" ? floatFont : symbolFont;
      ctx.fillStyle = "rgba(203, 213, 225, " + fl.alpha * life * vis + ")";
      ctx.fillText(fl.text, fl.x, y);
    }
  }

  function drawPlanet(o, t) {
    ctx.translate(o.cx, o.cy);
    ctx.rotate(o.tilt);
    ctx.setLineDash([2, 6]);
    ctx.lineDashOffset = -t * 2;
    ctx.strokeStyle = "rgba(148, 163, 184, 0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, 0, o.rx, o.ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    // small star at the orbit centre
    ctx.fillStyle = "rgba(253, 230, 138, 0.35)";
    ctx.beginPath();
    ctx.arc(0, 0, 1.6, 0, Math.PI * 2);
    ctx.fill();
    // planet
    var ang = o.phase + (t / o.period) * Math.PI * 2;
    var x = Math.cos(ang) * o.rx, y = Math.sin(ang) * o.ry;
    var g = ctx.createRadialGradient(x - o.size * 0.35, y - o.size * 0.35, 0, x, y, o.size);
    g.addColorStop(0, "rgba(" + o.hue.join(",") + ", 0.75)");
    g.addColorStop(1, "rgba(" + o.hue.join(",") + ", 0.12)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, o.size, 0, Math.PI * 2);
    ctx.fill();
    if (o.ringed) {
      ctx.strokeStyle = "rgba(226, 232, 240, 0.25)";
      ctx.beginPath();
      ctx.ellipse(x, y, o.size * 1.9, o.size * 0.55, -0.4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawAtom(a, t) {
    ctx.translate(a.x, a.y);
    ctx.rotate(a.spin + t * 0.05);
    ctx.strokeStyle = "rgba(148, 197, 255, 0.14)";
    ctx.lineWidth = 0.8;
    for (var k = 0; k < 3; k++) {
      var rot = (k * Math.PI) / 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, a.r, a.r * 0.36, rot, 0, Math.PI * 2);
      ctx.stroke();
      // electron
      var e = t * (0.5 + k * 0.12) + k * 2;
      var ex = Math.cos(e) * a.r, ey = Math.sin(e) * a.r * 0.36;
      ctx.fillStyle = "rgba(186, 230, 253, 0.45)";
      ctx.beginPath();
      ctx.arc(ex * Math.cos(rot) - ey * Math.sin(rot), ex * Math.sin(rot) + ey * Math.cos(rot), 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(253, 230, 138, 0.4)";
    ctx.beginPath();
    ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawHex(h, t) {
    ctx.translate(h.x, h.y);
    ctx.rotate(h.spin + t * 0.03);
    ctx.strokeStyle = "rgba(148, 163, 184, 0.13)";
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    for (var k = 0; k <= 6; k++) {
      var ang = (k * Math.PI) / 3;
      if (k === 0) ctx.moveTo(Math.cos(ang) * h.r, Math.sin(ang) * h.r);
      else ctx.lineTo(Math.cos(ang) * h.r, Math.sin(ang) * h.r);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, h.r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
  }

  /* ---------- mouse parallax (GPU transforms only, no redraw) ---------- */

  var parallaxRunning = false;
  function parallax() {
    mouse.x += (mouse.tx - mouse.x) * 0.06;
    mouse.y += (mouse.ty - mouse.y) * 0.06;
    canvas.style.transform = "translate3d(" + (mouse.x * 8).toFixed(2) + "px," + (mouse.y * 8).toFixed(2) + "px,0)";
    if (running && (Math.abs(mouse.tx - mouse.x) > 0.002 || Math.abs(mouse.ty - mouse.y) > 0.002)) requestAnimationFrame(parallax);
    else parallaxRunning = false;
  }

  /* ---------- loop ---------- */

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (now - lastFrame < 1000 / profile.fps - 1) return;
    lastFrame = now;
    draw(now);
  }

  function start() {
    if (running || reduceMotion || document.hidden) return;
    running = true;
    prevTime = 0;
    requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
  }

  function rebuild() {
    build();
    prevTime = 0;
    draw(performance.now());
  }

  // Wait for fonts so text measurements (and content boxes) are final
  var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  ready.then(function () {
    rebuild();
    root.classList.add("is-ready");
    start();

    // Keep content boxes current while scrolling (reads only, at most once per frame)
    var measuring = false;
    window.addEventListener(
      "scroll",
      function () {
        if (measuring) return;
        measuring = true;
        requestAnimationFrame(function () {
          measuring = false;
          measureContent();
          // with reduced motion there is no loop, so redraw the still frame
          if (reduceMotion) draw(performance.now());
        });
      },
      { passive: true }
    );

    // Rebuild on real size changes only (mobile toolbars change height a lot while scrolling)
    var lastW = W;
    var resizeTimer;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (document.documentElement.clientWidth !== lastW || Math.abs(window.innerHeight - H) > 120) {
          lastW = document.documentElement.clientWidth;
          rebuild();
        }
      }, 200);
    });

    // Pause while the tab is hidden
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop();
      else start();
    });

    if (finePointer && !reduceMotion) {
      window.addEventListener(
        "pointermove",
        function (event) {
          mouse.tx = (event.clientX / window.innerWidth - 0.5) * 2;
          mouse.ty = (event.clientY / window.innerHeight - 0.5) * 2;
          if (running && !parallaxRunning) {
            parallaxRunning = true;
            requestAnimationFrame(parallax);
          }
        },
        { passive: true }
      );
    }
  });
})();
