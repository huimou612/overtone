/* =========================================================
   泛音 Overtone — site behaviour
   Zero dependencies.
   ========================================================= */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* =========================================================
     下载渠道配置 —— 只需改这一处
     把网盘分享链接填进 url，提取码填进 code，页面会自动启用按钮。
     留空时页面显示「待补充」，不会生成假链接。
     ========================================================= */
  var DOWNLOAD = {
    // GitHub 安装包直链：页面「GitHub 直链」按钮 / 弹窗渠道 A 使用
    direct: 'https://github.com/huimou612/overtone/releases/download/v0.4.0/overtone-v0.4.0-x64-Setup.exe',
    // Release 页：全平台包、SHA512 校验值与历史版本
    github: 'https://github.com/huimou612/overtone/releases/tag/v0.4.0',
    // 「直接下载」按钮默认跳转的国内渠道（安装包已放进夸克网盘）
    primary: 'https://pan.quark.cn/s/cb4287d938ee',
    // 网盘渠道：url 为分享链接，code 为提取码（没有就留空字符串）
    pans: [
      { name: '夸克网盘', url: 'https://pan.quark.cn/s/cb4287d938ee', code: '' },
      { name: '百度云', url: 'https://pan.baidu.com/s/1Rp4Z-ol_l6B7COjvKruAlQ?pwd=p6l0', code: 'p6l0' }
    ]
  };

  /* ---------- header state / to top ---------- */
  var header = document.getElementById('site-header');
  var toTop = document.getElementById('to-top');

  function onScroll() {
    var y = window.scrollY || window.pageYOffset;
    header.classList.toggle('is-scrolled', y > 12);
    toTop.classList.toggle('is-visible', y > 640);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  toTop.addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  });

  /* ---------- mobile navigation ---------- */
  var navToggle = document.getElementById('nav-toggle');
  var navMenu = document.getElementById('nav-menu');

  function setMenu(open) {
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    navToggle.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
    navMenu.classList.toggle('is-open', open);
    header.classList.toggle('menu-open', open);
    document.body.classList.toggle('menu-open', open);
  }

  navToggle.addEventListener('click', function () {
    setMenu(navToggle.getAttribute('aria-expanded') !== 'true');
  });
  navMenu.addEventListener('click', function (e) {
    if (e.target.closest('a')) setMenu(false);
  });
  document.querySelector('.brand').addEventListener('click', function () { setMenu(false); });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && navMenu.classList.contains('is-open')) {
      setMenu(false);
      navToggle.focus();
    }
    if (e.key !== 'Tab' || !navMenu.classList.contains('is-open')) return;
    var items = Array.prototype.slice.call(
      navMenu.querySelectorAll('a, button')
    ).concat([navToggle]).filter(function (el) { return el.offsetParent !== null; });
    var index = items.indexOf(document.activeElement);
    if (e.shiftKey && index <= 0) {
      e.preventDefault(); items[items.length - 1].focus();
    } else if (!e.shiftKey && (index === items.length - 1 || index === -1)) {
      e.preventDefault(); items[0].focus();
    }
  });
  window.addEventListener('resize', function () {
    if (window.innerWidth > 860) setMenu(false);
  });

  /* ---------- reveal on scroll ---------- */
  var revealEls = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  if ('IntersectionObserver' in window && !reduceMotion) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    revealEls.forEach(function (el) { revealObserver.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ---------- active navigation ---------- */
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav__link[href^="#"]'));
  var sectionMap = {
    top: '#top', about: '#top', features: '#features', philosophy: '#features',
    showcase: '#showcase', guide: '#guide', download: '#guide',
    developers: '#developers', opensource: '#developers'
  };
  function setActiveNav(hash) {
    navLinks.forEach(function (link) {
      var isActive = link.getAttribute('href') === hash;
      link.classList.toggle('is-active', isActive);
      if (isActive) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
  if ('IntersectionObserver' in window) {
    var navObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var hash = sectionMap[entry.target.id];
        if (hash) setActiveNav(hash);
      });
    }, { rootMargin: '-42% 0px -54% 0px', threshold: 0 });
    Object.keys(sectionMap).forEach(function (id) {
      var section = document.getElementById(id);
      if (section) navObserver.observe(section);
    });
  }

  /* =========================================================
     HERO PARTICLE TYPOGRAPHY
     Text is drawn into an offscreen canvas and sampled into
     particles; pointer pushes them away, springs pull them back.
     ========================================================= */
  (function particleHero() {
    var stage = document.getElementById('particle-stage');
    var canvas = document.getElementById('particle-canvas');
    if (!stage || !canvas || !canvas.getContext) return;

    var hero = document.getElementById('top');
    var ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    // Reduced motion: keep the static gradient headline, no animation.
    if (reduceMotion) return;

    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var W = 0, H = 0;
    var particles = [];
    var shapes = {};
    var currentShape = 'cn';
    var pointer = { x: -9999, y: -9999, active: false };
    var frame = 0;
    var raf = 0;
    var running = false;
    var inView = true;

    // colour ramp: cyan -> blue -> violet
    var RAMP = [
      [143, 216, 255], [127, 200, 255], [111, 173, 255],
      [111, 141, 255], [127, 132, 252], [148, 126, 250],
      [167, 139, 250], [178, 152, 250]
    ];
    var COLORS = RAMP.map(function (c) {
      return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
    });
    var COLORS_DIM = RAMP.map(function (c) {
      return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',.20)';
    });

    function offscreen() {
      var c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(W));
      c.height = Math.max(1, Math.round(H));
      return c;
    }

    /* sample rendered text into an array of {x,y} points */
    function sampleText(text, opts) {
      var oc = offscreen();
      var o = oc.getContext('2d');
      var family = opts.family;
      var targetW = W * opts.widthRatio;
      var size = Math.round(H * 0.42);
      o.font = '700 ' + size + 'px ' + family;
      var measured = o.measureText(text).width || 1;
      size = Math.max(40, Math.min(Math.round(size * targetW / measured), Math.round(H * 0.5)));
      o.font = '700 ' + size + 'px ' + family;
      o.textAlign = 'center';
      o.textBaseline = 'middle';
      o.fillStyle = '#fff';
      o.fillText(text, W / 2, H * opts.centerY);

      var data;
      try { data = o.getImageData(0, 0, oc.width, oc.height).data; }
      catch (e) { return []; }

      var step = opts.step;
      var pts = [];
      // jitter breaks the rigid sampling grid so the type reads as particles,
      // not as a dot-matrix display
      var j = step * 0.42;
      for (var y = 0; y < oc.height; y += step) {
        for (var x = 0; x < oc.width; x += step) {
          if (data[(y * oc.width + x) * 4 + 3] > 140) {
            pts.push({
              x: x + step / 2 + (Math.random() - 0.5) * j,
              y: y + step / 2 + (Math.random() - 0.5) * j
            });
          }
        }
      }
      return pts;
    }

    /* audio-wave shape: columns of dots with varying heights */
    function sampleWave() {
      var pts = [];
      var cols = Math.max(36, Math.round(W / 16));
      var per = Math.max(6, Math.round(W / cols / 4));
      var left = W * 0.07, right = W * 0.93;
      var cy = H * 0.40;
      for (var c = 0; c < cols; c++) {
        var t = c / (cols - 1);
        var x = left + t * (right - left);
        var envelope = 0.25 + 0.75 * Math.pow(Math.sin(Math.PI * t), 0.7);
        var wave = Math.abs(Math.sin(c * 0.31) * 0.55 + Math.sin(c * 0.11 + 1.2) * 0.45);
        var h = (0.12 + 0.88 * wave) * envelope * H * 0.20;
        for (var j = 0; j < per; j++) {
          var f = per === 1 ? 0.5 : j / (per - 1);
          pts.push({ x: x, y: cy + (f - 0.5) * 2 * h });
        }
      }
      return pts;
    }

    /* normalise any point cloud to exactly `count` points */
    function resample(pts, count) {
      if (!pts.length) pts = [{ x: W / 2, y: H * 0.4 }];
      var out = [];
      if (pts.length >= count) {
        for (var i = 0; i < count; i++) out.push(pts[Math.floor(i * pts.length / count)]);
      } else {
        for (var k = 0; k < count; k++) out.push(pts[k % pts.length]);
      }
      return out;
    }

    function buildShapes(count) {
      var narrow = W < 700;
      var cn = sampleText('泛音', {
        family: '"PingFang SC","Microsoft YaHei","Hiragino Sans GB",sans-serif',
        widthRatio: narrow ? 0.78 : 0.52,
        centerY: narrow ? 0.30 : 0.35,
        step: 5
      });
      var en = sampleText('OVERTONE', {
        family: '"JetBrains Mono","SFMono-Regular",Consolas,monospace',
        widthRatio: narrow ? 0.86 : 0.74,
        centerY: narrow ? 0.32 : 0.40,
        step: 5
      });
      var wv = sampleWave();
      shapes = {
        cn: resample(cn, count),
        en: resample(en, count),
        wave: resample(wv, count)
      };
    }

    function colorIndex(x) {
      var t = Math.min(1, Math.max(0, (x - W * 0.12) / (W * 0.76)));
      return Math.min(COLORS.length - 1, Math.floor(t * COLORS.length));
    }

    function makeParticles(count) {
      var pts = shapes[currentShape];
      particles = [];
      for (var i = 0; i < count; i++) {
        var p = pts[i];
        var angle = Math.random() * Math.PI * 2;
        var dist = 60 + Math.random() * Math.max(W, H) * 0.5;
        particles.push({
          x: p.x + Math.cos(angle) * dist,
          y: p.y + Math.sin(angle) * dist * 0.55,
          vx: 0, vy: 0,
          tx: p.x, ty: p.y,
          ci: colorIndex(p.x),
          delay: Math.floor((p.x / W) * 34 + Math.random() * 12),
          size: 1.5 + Math.random() * 1.1
        });
      }
    }

    function retarget(shape) {
      currentShape = shape;
      var pts = shapes[shape];
      particles.forEach(function (p, i) {
        p.tx = pts[i].x;
        p.ty = pts[i].y;
        p.ci = colorIndex(pts[i].x);
        var a = Math.random() * Math.PI * 2;
        var dx = p.x - W / 2;
        p.vx += Math.cos(a) * 2.2 - dx * 0.002;
        p.vy += Math.sin(a) * 2.2;
        p.delay = Math.floor((pts[i].x / W) * 16 + Math.random() * 6);
      });
      frame = 0;
    }

    function resize() {
      var rect = stage.getBoundingClientRect();
      W = rect.width;
      H = rect.height;
      if (!W || !H) return;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var count = W < 640 ? 1300 : (W < 1000 ? 2200 : 3200);
      buildShapes(count);
      if (particles.length !== count) {
        makeParticles(count);
      } else {
        var pts = shapes[currentShape];
        particles.forEach(function (p, i) {
          p.tx = pts[i].x; p.ty = pts[i].y; p.ci = colorIndex(pts[i].x);
        });
      }
      stage.classList.add('has-particles');
      document.documentElement.classList.add('particles-on');
      render();
    }

    /* ambient drifting dust */
    var dust = [];
    function buildDust() {
      var n = W < 640 ? 26 : 54;
      dust = [];
      for (var i = 0; i < n; i++) {
        dust.push({
          x: Math.random() * W, y: Math.random() * H,
          r: 0.5 + Math.random() * 1.1,
          s: 0.05 + Math.random() * 0.16,
          a: 0.12 + Math.random() * 0.28,
          ph: Math.random() * Math.PI * 2
        });
      }
    }

    function render() {
      ctx.clearRect(0, 0, W, H);

      for (var d = 0; d < dust.length; d++) {
        var s = dust[d];
        s.y -= s.s;
        if (s.y < -4) { s.y = H + 4; s.x = Math.random() * W; }
        ctx.fillStyle = 'rgba(170,200,255,' + (s.a * (0.7 + 0.3 * Math.sin(frame * 0.02 + s.ph))).toFixed(3) + ')';
        ctx.fillRect(s.x, s.y, s.r, s.r);
      }

      var spring = 0.028;
      var friction = 0.86;
      var radius = W < 640 ? 76 : 108;
      var push = W < 640 ? 2.0 : 2.7;

      var buckets = [];
      for (var c = 0; c < COLORS.length; c++) buckets.push([]);

      for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        if (frame >= p.delay) {
          p.vx += (p.tx - p.x) * spring;
          p.vy += (p.ty - p.y) * spring;

          if (pointer.active) {
            var dx = p.x - pointer.x;
            var dy = p.y - pointer.y;
            var dist2 = dx * dx + dy * dy;
            if (dist2 < radius * radius && dist2 > 0.01) {
              var dist = Math.sqrt(dist2);
              var f = (1 - dist / radius) * push;
              p.vx += (dx / dist) * f;
              p.vy += (dy / dist) * f;
            }
          }
          p.vx *= friction;
          p.vy *= friction;
          p.x += p.vx;
          p.y += p.vy;
        }
        buckets[p.ci].push(p);
      }

      for (var b = 0; b < buckets.length; b++) {
        var arr = buckets[b];
        if (!arr.length) continue;
        // two halo passes give the glyphs a soft electric bloom
        ctx.fillStyle = COLORS_DIM[b];
        for (var h = 0; h < arr.length; h += 3) {
          var q = arr[h];
          ctx.fillRect(q.x - 3.2, q.y - 3.2, 6.4, 6.4);
        }
        ctx.fillStyle = COLORS[b];
        for (var k = 0; k < arr.length; k++) {
          var p2 = arr[k];
          ctx.fillRect(p2.x - p2.size / 2, p2.y - p2.size / 2, p2.size, p2.size);
        }
        // sparse bright glints
        ctx.fillStyle = 'rgba(226,240,255,.85)';
        for (var g = 0; g < arr.length; g += 17) {
          var t = arr[g];
          ctx.fillRect(t.x - 0.6, t.y - 0.6, 1.2, 1.2);
        }
      }
      frame++;
    }

    function loop() {
      if (!running) return;
      render();
      raf = window.requestAnimationFrame(loop);
    }
    function start() {
      if (running || reduceMotion) return;
      running = true;
      loop();
    }
    function stop() {
      running = false;
      window.cancelAnimationFrame(raf);
    }

    /* pointer interaction (mouse + touch) */
    function movePointer(e) {
      var rect = stage.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.active = true;
    }
    hero.addEventListener('pointermove', movePointer, { passive: true });
    hero.addEventListener('pointerdown', movePointer, { passive: true });
    hero.addEventListener('pointerleave', function () { pointer.active = false; });
    hero.addEventListener('pointerup', function (e) {
      if (e.pointerType === 'touch') pointer.active = false;
    });
    window.addEventListener('scroll', function () {
      if (pointer.active) pointer.active = false;
    }, { passive: true });

    /* ---------- scroll-driven scenes (0xlei-style morphing) ---------- */
    var heroMulti = document.documentElement.classList.contains('hero-multi');
    var scenes = Array.prototype.slice.call(document.querySelectorAll('.hero__scene'));
    var shapeButtons = Array.prototype.slice.call(document.querySelectorAll('.shape'));
    var railNum = document.getElementById('hero-rail-num');
    var railFill = document.getElementById('hero-rail-fill');
    var scrollCue = document.getElementById('scroll-cue');
    var activeScene = -1;

    function syncShapeButtons(shape) {
      shapeButtons.forEach(function (b) {
        var on = b.getAttribute('data-shape') === shape;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }

    function setScene(index, shape) {
      if (index !== activeScene) {
        activeScene = index;
        scenes.forEach(function (s, i) { s.classList.toggle('is-active', i === index); });
        if (railNum) railNum.textContent = '0' + (index + 1);
      }
      if (railFill) railFill.style.height = ((index + 1) / 3 * 100) + '%';
      if (scrollCue) scrollCue.classList.toggle('is-hidden', index > 0);
      if (shape && shape !== currentShape) retarget(shape);
      if (shape) syncShapeButtons(shape);
    }

    function sceneFromScroll() {
      if (!heroMulti || !scenes.length) return;
      var rect = hero.getBoundingClientRect();
      var vh = window.innerHeight || 1;
      // hero is 3 viewports tall; the sticky stage stays pinned for 2 viewports
      var travel = Math.max(1, rect.height - vh);
      var passed = Math.min(travel, Math.max(0, -rect.top));
      var p = passed / travel;                 // 0 .. 1
      var idx = Math.min(2, Math.floor(p * 3 + 0.0001));
      var target = scenes[idx] ? scenes[idx].getAttribute('data-shape') : 'cn';
      setScene(idx, target);
    }

    // Manual shape buttons jump to the matching scene's scroll position.
    // Scenes are stacked in the sticky viewport, so their rect.top is always 0.
    shapeButtons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var shape = btn.getAttribute('data-shape');
        var idx = 0;
        scenes.forEach(function (s, i) { if (s.getAttribute('data-shape') === shape) idx = i; });
        if (heroMulti) {
          var rect = hero.getBoundingClientRect();
          var vh = window.innerHeight || 1;
          var travel = Math.max(1, rect.height - vh);
          var heroTop = window.scrollY + rect.top;
          var target = heroTop + ((idx + 0.5) / 3) * travel;
          window.scrollTo({ top: target, behavior: reduceMotion ? 'auto' : 'smooth' });
        } else {
          setScene(idx, shape);
        }
        start();
      });
    });

    var sceneTick = 0;
    window.addEventListener('scroll', function () {
      if (!heroMulti) return;
      if (sceneTick) return;
      sceneTick = window.requestAnimationFrame(function () {
        sceneTick = 0;
        sceneFromScroll();
      });
    }, { passive: true });

    /* only animate while hero is visible */
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (inView && !document.hidden) start(); else stop();
      }, { threshold: 0.02 });
      io.observe(hero);
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      else if (inView) start();
    });

    var resizeTimer = 0;
    window.addEventListener('resize', function () {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(function () {
        resize();
        buildDust();
      }, 160);
    });

    function init() {
      resize();
      buildDust();
      sceneFromScroll();
      start();
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(init).catch(init);
    } else {
      init();
    }
    window.setTimeout(function () {
      if (!particles.length) init();
      else { sceneFromScroll(); start(); }
    }, 1200);
    window.addEventListener('load', sceneFromScroll);
  })();

  /* =========================================================
     GALLERY FILTERS + LIGHTBOX
     ========================================================= */
  (function gallery() {
    var shots = Array.prototype.slice.call(document.querySelectorAll('.shot'));
    var filters = Array.prototype.slice.call(document.querySelectorAll('.filter'));
    var lightbox = document.getElementById('lightbox');
    var lbImg = document.getElementById('lightbox-img');
    var lbTitle = document.getElementById('lightbox-title');
    var lbDesc = document.getElementById('lightbox-desc');
    var lbCount = document.getElementById('lightbox-count');
    var current = 0;
    var lastTrigger = null;

    if (!shots.length || !lightbox) return;

    function visibleShots() {
      return shots.filter(function (s) { return !s.classList.contains('is-hidden'); });
    }
    function dataFor(shot) {
      var img = shot.querySelector('img');
      return {
        src: img.getAttribute('src'),
        alt: img.getAttribute('alt'),
        title: shot.querySelector('figcaption strong').textContent,
        desc: shot.querySelector('figcaption span').textContent
      };
    }
    function showAt(index) {
      var list = visibleShots();
      if (!list.length) return;
      current = (index + list.length) % list.length;
      var d = dataFor(list[current]);
      lbImg.src = d.src;
      lbImg.alt = d.alt;
      lbTitle.textContent = d.title;
      lbDesc.textContent = d.desc;
      lbCount.textContent = (current + 1) + ' / ' + list.length;
    }
    function open(shot, trigger) {
      var idx = visibleShots().indexOf(shot);
      if (idx < 0) return;
      lastTrigger = trigger;
      showAt(idx);
      lightbox.hidden = false;
      document.body.classList.add('lightbox-open');
      lightbox.querySelector('.lightbox__close').focus();
    }
    function close() {
      if (lightbox.hidden) return;
      lightbox.hidden = true;
      document.body.classList.remove('lightbox-open');
      lbImg.removeAttribute('src');
      if (lastTrigger) lastTrigger.focus();
    }

    filters.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var f = btn.getAttribute('data-filter');
        filters.forEach(function (b) {
          var on = b === btn;
          b.classList.toggle('is-active', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
        shots.forEach(function (s) {
          s.classList.toggle('is-hidden', f !== 'all' && s.getAttribute('data-cat') !== f);
        });
      });
    });

    shots.forEach(function (shot) {
      var btn = shot.querySelector('.shot__open');
      btn.addEventListener('click', function () { open(shot, btn); });
    });

    lightbox.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) { close(); return; }
      if (e.target.closest('[data-prev]')) { showAt(current - 1); return; }
      if (e.target.closest('[data-next]')) { showAt(current + 1); }
    });
    document.addEventListener('keydown', function (e) {
      if (lightbox.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); showAt(current - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); showAt(current + 1); }
      else if (e.key === 'Tab') {
        var focusables = Array.prototype.slice.call(
          lightbox.querySelectorAll('button')
        ).filter(function (el) { return el.offsetParent !== null; });
        var i = focusables.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); focusables[focusables.length - 1].focus(); }
        else if (!e.shiftKey && i === focusables.length - 1) { e.preventDefault(); focusables[0].focus(); }
      }
    });
  })();

  /* =========================================================
     获取方式弹窗 + 网盘渠道渲染
     Links are injected from the DOWNLOAD config above. Empty
     URLs render as a clearly-labelled placeholder, never a fake link.
     ========================================================= */
  (function downloadBox() {
    var box = document.getElementById('getbox');
    if (!box) return;

    var panWrap = document.getElementById('pan-links');
    var codeRow = document.getElementById('pan-code');
    var codeValue = document.getElementById('pan-code-value');
    var copyBtn = document.getElementById('pan-copy');
    var lastTrigger = null;

    /* render pan links from config */
    function renderPans() {
      panWrap.textContent = '';
      var available = (DOWNLOAD.pans || []).filter(function (p) { return p.url && p.url.trim(); });

      if (!available.length) {
        var empty = document.createElement('div');
        empty.className = 'pan-empty';
        empty.innerHTML = '<strong>网盘链接待补充</strong><br>作者尚未把分享地址填进来；' +
          '在此之前请用上方 GitHub 下载，或稍后再来看。';
        panWrap.appendChild(empty);
        codeRow.hidden = true;
        return;
      }

      available.forEach(function (p) {
        var a = document.createElement('a');
        a.className = 'pan-link';
        a.href = p.url;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';

        var name = document.createElement('span');
        name.className = 'pan-link__name';
        name.textContent = p.name;
        a.appendChild(name);

        if (p.code && p.code.trim()) {
          var code = document.createElement('span');
          code.className = 'pan-link__code';
          code.textContent = '提取码 ' + p.code.trim();
          a.appendChild(code);
        }

        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 16 16');
        svg.setAttribute('aria-hidden', 'true');
        svg.innerHTML = '<path d="M5 11 11 5M6 5h5v5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>';
        a.appendChild(svg);
        panWrap.appendChild(a);
      });

      var missing = (DOWNLOAD.pans || []).filter(function (p) { return !p.url || !p.url.trim(); });
      missing.forEach(function (p) {
        var s = document.createElement('span');
        s.className = 'pan-link is-pending';
        s.textContent = p.name + '（待补充）';
        panWrap.appendChild(s);
      });

      // 提取码已随各网盘渠道展示，全局那一行不再需要
      codeRow.hidden = true;
    }

    function open(trigger) {
      lastTrigger = trigger || null;
      box.hidden = false;
      document.body.classList.add('lightbox-open');
      box.querySelector('.getbox__close').focus();
    }
    function close() {
      if (box.hidden) return;
      box.hidden = true;
      document.body.classList.remove('lightbox-open');
      if (lastTrigger) lastTrigger.focus();
    }

    Array.prototype.slice.call(document.querySelectorAll('[data-open-download]')).forEach(function (btn) {
      btn.addEventListener('click', function () { open(btn); });
    });

    box.addEventListener('click', function (e) {
      if (e.target.closest('[data-get-close]')) close();
    });

    document.addEventListener('keydown', function (e) {
      if (box.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'Tab') {
        var focusables = Array.prototype.slice.call(
          box.querySelectorAll('a[href], button')
        ).filter(function (el) { return el.offsetParent !== null; });
        var i = focusables.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { e.preventDefault(); focusables[focusables.length - 1].focus(); }
        else if (!e.shiftKey && i === focusables.length - 1) { e.preventDefault(); focusables[0].focus(); }
      }
    });

    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var text = codeValue.textContent.trim();
        if (!text) return;
        function done() {
          copyBtn.textContent = '已复制';
          copyBtn.classList.add('is-done');
          window.setTimeout(function () {
            copyBtn.textContent = '复制';
            copyBtn.classList.remove('is-done');
          }, 1800);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(function () {
            copyBtn.textContent = '请手动复制';
          });
        } else {
          copyBtn.textContent = '请手动复制';
        }
      });
    }

    renderPans();
  })();

})();
