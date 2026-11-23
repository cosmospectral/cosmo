/* CoSMo project page: data-driven viewers. Data comes from assets/data.js (window.TIMBRE), written by the build script. */
(function () {
  const D = window.TIMBRE;
  let RATE = 1;

  // ---------- tiny DOM helper ----------
  function el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(c));
    return e;
  }
  const $ = (s, r = document) => r.querySelector(s);

  // ---------- synchronised video groups ----------
  // Every tile of a group is a display copy of the same length; all loop, and the first one is the clock the others follow.
  const groups = [];
  const io = new IntersectionObserver((ents) => {
    for (const en of ents) {
      const g = en.target._group; if (!g) continue;
      g.visible = en.isIntersecting;
      if (g.visible) g.start(); else g.pause();
    }
  }, { rootMargin: '120px 0px' });

  class Group {
    constructor(root, sync = true) { this.root = root; this.syncOn = sync; this.visible = false; this.token = 0; root._group = this; groups.push(this); io.observe(root); }
    vids() { return [...this.root.querySelectorAll('video')]; }
    refresh() { if (this.visible) this.start(); }
    start() {
      const vs = this.vids(), tok = ++this.token;
      vs.forEach((v) => {
        v.muted = true; v.playsInline = true; v.loop = true;
        if (!v.getAttribute('src') && v.dataset.src) { v.preload = 'auto'; v.src = v.dataset.src; }
        v.ontimeupdate = null;
      });
      this.master = this.syncOn ? vs.find((v) => !v.error) || null : null;
      if (this.master) this.master.ontimeupdate = () => this.sync();
      const ready = vs.map((v) => new Promise((res) => {
        if (v.readyState >= 3 || v.error) return res();
        const done = () => { v.removeEventListener('canplay', done); res(); };
        v.addEventListener('canplay', done); setTimeout(done, 2500);
      }));
      Promise.all(ready).then(() => { if (tok === this.token && this.visible) this.playAll(); });
    }
    playAll() {
      this.vids().forEach((v) => { if (v.error) return; try { v.currentTime = 0; } catch (e) {} v.playbackRate = RATE; v.play().catch(() => {}); });
    }
    sync() {
      const m = this.master; if (!m || m.paused) return; const t = m.currentTime, dur = m.duration || 0;
      for (const v of this.vids()) {
        if (v === m || v.error || v.paused || v.readyState < 2) continue;
        const d = Math.abs(v.currentTime - t);
        if (d > 0.2 && d < dur - 0.2) v.currentTime = t;      // near the loop point the two are close modulo the length
      }
    }
    pause() { this.token++; this.vids().forEach((v) => v.pause()); }
  }
  function group(root, sync) { return new Group(root, sync); }

  // ---------- prompt icon: bottom left of every generated video; hover (or tap) shows the prompt it was generated with ----------
  const PTEXT = D.ptext || [], PIDX = D.pidx || {};
  let tip = null, tipFor = null;
  function hideTip() { if (tip) tip.style.display = 'none'; tipFor = null; }
  function showTip(b, text) {
    if (!tip) { tip = el('div', { class: 'ptip', role: 'tooltip' }); document.body.append(tip); }
    tip.replaceChildren(el('b', {}, 'Prompt'), el('div', {}, text)); tip.style.display = 'block'; tipFor = b;
    const r = b.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + 'px';
    tip.style.top = (r.top - h - 8 >= 8 ? r.top - h - 8 : r.bottom + 8) + 'px';
  }
  addEventListener('scroll', hideTip, { passive: true });
  document.addEventListener('click', (e) => { if (tipFor && !e.target.closest('.pbtn')) hideTip(); });
  function pbtn(src) {
    const i = PIDX[src]; if (i == null) return null;
    const b = el('button', { class: 'pbtn', type: 'button', 'aria-label': 'show the prompt' });
    b.innerHTML = '<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M3 4h10M3 8h10M3 12h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" fill="none"/></svg>';
    b.addEventListener('mouseenter', () => showTip(b, PTEXT[i])); b.addEventListener('mouseleave', hideTip);
    b.addEventListener('focus', () => showTip(b, PTEXT[i])); b.addEventListener('blur', hideTip);
    b.addEventListener('click', (e) => { e.stopPropagation(); if (tipFor === b) hideTip(); else showTip(b, PTEXT[i]); });
    b.addEventListener('pointerdown', (e) => e.stopPropagation());
    return b;
  }

  // ---------- tiles ----------
  function vtile(src, tag, cls, ar, tgt) {
    if (!src) return el('figure', { class: 'tile missing ' + (cls || ''), style: `aspect-ratio:${ar || '16/9'}` });
    const v = el('video', { 'data-src': src, muted: true, playsinline: true, preload: 'none' });
    const f = el('figure', { class: 'tile ' + (cls || '') + (tgt ? ' has-tgt' : ''), style: `aspect-ratio:${ar || '16/9'}` }, v,
      tag ? el('span', { class: 'tag' }, tag) : null,
      tgt ? el('img', { class: 'tgt', src: tgt, loading: 'lazy', alt: 'target image', title: 'target image (hover to enlarge)' }) : null,
      tgt ? el('span', { class: 'tag tag-tgt' }, 'target image') : null, pbtn(src));
    if (tgt) {   // touch: press and hold to see the target image
      f.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') f.classList.add('peek'); });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => f.addEventListener(n, () => f.classList.remove('peek')));
    }
    f.addEventListener('click', () => { const g = f.closest('[data-group]')?._group; if (!g) return; if (v.paused) g.playAll(); else g.vids().forEach((x) => x.pause()); });
    return f;
  }
  // dump-section example labels (user 2026-11-17: "put labels of source target etc so i can tell u which example i want to put above")
  function dlab(id, text) { return el('div', { class: 'dlab' }, el('b', {}, id), text ? ' · ' + text : ''); }
  function itile(src, tag) {
    return el('figure', { class: 'tile src', style: 'aspect-ratio:16/9' }, src ? el('img', { src, loading: 'lazy', alt: tag || '' }) : null,
      tag ? el('span', { class: 'tag' }, tag) : null);
  }
  // source -> generated arrows on every example (user 2026-11-15)
  function tarrow(down) { const a = el('span', { class: 'tarrow' + (down ? ' down' : ''), 'aria-hidden': 'true' });
    a.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M3 12h16M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'; return a; }
  function flow(nIn, tiles, minw, cls) {   // the first nIn tiles are inputs, an arrow, then the outputs
    const s = el('div', { class: (cls || 'strip') + ' flow', style: `grid-template-columns:repeat(${nIn},minmax(0,1fr)) 26px repeat(${tiles.length - nIn},minmax(0,1fr))` },
      tiles.slice(0, nIn), tarrow(), tiles.slice(nIn));
    return minw ? el('div', { class: 'hscroll' }, el('div', { style: `min-width:${minw}px` }, s)) : s;
  }
  function strip(n, tiles, minw) {
    const s = el('div', { class: 'strip', style: `grid-template-columns:repeat(${n},minmax(0,1fr))` }, tiles);
    return minw ? el('div', { class: 'hscroll' }, el('div', { style: `min-width:${minw}px` }, s)) : s;
  }
  function heads(n, labels, lead) {
    return el('div', { class: 'colheads', style: `grid-template-columns:${lead ? lead + 'px ' : ''}repeat(${n},minmax(0,1fr))` },
      lead ? el('span') : null, labels.map((l) => el('span', {}, l)));
  }
  function cmpRow(label, tiles, ours, sub, n) {
    return el('div', { class: 'cmp' }, el('div', { class: 'rl' + (ours ? ' ours' : '') }, label, sub ? el('small', {}, sub) : null),
      strip(n || tiles.length, tiles));
  }
  function chips(items, cur, onpick) {
    const box = el('div', { class: 'chips' });
    items.forEach((it, i) => box.append(el('button', { class: 'chip' + (i === cur ? ' on' : ''), onclick: () => {
      [...box.children].forEach((c, j) => c.classList.toggle('on', j === i)); onpick(i);
    } }, it)));
    return box;
  }
  function thumbs(items, cur, onpick) {
    const box = el('div', { class: 'thumbs' });
    items.forEach((it, i) => box.append(el('button', { class: 'thumb' + (i === cur ? ' on' : ''), title: it.name, onclick: () => {
      [...box.children].forEach((c, j) => c.classList.toggle('on', j === i)); onpick(i);
    } }, it.thumb ? el('img', { src: it.thumb, alt: it.name }) : it.name)));
    return box;
  }
  function ctlRow(label, node) { return el('div', { class: 'row-ctl' }, el('span', { class: 'lab' }, label), node); }
  function tabs(names, onpick, cur = 0) {
    const box = el('div', { class: 'tabs' });
    names.forEach((n, i) => box.append(el('button', { class: 'tab' + (i === cur ? ' on' : ''), onclick: () => {
      [...box.children].forEach((c, j) => c.classList.toggle('on', j === i)); onpick(i);
    } }, n)));
    return box;
  }
  function stage(host, sync) { const s = el('div', { 'data-group': '' }); host.append(s); const g = group(s, sync); return { el: s, g }; }
  function set(st, ...nodes) { st.el.replaceChildren(...nodes.filter((x) => x != null)); st.g.refresh(); }
  function pager(n, per, onpage, unit) {
    const pages = Math.ceil(n / per); let p = 0;
    const info = el('span'); const prev = el('button', {}, '← Prev'); const next = el('button', {}, 'Next →');
    const upd = () => { info.textContent = (per === 1 ? `${p + 1}` : `${p * per + 1}–${Math.min(n, (p + 1) * per)}`) + ` of ${n}${unit ? ' ' + unit : ''}`; prev.disabled = p === 0; next.disabled = p >= pages - 1; onpage(p); };
    prev.onclick = () => { p--; upd(); }; next.onclick = () => { p++; upd(); };
    const box = el('div', { class: 'pager' }, prev, info, next); box.upd = (np) => { p = np || 0; upd(); }; return box;
  }


  // ---------- selection mode (open the page with ?edit): mark gallery examples to remove, then copy the list ----------
  const EDIT = /(^|[?&#])edit\b/.test(location.search.slice(1) + '&' + location.hash.slice(1));
  const PKEY = 'timbre-remove';
  let picked = new Map();
  try { picked = new Map(JSON.parse(localStorage.getItem(PKEY) || '[]')); } catch (e) {}
  { const live = new Set((D.gallery || []).map((g) => g.key)); for (const k of [...picked.keys()]) if (!live.has(k)) picked.delete(k);   // already removed
    try { localStorage.setItem(PKEY, JSON.stringify([...picked])); } catch (e) {} }
  let bar = null;
  function savePicked() { try { localStorage.setItem(PKEY, JSON.stringify([...picked])); } catch (e) {} if (bar) bar.upd(); }
  function pickable(g, card) {
    if (!EDIT) return card;
    card.classList.add('pickcard'); if (picked.has(g.key)) card.classList.add('picked');
    const b = el('button', { class: 'pickx', title: 'mark for removal', onclick: (e) => {
      e.stopPropagation();
      if (picked.has(g.key)) picked.delete(g.key); else picked.set(g.key, `${g.motion} → ${g.target}`);
      card.classList.toggle('picked', picked.has(g.key)); savePicked();
    } }, '✕');
    card.append(b); return card;
  }
  if (EDIT) {
    const n = el('span'), list = el('textarea', { class: 'picklist', readonly: true, rows: 4 });
    const copy = el('button', { onclick: () => {
      list.select(); let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      if (navigator.clipboard) navigator.clipboard.writeText(list.value).then(() => (copy.textContent = 'Copied'), () => {});
      copy.textContent = ok ? 'Copied' : 'Select the text and copy'; setTimeout(() => (copy.textContent = 'Copy list'), 1500);
    } }, 'Copy list');
    const clear = el('button', { onclick: () => { if (!confirm('Unmark every example?')) return; picked.clear(); savePicked();
      document.querySelectorAll('.pickcard.picked').forEach((c) => c.classList.remove('picked')); } }, 'Clear');
    bar = el('div', { class: 'pickbar' }, el('div', { class: 'pickrow' }, el('b', {}, 'Selection mode'), n, copy, clear), list);
    bar.upd = () => { n.textContent = `${picked.size} marked for removal`;
      list.value = [...picked].map(([k, c]) => `${k}\t${c}`).join('\n'); list.style.display = picked.size ? '' : 'none'; };
    document.body.append(bar); bar.upd();
  }

  // ---------- teaser ----------
  (function teaser() {
    const host = $('#teaser-stage'); if (!host) return; const T = D.teaser; const st = stage(host); const cap = $('#teaser-cap');
    const caps = [
      'Transfer: the motion code of a video makes a still image perform the same motion, with the target\'s own body. The generator sees only the code, never the source video. The prompt is written for the target image: it describes only the image\'s appearance, never the movement, followed by the fixed sentence "an articulated motion, high quality".',
      'Interpolate/Composition: blending the codes of two motions A and B with weight w turns one motion into the other: a squat into a jumping jack, and a sway into an arm raise.',
      'Coarse to fine: the code of a motion keeps only its lowest k of 16 bands. For the workout move, the low bands give the dancer\'s steps and the full code adds the arm raises at the source\'s timing. Below it, a two-step motion (kneel, then stand and wave) on a beach crab, and a cartwheel: 2 bands only lean and reach up, 4 add a deep bend with a kick, and all 16 do the whole cartwheel.',
      'Intensity: moving a code along the direction that separates still training clips from very active ones turns the motion down (α < 0) or up (α > 0) while keeping what it is: a jumping jack, and a two-step motion (step-clap twice, then sway) on a paper boy.',
      'Sample: new motions with no source video. Top: four codes drawn at random from a Gaussian fitted to the training codes, applied to the same image. Bottom: two codes from novelty search and two Gaussian draws, on different bodies; ν is a code\'s novelty, 1 − its mean cosine to the three nearest training codes (training median 0.32).'];
    const views = [
      // source -> arrow -> generated in each pair, a rule between the left and right pairs (user 2026-11-15)
      () => el('div', { class: 'gal tgal' }, T.transfer.map((t) => el('div', {},
        el('div', { class: 'tpair' }, vtile(t.src, 'source', 'src'), tarrow(), vtile(t.out, 'generated', 'ours'))))),
      // squat -> jumping jack, Figure 5's sway -> raise arms on the ballet dancer (user 2026-11-17)
      () => el('div', {}, [[T.interp, 'squat', 'jumping jack'], [T.interp2, T.interp2.an, T.interp2.bn]].map(([I, an, bn], k) => el('div', k ? { style: 'border-top:1px solid var(--line);margin-top:16px;padding-top:16px' } : {},
        el('div', { style: 'display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:8px' },
          vtile(I.a, 'A: ' + an, 'src'), vtile(I.b, 'B: ' + bn, 'src'), itile(I.target, 'target image')),
        tarrow(true), strip(5, I.outs.map((o, i) => vtile(o, 'w = ' + I.ws[i], 'ours')))))),
      // workout move, the two-step grid's 'kneel, then stand and wave' on the beach crab, Figure 5's cartwheel (user 2026-11-17)
      () => el('div', {}, [T.c2f, T.c2f2, T.c2f3].map((C, k) => el('div', k ? { style: 'border-top:1px solid var(--line);margin-top:16px;padding-top:16px' } : {},
        flow(1, [vtile(C.src, 'source', 'src')].concat(C.outs.map((o, i) => vtile(o, `bands k < ${C.ks[i]}`, 'ours'))))))),
      // jumping jack, then the supp intensity row C6_H07 -> paper boy (user 2026-11-17)
      () => el('div', {}, [T.intensity, T.intensity2].filter(Boolean).map((I, k) => el('div', k ? { style: 'border-top:1px solid var(--line);margin-top:16px;padding-top:16px' } : {},
        flow(1, [vtile(I.src, 'source', 'src')].concat(I.outs.map((o, i) => vtile(o, 'α = ' + I.alphas[i].replace('-', '−'), 'ours'))))))),
      // four Gaussian draws on one image, then Figure 5's new motions (user 2026-11-17)
      () => el('div', {}, strip(4, T.sample.map((o, i) => vtile(o, 'sample ' + (i + 1), 'ours'))),
        T.sample2 ? el('div', { style: 'border-top:1px solid var(--line);margin-top:16px;padding-top:16px' }, strip(4, T.sample2.map((x) => vtile(x.v, x.tag, 'ours')))) : null),
    ];
    const show = (i) => { set(st, views[i]()); cap.textContent = caps[i]; };
    $('#teaser-tabs').append(tabs(['Transfer', 'Interpolate/Composition', 'Coarse to fine', 'Intensity', 'Sample'], show)); show(0);
  })();

  // ---------- transfer gallery ----------
  (function gallery() {
    // one card per transfer, alphabetical by source motion name; every source video's transfers sit next to each other
    const host = $('#gallery'); if (!host) return; const PER = 12, ALL = D.gallery;
    const num = new Map(ALL.map((g, i) => [g, 'T' + (i + 1)]));   // IDs stay the same whatever the filter
    // user 2026-11-17: filter by what the source and the target are (gallery_categories.json in the builder)
    const CATS = [['', 'All'], ['humanoid', 'Humanoid'], ['animal', 'Animal'], ['object', 'Object'], ['other', 'Other']];
    let sc = '', tc = '', G = ALL;
    const ctl = el('div', { class: 'ctrls' }); host.append(ctl); const st = stage(host);
    // user 2026-11-17: no DisMo here; the harder motion grid's DisMo results are in More comparisons with DisMo
    const render = (p) => set(st, G.length ? el('div', { class: 'gal two' }, G.slice(p * PER, (p + 1) * PER).map((g) =>
      pickable(g, el('div', {}, flow(1, [vtile(g.src, 'source', 'src'), vtile(g.out, 'generated', 'ours', null, g.tgt)], 0, 'pair'),
        dlab(num.get(g), `${g.motion} → ${g.target}`))))) : el('p', { class: 'note' }, 'No transfers with this source and target.'));
    let pg = pager(G.length, PER, render); host.after(pg);
    const refilter = () => { G = ALL.filter((g) => (!sc || g.sc === sc) && (!tc || g.tc === tc));
      const np = pager(G.length, PER, render); np.style.display = G.length ? '' : 'none'; pg.replaceWith(np); pg = np; pg.upd(0); };
    ctl.append(ctlRow('Source', chips(CATS.map(([, n]) => n), 0, (i) => { sc = CATS[i][0]; refilter(); })),
      ctlRow('Target', chips(CATS.map(([, n]) => n), 0, (i) => { tc = CATS[i][0]; refilter(); })));
    pg.upd(0);
  })();

  // ---------- main section, Motion Transfer: the user's picks from the gallery (build.py: hl_transfer.json), same cards, labels MT# ----------
  (function hlTransfer() {
    const host = $('#hl-gal'); if (!host || !D.hl || !D.hl.transfer) return; const PER = 4;   // user 2026-11-20: 4 per page, 2 per row (was 12)
    const byk = new Map(D.gallery.map((g) => [g.key, g]).concat(Object.entries(D.hl.tx || {}))); const G = D.hl.transfer.map((k) => byk.get(k)).filter(Boolean);
    const st = stage(host);
    const render = (p) => set(st, el('div', { class: 'gal two', style: 'gap:28px 22px' }, G.slice(p * PER, (p + 1) * PER).map((g, k) =>
      el('div', {}, flow(1, [vtile(g.src, 'source', 'src'), vtile(g.out, 'generated', 'ours', null, g.tgt)], 0, 'pair'),
        dlab('MT' + (p * PER + k + 1), '')))));   // user 2026-11-20: no 'motion → target' caption, only the MT# id
    const pg = pager(G.length, PER, render); host.after(pg); pg.upd(0);
  })();

  const MLAB = { text: 'Text prompt', flexiact: 'FlexiAct', dismo: 'DisMo', ours: 'Ours' };

  // ---------- the motion is adapted to the target (Fig. 3) ----------
  (function adapt() {
    const host = $('#adapt'); if (!host) return; const Q = D.quant;
    Q.fig3.forEach((f, fi) => {
      const st = stage(host);
      set(st, el('div', { style: 'height:14px' }),
        flow(1, [vtile(f.src, 'source', 'src')].concat(Q.methods.map(([k]) => vtile(f.have[k], MLAB[k], k === 'ours' ? 'ours' : ''))), 760),
        dlab('F' + (fi + 1), `${f.motion} → ${f.name}`));
    });
  })();

  // ---------- quantitative set browser ----------
  (function quant() {
    const host = $('#quant'); if (!host) return; const Q = D.quant; let mi = 0, ti = 0;
    const ctl = el('div', { class: 'ctrls' }); host.append(ctl); const st = stage(host);
    const draw = () => {
      const m = Q.motions[mi], p = m.pairs[ti];
      set(st, flow(2, [vtile(m.src, 'source', 'src'), itile(`img/t/q_${p.image}.jpg`, 'target')]
          .concat(Q.methods.map(([k]) => vtile(p.have[k], MLAB[k], k === 'ours' ? 'ours' : ''))), 900),
        dlab(`Q${mi + 1}.${ti + 1}`, `${m.name} → ${p.name}`));
    };
    const mkThumbs = () => thumbs(Q.motions[mi].pairs.map((p) => ({ name: p.name, thumb: `img/t/q_${p.image}.jpg` })), ti, (i) => { ti = i; draw(); });
    let tbox = mkThumbs();
    ctl.append(ctlRow('Motion', chips(Q.motions.map((m) => m.name), mi, (i) => { mi = i; const nb = mkThumbs(); tbox.replaceWith(nb); tbox = nb; draw(); })),
      ctlRow('Target', tbox));
    draw();
  })();

  // ---------- more comparisons with DisMo ----------
  (function more() {
    const host = $('#more'); if (!host) return; const sets = [D.more.e7, D.more.c2, D.more.c3, D.more.pairs || [], D.more.hard || []], PER = 8; const st = stage(host); let cur = 0;
    const render = (p) => set(st, el('div', { class: 'gal two' }, sets[cur].slice(p * PER, (p + 1) * PER).map((g, k) => el('div', {},
      flow(1, [vtile(g.src, 'source', 'src'), vtile(g.dismo, 'DisMo'), vtile(g.ours, 'ours', 'ours')], 0, 'trip'),
      dlab(`D${cur + 1}-${p * PER + k + 1}`, `${g.motion} → ${g.target}`)))));
    let pg = pager(sets[0].length, PER, render); host.after(pg);
    $('#more-tabs').append(tabs([`Curated set (${sets[0].length})`, `New source videos (${sets[1].length})`, `Non-humanoid sources (${sets[2].length})`, `Real-video pairs (${sets[3].length})`, `Harder motions (${sets[4].length})`], (i) => {
      cur = i; const npg = pager(sets[i].length, PER, render); pg.replaceWith(npg); pg = npg; pg.upd(0);
    }));
    pg.upd(0);
  })();

  // ---------- A/B pair viewers (interpolation, subtraction, band exchange) ----------
  function darrowRow() { return el('div', { class: 'cmp darrow' }, el('div'), tarrow(true)); }
  function pairViewer(host, blk, opt) {
    let pi = 0, ti = 0; const ctl = el('div', { class: 'ctrls' }); host.append(ctl); const st = stage(host);
    const draw = () => {
      const p = blk.pairs[pi], t = p.targets ? p.targets[ti] : null; const n = opt.cols(p);
      const top = el('div', { class: 'cmp', style: 'margin-bottom:12px' }, el('div', { class: 'rl' }, 'Sources'),
        strip(n, [vtile(p.a, 'A: ' + p.ma, 'src'), vtile(p.b, 'B: ' + p.mb, 'src')]));
      const rows = opt.rows(p, t);
      set(st, el('div', { class: 'hscroll' }, el('div', { style: `min-width:${Math.min(820, 74 + n * 170)}px;max-width:${74 + n * 215}px` }, top, darrowRow(), heads(n, opt.heads(p), 74),
        rows.map(([lab, tiles, ours, sub]) => cmpRow(lab, tiles, ours, sub)))),
        dlab(`${opt.idp || 'P'}${pi + 1}${t ? '.' + (ti + 1) : ''}`, `A: ${p.ma} · B: ${p.mb} → ${t ? t.name : (p.target || '')}`),
        opt.caption ? el('div', { class: 'cap' }, opt.caption(p, t)) : null);
    };
    const mkThumbs = () => blk.pairs[pi].targets ? thumbs(blk.pairs[pi].targets, ti, (i) => { ti = i; draw(); }) : el('span', { class: 'note' }, blk.pairs[pi].target || '');
    let tbox = mkThumbs();
    ctl.append(ctlRow(opt.pairLabel || 'Pair', chips(blk.pairs.map(opt.chip), pi, (i) => { pi = i; ti = 0; const nb = mkThumbs(); tbox.replaceWith(nb); tbox = nb; draw(); })),
      ctlRow('Target', tbox));
    draw();
  }

  (function interp() {
    const host = $('#interp'); if (!host) return;
    const gen = el('div'), real = el('div', { style: 'display:none' }), cur = el('div', { id: 'interp-cur', style: 'display:none' }); host.append(gen, real, cur);
    const n = D.x ? D.x.cinterp.length : 0;
    $('#interp-tabs').append(tabs(['Generated motion pairs', 'Real videos', `Curated-set pairs (${n})`], (i) => {
      [gen, real, cur].forEach((p, j) => (p.style.display = i === j ? '' : 'none')); }));
    const I = D.interp;
    pairViewer(gen, I, { idp: 'I',
      cols: () => 5, heads: () => I.ops.map((w) => 'w = ' + w),
      chip: (p) => p.kind === 'composition' ? `${p.ma} + ${p.mb}` : `${p.ma} → ${p.mb}`,
      rows: (p, t) => [['Ours', t.ours.map((v) => vtile(v, null, 'ours')), true], ['DisMo', t.dismo.map((v) => vtile(v))]],
      caption: (p) => p.kind === 'composition' ? 'Composition pair: B adds a second movement to A; in-betweens should combine the two.'
        : 'Transition pair: in-betweens should move steadily from motion A to motion B.',
    });
    const R = D.rinterp;
    pairViewer(real, R, { idp: 'R',
      cols: () => 5, heads: () => R.ops.map((w) => 'w = ' + w), chip: (p) => `${p.ma} → ${p.mb}`,
      rows: (p) => [['Ours', p.ours.map((v) => vtile(v, null, 'ours')), true]].concat(p.dismo ? [['DisMo', p.dismo.map((v) => vtile(v))]] : []),
      caption: (p) => (p.dismo ? '' : 'No DisMo run for this pair.'),
    });
  })();

  // ---------- main section, Interpolation / Composition: the user's picks from the dump's interpolation tab, ours only (build.py: hl_interp.json), labels MI# ----------
  (function hlInterp() {
    const host = $('#hl-int'); if (!host || !D.hl || !D.hl.interp) return; const PER = 4;
    const resolve = (k) => {
      if (k.set === 'gen') {
        const p = D.interp.pairs.find((q) => q.pair === k.pair), t = p && p.targets.find((q) => q.image === k.image);
        if (t && k.tab === 'comp') {   // user 2026-11-21: a generated pair shown as a composition (A alone = w 0, B alone = w 1, A + B = w 0.5)
          const g = (w) => t.ours[D.interp.ops.indexOf(w)];
          return { name: `${p.ma} + ${p.mb} → ${t.name}`, srcs: [[p.a, 'A: ' + p.ma], [p.b, 'B: ' + p.mb], [t.thumb, 'target image']], heads: ['A alone', 'B alone', 'A + B'], ours: [g('0'), g('1'), g('0.5')] };
        }
        return t && { name: `${p.ma} ${p.kind === 'composition' ? '+' : '→'} ${p.mb} · ${t.name}`, srcs: [[p.a, 'A: ' + p.ma], [p.b, 'B: ' + p.mb], [t.thumb, 'target image']],
          heads: D.interp.ops.map((w) => 'w = ' + w), ours: t.ours, kind: p.kind };
      }
      if (k.set === 'hard' || k.set === 'ip2') return { name: k.name, srcs: k.srcs, heads: k.heads, ours: k.ours };   // hard-grid (2026-11-20) and Clear Interpolation Pairs (ip2, 2026-11-21) picks, filled in by build.py
      if (k.set === 'real') {
        const p = D.rinterp.pairs[k.i];
        return p && { name: `${p.ma} → ${p.mb}`, srcs: [[p.a, 'A: ' + p.ma], [p.b, 'B: ' + p.mb]], heads: D.rinterp.ops.map((w) => 'w = ' + w), ours: p.ours };
      }
      // plus / comp (Motion Arithmetic, Composing motions / More compositions): an interpolation A (w 0) - A + B (w 0.5) - B (w 1), plus the
      // rendered w 0.25 / 0.75 (k.q, build.py) when they exist
      if (k.set === 'plus' || k.set === 'comp') {
        let A, B, AB, srcs;
        if (k.set === 'plus') { const it = D.ov && D.ov.plus[k.i], r = it && it.rows.find((q) => q[1]); if (!r) return null;
          AB = r[2].map((q) => (Array.isArray(q) ? q[0] : q))[0]; [A, B] = it.alone || [null, null]; srcs = it.srcs; }
        else { const r = D.supp && D.supp.comp[k.i]; if (!r) return null; [A, B, AB] = r.v.slice(2); srcs = [[r.v[0], 'A'], [r.v[1], 'B']]; }
        const q = k.q || [null, null], cols = (k.tab === 'comp' ? [[A, 'A alone'], [B, 'B alone'], [AB, 'A + B']]   // Composition tab (user 2026-11-20)
          : [[A, 'w = 0'], [q[0], 'w = 0.25'], [AB, 'w = 0.5'], [q[1], 'w = 0.75'], [B, 'w = 1']]).filter((c) => c[0]);
        if (k.tab === 'comp') return { name: k.name.replace(' → ', ' + ').replace(' · ', ' → '), srcs, heads: cols.map((c) => c[1]), ours: cols.map((c) => c[0]) };
        return { name: k.name, srcs: k.tgt ? srcs.concat([[k.tgt, 'target image']]) : srcs, heads: cols.map((c) => c[1]), ours: cols.map((c) => c[0]) };   // + target image (interpolation tab only)
      }
      const it = D.x && D.x.cinterp[k.i], r = it && it.rows.find((q) => q[1]);
      if (r && k.tab === 'comp') {   // user 2026-11-21: a curated pair shown as a composition (A alone = w 0, B alone = w 1, A + B = w 0.5)
        const g = (w) => (r[2].find((q) => q[1] === 'w = ' + w) || [null])[0];
        return { name: `${it.name.replace(' → ', ' + ')} → ${(it.cap || '').replace(/^on /, '')}`, srcs: it.srcs, heads: ['A alone', 'B alone', 'A + B'], ours: [g('0'), g('1'), g('0.5')] };
      }
      return r && { name: it.name, srcs: it.srcs, heads: r[2].map((q) => q[1]), ours: r[2].map((q) => q[0]) };
    };
    // user 2026-11-19: separate Interpolation (MI#) and Composition (MC#) sections
    const B = D.hl.interp.map((k) => { const b = resolve(k); return b && Object.assign(b, { comp: k.tab === 'comp' }); }).filter(Boolean);   // user 2026-11-19: every pick is an interpolation unless marked tab 'comp'
    const block = (b, i, pre) => { const n = Math.max(b.ours.length, b.srcs.length); return el('div', { style: 'margin-bottom:30px' },
      el('div', { class: 'hscroll' }, el('div', { style: `min-width:${Math.min(820, 74 + n * 170)}px;max-width:${74 + n * 215}px` },
        el('div', { class: 'cmp', style: 'margin-bottom:12px' }, el('div', { class: 'rl' }, 'Sources'), strip(n, b.srcs.map(([v, l]) => (/\.jpg$/.test(v || '') ? itile(v, l) : vtile(v, l, 'src'))))),
        darrowRow(), heads(n, b.heads, 74), cmpRow('Ours', b.ours.map((v) => vtile(v, null, 'ours')), true, null, n))),
      dlab(pre + (i + 1), '')); };   // user 2026-11-21: Interpolation and Composition show only the MI# / MC# id, no caption
    const section = (h, L, pre, per = PER) => {
      if (!h || !L.length) return; const st = stage(h);
      const render = (p) => set(st, ...L.slice(p * per, (p + 1) * per).map((b, k) => block(b, p * per + k, pre)));
      if (L.length > per) { const pg = pager(L.length, per, render); h.after(pg); pg.upd(0); } else render(0);
    };
    section(host, B.filter((b) => !b.comp), 'MI', 2); section($('#hl-comp'), B.filter((b) => b.comp), 'MC', 2);   // user 2026-11-20: Interpolation 2 per page; 2026-11-21: Composition 2 per page too
  })();

  // user 2026-11-19: main section Frequency Bands = the user's picks from the dump (coarse to fine L# / LM#), ours only, labels MB#
  (function hlBands() {
    const host = $('#hl-band'); if (!host || !D.hl || !D.hl.bands) return; const PER = 2;   // user 2026-11-21: 2 per page (was 6)
    const KS = ['bands k < 2', 'bands k < 4', 'bands k < 8', 'all 16 bands'];
    const B = D.hl.bands.map((k) => {
      if (k.set === 'lod') { const it = D.lod.items[k.i]; return it && { name: `${it.name} → ${it.target}`, src: it.src, outs: it.outs,
        labs: D.lod.ks.map((q) => (q === 16 ? 'all 16 bands' : `bands k < ${q}`)) }; }
      const r = D.supp && D.supp.lod[k.i]; return r && { name: r.cap, src: r.v[0], outs: r.v.slice(1), labs: KS };
    }).filter(Boolean);
    const st = stage(host);
    const render = (p) => set(st, ...B.slice(p * PER, (p + 1) * PER).map((b, i) => el('div', { style: 'margin-bottom:26px' },
      flow(1, [vtile(b.src, 'source', 'src')].concat(b.outs.map((o, j) => vtile(o, b.labs[j], 'ours'))), 760), dlab('MB' + (p * PER + i + 1), ''))));   // user 2026-11-21: id only, no caption
    if (B.length > PER) { const pg = pager(B.length, PER, render); host.after(pg); pg.upd(0); } else render(0);
  })();

  // user 2026-11-19: main section Intensity / Knobs = the user's picks from the dump (intensity A# / IM#), ours only, labels MK#
  (function hlKnobs() {
    const host = $('#hl-knob'); if (!host || !D.hl || !D.hl.knobs) return; const PER = 2;   // user 2026-11-21: 2 per page (was 6)
    const AL = ['α = −2', 'α = −1', 'α = 0', 'α = +1', 'α = +2'];
    const B = D.hl.knobs.map((k) => {
      if (k.set === 'int') { const it = D.intensity.items[k.i]; return it && { name: `${it.name} → ${it.target}`, src: it.src, outs: it.outs,
        labs: D.intensity.alphas.map((a) => 'α = ' + a.replace('-', '−')) }; }
      const r = D.supp && D.supp.int[k.i]; return r && { name: r.cap, src: r.v[0], outs: r.v.slice(1), labs: AL };
    }).filter(Boolean);
    const st = stage(host);
    const render = (p) => set(st, ...B.slice(p * PER, (p + 1) * PER).map((b, i) => el('div', { style: 'margin-bottom:26px' },
      flow(1, [vtile(b.src, 'source', 'src')].concat(b.outs.map((o, j) => vtile(o, b.labs[j], 'ours'))), 760), dlab('MK' + (p * PER + i + 1), ''))));   // user 2026-11-21: id only, no caption
    if (B.length > PER) { const pg = pager(B.length, PER, render); host.after(pg); pg.upd(0); } else render(0);
  })();

  // user 2026-11-19: main section Multi-Length Generation = the user's picks from the dump's Any video length viewer, labels MLn;
  // each clip plays at its own length (no shared clock)
  (function hlLength() {
    const host = $('#hl-len'); if (!host || !D.hl || !D.hl.length || !D.x) return; const PER = 2;   // user 2026-11-21: 2 per page (was 6)
    const B = D.hl.length.map((k) => { const it = D.x.lengths[k.i], r = it && it.rows.find((q) => q[1]);
      return r && { name: it.name, src: it.srcs[0][0], outs: r[2] }; }).filter(Boolean);
    const st = stage(host, false);
    const render = (p) => set(st, ...B.slice(p * PER, (p + 1) * PER).map((b, i) => el('div', { style: 'margin-bottom:26px' },
      flow(1, [vtile(b.src, 'source', 'src')].concat(b.outs.map(([o, l]) => vtile(o, l, 'ours'))), 760), dlab('ML' + (p * PER + i + 1), ''))));   // user 2026-11-21: id only, no caption
    if (B.length > PER) { const pg = pager(B.length, PER, render); host.after(pg); pg.upd(0); } else render(0);
  })();

  // user 2026-11-20: main section Novel Motions = picks from the dump's 'One sampled code, five bodies' (chosen bodies only), labels MN#
  (function hlNovel() {
    // user 2026-11-20: three separated groups: one code on several bodies (MN1-3), novelty search, Gaussian samples (rows of 5); labels MN# in page order
    const host = $('#hl-nov'); if (!host || !D.hl || !D.hl.novel || !D.novel) return; const N = D.novel; const st = stage(host);
    const P = D.hl.novel, sh = P.filter((k) => k.set === 'shared');
    const sm = (s) => P.filter((k) => (k.set === 'samp' && D.supp && D.supp.samples[k.i] && D.supp.samples[k.i].set === s) || (k.set === 's9' && k.method === s));   // s9: Fig. S9 renders (2026-11-21)
    const nov = sm('novelty search'), gau = sm('Gaussian'), uni = sm('unique'); let n = 0;
    const row = (L) => el('div', { style: 'margin-bottom:10px' }, strip(Math.max(5, L.length), L.map((k) => {   // 5-column grid (2026-11-21)
      const v = k.set === 's9' ? k.v : D.supp.samples[k.i].v[0];
      return el('div', {}, vtile(v, null, 'ours'), dlab('MN' + (++n), '')); }), 900));   // user 2026-11-21: id only, no caption
    // user 2026-11-21 ("its too long"): the three groups as sub-tabs, one shown at a time (wired by the .subtabs handler below)
    const tabs = [], panes = [];
    const pane = (id, label, note, ...kids) => { tabs.push(el('button', { class: 'rtab', role: 'tab', 'data-sub': id }, label));
      panes.push(el('div', { id, role: 'tabpanel' }, el('p', { class: 'note', style: 'margin:0 0 14px' }, note), ...kids)); };
    if (sh.length) pane('hln-shared', 'One code, several bodies', 'The same sampled code applied to different target images.',
      ...sh.map((k) => { const sc = N.shared[k.i]; return el('div', { style: 'margin-bottom:22px' },
        strip(5, k.bodies.map((j) => vtile(sc.outs[j], N.bodies[j], 'ours')), 900), dlab('MN' + (++n), '')); }));
    if (nov.length) pane('hln-nov', 'Novelty search', 'Codes searched to lie far from every training motion while staying in the part of the code space the model knows.', row(nov));
    if (gau.length) pane('hln-gau', 'Gaussian samples', 'Codes drawn at random from a Gaussian fitted to the training codes.', row(gau));
    // user 2026-11-21: a fourth tab with the most distinctive codes from two other searches (not in the paper; named as such)
    if (uni.length) pane('hln-uni', 'More unique motions', 'Two further ways of finding new codes: MAP-Elites, which fills combinations of motion amount, tempo and vertical movement that no training motion has, and caricature, which exaggerates how a motion differs from its nearest typical motions.', row(uni));
    set(st, el('div', { class: 'rtabs subtabs', role: 'tablist', 'aria-label': 'Novel motion groups', style: `grid-template-columns:repeat(${tabs.length},minmax(0,1fr));margin:6px 0 22px` }, ...tabs), ...panes);
  })();

  // user 2026-11-19: main section Baseline Comparisons, Motion Transfer with all baselines (ours on CogVideoX only), labels BA#
  (function hlBaseAll() {
    // user 2026-11-22: two comparisons per page, with page buttons (as Comparison with DisMo)
    const host = $('#hl-bt-all'); if (!host || !D.hl || !D.hl.base_all) return; const st = stage(host); const L = D.hl.base_all, PER = 2;
    const row = (b, i) => el('div', { style: 'margin-bottom:26px' },
      flow(1, [vtile(b.src, 'source', 'src'), itile(b.tgt, 'target'), vtile(b.text, 'Text prompt'), vtile(b.flexiact, 'FlexiAct'), vtile(b.dismo, 'DisMo'),
        vtile(b.cog, 'Ours (CogVideoX)', 'ours')], 900), dlab('BA' + (i + 1), ''));
    const render = (p) => set(st, ...L.slice(p * PER, (p + 1) * PER).map((b, k) => row(b, p * PER + k)));
    if (L.length > PER) { const pg = pager(L.length, PER, render); host.after(pg); pg.upd(0); } else render(0);
  })();

  // user 2026-11-19: Baseline Comparisons, DisMo / Text: Transfer (ours on CogVideoX), labels BD#
  (function hlBaseDT() {
    const host = $('#hl-bt-dt'); if (!host || !D.hl || !D.hl.base_dt) return; const st = stage(host);
    set(st, ...D.hl.base_dt.map((b, i) => el('div', { style: 'margin-bottom:26px' },
      flow(1, [vtile(b.src, 'source', 'src'), itile(b.tgt, 'target'), vtile(b.text, 'Text prompt'), vtile(b.dismo, 'DisMo'), vtile(b.cog, 'Ours (CogVideoX)', 'ours')], 820),
      dlab('BD' + (i + 1), ''))));
  })();

  // user 2026-11-20: Baseline Comparisons > Comparison with DisMo: ours on Wan2.2 vs DisMo as released (Rare Sources run), labels BR#
  (function hlBaseRel() {
    // user 2026-11-20: two comparisons per page, with page buttons to go forward and back
    const host = $('#hl-rel'); if (!host || !D.hl || !D.hl.base_rel) return; const st = stage(host); const L = D.hl.base_rel, PER = 2;
    const row = (b, i) => el('div', { style: 'margin-bottom:26px' },
      flow(1, [vtile(b.src, 'source', 'src'), itile(b.tgt, 'target'), vtile(b.dismo, 'DisMo'), vtile(b.ours, 'Ours', 'ours')], 700),
      dlab('BR' + (i + 1), ''));
    const render = (p) => set(st, ...L.slice(p * PER, (p + 1) * PER).map((b, k) => row(b, p * PER + k)));
    if (L.length > PER) { const pg = pager(L.length, PER, render); host.after(pg); pg.upd(0); } else render(0);
  })();

  // user 2026-11-19: main section Baseline Comparisons, Interpolation: DisMo vs ours on CogVideoX at w .25 / .5 / .75, labels BN#
  (function hlBaseInterp() {
    // user 2026-11-22: paged like the other sections, one example per page; no file-name labels (A / B only, bare BN#)
    const host = $('#hl-bi'); if (!host || !D.hl || !D.hl.base_interp) return; const st = stage(host); const L = D.hl.base_interp, PER = 1;
    const row = (b, i) => { const n = b.ws.length; return el('div', { style: 'margin-bottom:30px' },
      el('div', { class: 'hscroll' }, el('div', { style: `min-width:${Math.min(820, 74 + n * 170)}px;max-width:${74 + n * 215}px` },
        el('div', { class: 'cmp', style: 'margin-bottom:12px' }, el('div', { class: 'rl' }, 'Sources'),
          strip(n, [vtile(b.a, 'A', 'src'), vtile(b.b, 'B', 'src'), itile(b.tgt, 'target')])),
        darrowRow(), heads(n, b.ws.map((w) => 'w = ' + w), 74),
        cmpRow('DisMo', b.dismo.map((v) => vtile(v, null)), false, null, n),
        cmpRow('Ours (CogVideoX)', b.cog.map((v) => vtile(v, null, 'ours')), true, null, n))),
      dlab('BN' + (i + 1), '')); };
    const render = (p) => set(st, ...L.slice(p * PER, (p + 1) * PER).map((b, k) => row(b, p * PER + k)));
    if (L.length > PER) { const pg = pager(L.length, PER, render); host.after(pg); pg.upd(0); } else render(0);
  })();

  (function sub() {
    const host = $('#sub'); if (!host) return; const S = D.sub;
    pairViewer(host, S, { idp: 'S',
      cols: () => 3, heads: () => S.ops.map((w) => 'w = ' + w), chip: (p) => `${p.ma} − ${p.mb}`,
      rows: (p, t) => [['Ours', t.ours.map((v) => vtile(v, null, 'ours')), true], ['DisMo', t.dismo.map((v) => vtile(v))]],
      caption: (p) => el('span', {}, 'Expected at w = 1: ', el('b', {}, p.expected)),
    });
  })();

  (function band() {
    const host = $('#band'); if (!host) return; const Bd = D.band;
    pairViewer(host, Bd, { idp: 'B',
      cols: () => 4, heads: (p) => ['A', 'B', 'A low + B high', 'A high + B low'], chip: (p) => `${p.ma} × ${p.mb}`,
      rows: (p, t) => [['Ours', t.ours.map((v) => vtile(v, null, 'ours')), true]],
      caption: (p) => 'Low = bands k < 4 (the course of a motion), high = bands 4–15 (its faster detail).',
    });
  })();

  // ---------- single-motion operations (coarse to fine, intensity) ----------
  function opViewer(host, items, labels, idp) {
    const ctl = el('div', { class: 'ctrls' }); host.append(ctl); const st = stage(host);
    const draw = (i) => { const it = items[i];
      set(st, flow(1, [vtile(it.src, 'source', 'src')].concat(it.outs.map((o, j) => vtile(o, labels[j], 'ours'))), 760),
        dlab(`${idp}${i + 1}`, `${it.name} → ${it.target}`)); };
    ctl.append(ctlRow('Motion', chips(items.map((x) => x.name), 0, draw))); draw(0);
  }
  (function lod() { const host = $('#lod'); if (host) opViewer(host, D.lod.items, D.lod.ks.map((k) => (k === 16 ? 'all 16 bands' : `bands k < ${k}`)), 'L'); })();
  (function intensity() { const host = $('#intensity'); if (host) opViewer(host, D.intensity.items, D.intensity.alphas.map((a) => 'α = ' + a.replace('-', '−')), 'A'); })();

  // ---------- every example of the supplementary review pages (user 2026-11-17): paged rows, tabs per group ----------
  function suppBlock(id, rows, groups, labels, nIn, per, grid, idp) {
    const host = $('#' + id); if (!host || !rows || !rows.length) return;
    const num = new Map(rows.map((r, i) => [r, idp + (i + 1)]));
    const G = groups ? groups.map(([k, n]) => [n, rows.filter((r) => r.set === k)]).filter(([, rs]) => rs.length) : [[null, rows]];
    let cur = 0; const tb = el('div'); host.append(tb); const st = stage(host);
    const card = (r) => grid ? el('div', {}, vtile(r.v[0], r.cap, 'ours'), dlab(num.get(r), `${r.set} · ${r.cap}`))
      : el('div', {}, el('div', { class: 'note', style: 'margin:16px 0 6px' }, el('b', { class: 'dlab-id' }, num.get(r) + ' · '), r.cap),
        flow(nIn, r.v.map((s, j) => vtile(s, labels[j], j < nIn ? 'src' : 'ours')), 760));
    const render = (p) => set(st, el('div', grid ? { class: 'gal' } : {}, G[cur][1].slice(p * per, (p + 1) * per).map(card)));
    let pg = pager(G[0][1].length, per, render); host.append(pg);
    if (G.length > 1) tb.append(tabs(G.map(([n, rs]) => `${n} (${rs.length})`), (i) => { cur = i; const np = pager(G[i][1].length, per, render); pg.replaceWith(np); pg = np; pg.upd(0); }));
    pg.upd(0);
  }
  const SP = D.supp || {};
  suppBlock('lod-more', SP.lod, [['grid', 'Two-step motions'], ['real', 'Real videos'], ['workout', 'Workout move']], ['source', 'bands k < 2', 'bands k < 4', 'bands k < 8', 'all 16 bands'], 1, 6, false, 'LM');
  suppBlock('int-more', SP.int, [['grid', 'Two-step motions'], ['real', 'Real videos']], ['source', 'α = −2', 'α = −1', 'α = 0', 'α = +1', 'α = +2'], 1, 6, false, 'IM');
  suppBlock('plus-more', SP.comp, null, ['source A', 'source B', 'A alone', 'B alone', 'A + B'], 2, 6, false, 'CM');
  suppBlock('novel-more', SP.samples, [['novelty search', 'Novelty search'], ['Gaussian', 'Gaussian samples']], [], 0, 12, true, 'NM');

  // ---------- new motions ----------
  (function novel() {
    const N = D.novel;
    const h1 = $('#novel-search'); if (h1) { const st = stage(h1);
      set(st, strip(6, N.nov.map((n, i) => el('div', {}, vtile(n.v, 'novelty ' + n.nu.toFixed(2), 'ours'), dlab('NS' + (i + 1), n.target))), 760)); }
    const h2 = $('#novel-gauss'); if (h2) { const st = stage(h2);
      set(st, strip(6, N.gauss.map((n, i) => el('div', {}, vtile(n.v, 'novelty ' + n.nu.toFixed(2), 'ours'), dlab('NG' + (i + 1), n.target))), 760)); }
    const h3 = $('#novel-shared'); if (h3) {
      const ctl = el('div', { class: 'ctrls' }); h3.append(ctl); const st = stage(h3);
      const draw = (i) => set(st, strip(5, N.shared[i].outs.map((o, j) => vtile(o, N.bodies[j], 'ours'))), dlab('SC' + (i + 1), 'code ' + (i + 1) + ' on ' + N.bodies.join(', ')));
      ctl.append(ctlRow('Sample', chips(N.shared.map((s, i) => 'code ' + (i + 1)), 0, draw))); draw(0);
    }
  })();


  // ---------- generic example viewer: sources on top, one row per method ----------
  // item = {name, srcs: [[video, label]], rows: [[row label, is ours, [[video, tile label]]]], cap}
  function itemViewer(host, items, opt = {}) {
    if (!host || !items || !items.length) return;
    const ctl = el('div', { class: 'ctrls' }); host.append(ctl); const st = stage(host, opt.sync !== false);
    const draw = (i) => {
      const it = items[i]; const n = Math.max(it.srcs.length, ...it.rows.map((r) => r[2].length));
      const inner = el('div', { style: `min-width:${Math.min(820, 74 + n * 150)}px;max-width:${74 + n * (opt.colw || 215)}px` },
        it.srcs.length ? el('div', { class: 'cmp', style: 'margin-bottom:12px' }, el('div', { class: 'rl' }, 'Sources'),
          strip(n, it.srcs.map(([v, l]) => (/\.jpg$/.test(v || '') ? itile(v, l) : vtile(v, l, 'src'))))) : null,
        it.srcs.length ? darrowRow() : null,
        it.rows.map(([lab, ours, tiles]) => cmpRow(lab, tiles.map(([v, l, ar]) => vtile(v, l, ours ? 'ours' : '', ar || opt.ar)), ours, null, n)));
      const c = (it.cap || '').replace(/(^|;\s*)on [^;]*$/, '');   // no source / target names under examples (user 2026-11-15)
      set(st, el('div', { class: 'hscroll' }, inner), dlab(`${opt.idp || host.id || 'X'}-${i + 1}`, it.name + (it.cap ? ' · ' + it.cap : '')),
        c ? el('div', { class: 'cap' }, c) : null);
    };
    if (items.length > 24) {            // long lists: a dropdown with previous / next
      let cur = 0; const sel = el('select', { class: 'pick' }, items.map((x, i) => el('option', { value: i }, `${i + 1}. ${x.name}`)));
      const go = (i) => { cur = (i + items.length) % items.length; sel.value = cur; draw(cur); };
      sel.addEventListener('change', () => go(+sel.value));
      ctl.append(ctlRow(opt.label || 'Example', el('div', { class: 'stepper' }, el('button', { onclick: () => go(cur - 1) }, '←'), sel,
        el('button', { onclick: () => go(cur + 1) }, '→'), el('span', { class: 'note' }, `${items.length} examples`))));
    } else if (items.length > 1) ctl.append(ctlRow(opt.label || 'Example', chips(items.map((x) => x.name), 0, draw)));
    draw(0);
  }
  function tabbed(tabHost, names, panes) {
    if (!$(tabHost)) return;   // user 2026-11-20: the dump section was removed from the page; its hosts no longer exist
    $(tabHost).append(tabs(names, (i) => panes.forEach((p, j) => { if (p) p.style.display = i === j ? '' : 'none'; })));
    panes.forEach((p, j) => { if (p && j) p.style.display = 'none'; });
  }

  (function overnight() {
    const O = D.ov; if (!O) return;
    itemViewer($('#plus'), O.plus);
    itemViewer($('#minus-real'), O.minus);
    tabbed('#sub-tabs', ['Generated motion pairs', 'Real videos'], [$('#sub'), $('#minus-real')]);
    itemViewer($('#analogy'), O.analogy);
    itemViewer($('#neg'), O.neg);
    itemViewer($('#band-real'), O.band);
    tabbed('#band-tabs', ['Generated motion pairs', 'Real videos'], [$('#band'), $('#band-real')]);
    itemViewer($('#rev'), O.rev);
    itemViewer($('#mirror'), O.mirror);
    const ks = Object.keys(O.seq).sort((a, b) => a - b);
    // #seq exists only with the dump section (removed from the page 2026-11-20)
    const panes = !$('#seq') ? [] : ks.map((k) => { const d = el('div'); $('#seq').append(d); itemViewer(d, O.seq[k], { ar: '2/3', label: 'Sequence', colw: 200, idp: 'seq' + k }); return d; });
    tabbed('#seq-tabs', ks.map((k) => `${k} motions`), panes);
    itemViewer($('#long'), O.long, { sync: false });
    itemViewer($('#novel-temp'), O.temp, { label: 'Direction' });
    itemViewer($('#novel-landmark'), O.landmark, { colw: 140 });
    const h = $('#novel-single'); if (h) { const st = stage(h), PER = 12;
      const pg = pager(O.single.length, PER, (p) => set(st, strip(6, O.single.slice(p * PER, (p + 1) * PER).map((n, k) =>
        el('div', {}, vtile(n.v, null, 'ours'), dlab('RC' + (p * PER + k + 1), n.target))), 760)));
      h.after(pg); pg.upd(0); }
  })();


  (function presentation() {
    const X = D.x; if (!X) return;
    itemViewer($('#arith'), X.arith, { label: 'Pair' });
    const ic = $('#interp-cur'); if (ic) { itemViewer(ic, X.cinterp, { label: 'Pair' }); }
    const kp = !$('#knobs') ? [] : X.knobs.map((k) => { const d = el('div'); d.append(el('p', { class: 'note', style: 'margin:0 0 6px' }, k.note)); $('#knobs').append(d);
      itemViewer(d, k.items, { label: 'Clip', idp: 'knob' + (X.knobs.indexOf(k) + 1) }); return d; });
    tabbed('#knob-tabs', X.knobs.map((k) => k.title), kp);
    itemViewer($('#spec'), X.spec, { label: 'Pair' });
    itemViewer($('#lengths'), X.lengths, { label: 'Pair', sync: false });
    itemViewer($('#novel-frame'), X.frame, { label: 'Code', colw: 260 });
  })();


  // ---------- sub-tabs inside a section (user 2026-11-19, Baseline Comparisons): same look as the main bars, one subsection shown at a time ----------
  document.querySelectorAll('.subtabs').forEach((bar) => {
    const btns = [...bar.querySelectorAll('.rtab')], panes = btns.map((b) => document.getElementById(b.dataset.sub));
    const show = (i) => btns.forEach((b, j) => { b.setAttribute('aria-selected', String(i === j)); b.tabIndex = i === j ? 0 : -1; if (panes[j]) panes[j].hidden = i !== j; });
    btns.forEach((b, i) => {
      b.addEventListener('click', () => show(i));
      b.addEventListener('keydown', (e) => { const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (d) { const k = (i + d + btns.length) % btns.length; show(k); btns[k].focus(); } });
    });
    show(0);
  });

  // ---------- tab bars (highlights, results): each button shows one section of its bar and hides the rest; a click keeps the choice in the address ----------
  document.querySelectorAll('nav.tabbar').forEach((bar) => {
    const anchor = document.getElementById(bar.dataset.anchor || 'results');
    const btns = [...bar.querySelectorAll('.rtab')], panels = btns.map((b) => document.getElementById(b.dataset.panel));
    const show = (i, scroll, keep) => {
      btns.forEach((b, j) => { b.setAttribute('aria-selected', String(i === j)); b.tabIndex = i === j ? 0 : -1; panels[j].hidden = i !== j; });
      if (keep) try { history.replaceState(null, '', '#' + panels[i].id); } catch (e) {}
      if (scroll && anchor) { const top = anchor.getBoundingClientRect().top + window.scrollY - 52; if (window.scrollY > top) window.scrollTo({ top }); }
    };
    btns.forEach((b, i) => {
      b.addEventListener('click', () => show(i, true, true));
      b.addEventListener('keydown', (e) => { const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (d) { const k = (i + d + btns.length) % btns.length; show(k, false, true); btns[k].focus(); } });
    });
    const k = panels.findIndex((p) => p && p.id === location.hash.slice(1));
    show(k >= 0 ? k : 0, false, false);
    if (k >= 0 && anchor) setTimeout(() => anchor.scrollIntoView(), 0);
  });

  // ---------- nav: active section, speed, theme ----------
  const links = [...document.querySelectorAll('nav.top .links a')];
  const secs = links.map((a) => document.querySelector(a.getAttribute('href')));
  const onScroll = () => { let k = 0; secs.forEach((s, i) => { if (s && s.getBoundingClientRect().top < 120) k = i; }); links.forEach((a, i) => a.classList.toggle('on', i === k)); };
  document.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  const sp = $('#speed'); if (sp) sp.addEventListener('click', () => {
    RATE = RATE === 1 ? 0.5 : 1; sp.textContent = RATE === 1 ? 'speed 1×' : 'speed ½×'; sp.classList.toggle('on', RATE !== 1);
    document.querySelectorAll('video:not(#hero-video)').forEach((v) => (v.playbackRate = RATE));   // the hero teaser is a normal player
  });
  const th = $('#theme'); if (th) th.addEventListener('click', () => {
    const r = document.documentElement; const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    r.dataset.theme = dark ? 'light' : 'dark'; try { localStorage.setItem('timbre-theme', r.dataset.theme); } catch (e) {}
  });
})();
