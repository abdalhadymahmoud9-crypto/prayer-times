(function () {
  'use strict';
  const L = window.PrayerLogic, ADH = window.ADHKAR;
  const $ = id => document.getElementById(id);
  const KEY = 'prayer-times-v1', CKEY = 'prayer-times-cache-v1', AKEY = 'prayer-times-adhkar-v1';
  const API = 'https://api.aladhan.com/v1/timings/';
  const deviceTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Cairo'; } catch (e) { return 'Africa/Cairo'; } })();

  function load(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* التخزين ممنوع */ } }

  let S = Object.assign({ place: 'cairo', geo: null, method: 5, school: 0 }, load(KEY, {}));
  if (!L.METHODS.some(m => m.id === S.method)) S.method = 5;
  if (S.place === 'geo' && !(S.geo && isFinite(S.geo.lat) && isFinite(S.geo.lng))) S.place = 'cairo';
  let data = null;          // {today, tomorrow, hijri, methodName, tz, fromCache}
  let loadedDay = null, loading = false;

  function where() {
    if (S.place === 'geo') return { name: 'موقعي', lat: S.geo.lat, lng: S.geo.lng, tz: S.geo.tz || deviceTz };
    const p = L.PLACES.find(x => x.id === S.place) || L.PLACES[0];
    return { name: p.ar, lat: p.lat, lng: p.lng, tz: 'Africa/Cairo' };
  }

  async function fetchDay(w, n) {
    const ck = [S.method, S.school, w.lat.toFixed(3), w.lng.toFixed(3), L.dayKey(n)].join('|');
    const cache = load(CKEY, {});
    try {
      const u = API + L.dayParam(n) + '?latitude=' + w.lat + '&longitude=' + w.lng + '&method=' + S.method + '&school=' + S.school + '&timezonestring=' + encodeURIComponent(w.tz);
      const r = await fetch(u);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const t = j && j.data && j.data.timings;
      if (!L.validTimings(t)) throw new Error('bad timings');
      const rec = { t: Object.fromEntries(L.SHOWN.map(k => [k, String(t[k]).slice(0, 5)])), hijri: j.data.date && j.data.date.hijri, method: j.data.meta && j.data.meta.method && j.data.meta.method.name };
      cache[ck] = rec;
      const keys = Object.keys(cache); if (keys.length > 12) keys.slice(0, keys.length - 12).forEach(k => delete cache[k]);
      save(CKEY, cache);
      return Object.assign({ fromCache: false }, rec);
    } catch (e) {
      if (cache[ck] && L.validTimings(cache[ck].t)) return Object.assign({ fromCache: true }, cache[ck]);
      throw e;
    }
  }

  async function refresh() {
    if (loading) return;
    loading = true;
    const w = where(), now = L.nowIn(new Date(), w.tz);
    $('place-name').textContent = w.name;
    setStatus('بحمّل المواعيد…', '');
    try {
      const today = await fetchDay(w, now);
      let tomorrow = null;
      try { tomorrow = await fetchDay(w, L.addDay(now, 1)); } catch (e) { tomorrow = null; }
      data = { today, tomorrow, tz: w.tz, w };
      loadedDay = L.dayKey(now);
      const off = today.fromCache || (tomorrow && tomorrow.fromCache);
      setStatus(off ? 'مفيش اتصال دلوقتي، بعرض مواعيد محفوظة من قبل على جهازك.' : 'المواعيد محدّثة.', off ? 'err' : 'ok');
      renderStatic();
    } catch (e) {
      data = null; loadedDay = null;
      setStatus('معرفتش أجيب المواعيد (اتصال أو خدمة Aladhan). جرّب تاني.', 'err');
      $('times').textContent = '';
      $('nx-name').textContent = '–'; $('nx-count').textContent = '--:--:--'; $('nx-time').textContent = '';
      const b = document.createElement('button'); b.type = 'button'; b.textContent = 'إعادة المحاولة'; b.className = 'ghost';
      b.onclick = () => refresh(); $('status').appendChild(document.createTextNode(' ')); $('status').appendChild(b);
    } finally { loading = false; }
    renderQibla();
  }
  function setStatus(t, cls) { const s = $('status'); s.textContent = t; s.className = 'status ' + cls; }

  function renderStatic() {
    if (!data) return;
    const t = data.today.t, ul = $('times'); ul.textContent = '';
    L.SHOWN.forEach(k => {
      const li = document.createElement('li'); li.dataset.k = k; if (k === 'Sunrise') li.className = 'sun';
      const a = document.createElement('span'); a.textContent = L.NAMES[k];
      const b = document.createElement('span'); b.className = 't'; b.dir = 'ltr'; b.textContent = L.to12(L.parseHM(t[k]));
      li.append(a, b); ul.appendChild(li);
    });
    const h = data.today.hijri;
    $('hijri').textContent = h ? (+h.day) + ' ' + (h.month && h.month.ar) + ' ' + h.year + ' هـ' : '';
    const mm = L.METHODS.find(m => m.id === S.method);
    $('method-note').textContent = 'طريقة الحساب: ' + (mm ? mm.ar : '') + (data.today.method ? '. الاسم عند الخدمة: ' + data.today.method : '') + '. العصر: ' + (S.school ? 'حنفي' : 'جمهور') + '. التوقيت: ' + data.tz + '.';
    tick();
  }

  function tick() {
    if (!data) return;
    const n = L.nowIn(new Date(), data.tz);
    if (L.dayKey(n) !== loadedDay && !loading) { refresh(); return; }
    const tf = data.tomorrow ? L.parseHM(data.tomorrow.t.Fajr) : null;
    const st = L.status(data.today.t, tf, n.sec);
    $('nx-name').textContent = L.NAMES[st.next];
    $('nx-count').textContent = L.fmtRemaining(st.remaining);
    const nextSec = st.wrapped ? (tf != null ? tf : L.parseHM(data.today.t.Fajr)) : L.parseHM(data.today.t[st.next]);
    $('nx-time').textContent = (st.wrapped ? 'بكرة ' : '') + L.to12(nextSec);
    const nt = $('nx-note');
    nt.hidden = !st.estimatedTomorrow;
    if (st.estimatedTomorrow) nt.textContent = 'مواعيد بكرة مش متاحة دلوقتي، فالفجر هنا تقدير بميعاد النهارده وممكن يختلف دقيقة أو اتنين.';
    document.querySelectorAll('#times li').forEach(li => {
      const k = li.dataset.k;
      li.classList.toggle('cur', !st.wrapped ? k === st.current : k === 'Isha');
      li.classList.toggle('nxt', !st.wrapped && k === st.next);
      const old = li.querySelector('.tag'); if (old) old.remove();
      if (li.classList.contains('nxt')) { const g = document.createElement('span'); g.className = 'tag'; g.textContent = 'الجاية'; li.firstChild.appendChild(g); }
    });
  }

  // القبلة
  let heading = null;
  function renderQibla() {
    const w = where(), q = L.qibla(w.lat, w.lng);
    $('q-deg').textContent = Math.round(q) + '° من الشمال';
    $('q-sub').textContent = 'حوالي ' + Math.round(L.distanceKm(w.lat, w.lng)).toLocaleString('ar-EG') + ' كم عن الكعبة';
    $('arrow').style.transform = 'rotate(' + (heading == null ? q : q - heading) + 'deg)';
    $('rose').setAttribute('aria-label', 'السهم يشير للقبلة');
  }
  function onOrient(e) {
    let h = null;
    if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading;
    else if (e.absolute && typeof e.alpha === 'number') h = (360 - e.alpha) % 360;
    if (h == null) return;
    heading = h; compassSeen = true; renderQibla();
  }
  let compassSeen = false, compassOn = false;
  async function compass() {
    const cs = $('compass-status');
    if (compassOn) { window.removeEventListener('deviceorientationabsolute', onOrient); window.removeEventListener('deviceorientation', onOrient); compassOn = false; heading = null; $('compass').textContent = 'شغّل البوصلة'; cs.textContent = ''; renderQibla(); return; }
    try {
      if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const r = await DeviceOrientationEvent.requestPermission();
        if (r !== 'granted') { cs.textContent = 'مفيش إذن للبوصلة.'; cs.className = 'status err'; return; }
      }
    } catch (e) { cs.textContent = 'مقدرتش آخد إذن البوصلة.'; cs.className = 'status err'; return; }
    compassSeen = false; compassOn = true;
    window.addEventListener('deviceorientationabsolute', onOrient);
    window.addEventListener('deviceorientation', onOrient);
    $('compass').textContent = 'وقّف البوصلة';
    cs.className = 'status'; cs.textContent = 'بدوّر على قراءة البوصلة… حرّك الموبايل على شكل ٨ عشان يتظبط.';
    setTimeout(() => { if (compassOn && !compassSeen) { cs.className = 'status err'; cs.textContent = 'جهازك أو متصفحك مش بيدّي قراءة بوصلة. استخدم الرقم فوق.'; } else if (compassOn) { cs.className = 'status'; cs.textContent = 'البوصلة شغّالة. القراءة تقريبية.'; } }, 2500);
  }

  // الأذكار
  let A = load(AKEY, { day: '', s: {} }), curTab = ADH[0].key;
  function adhDay() { return L.dayKey(L.nowIn(new Date(), where().tz)); }
  function adhState() { const d = adhDay(); if (A.day !== d) { A = { day: d, s: {} }; save(AKEY, A); } return A.s; }
  function renderAdhkar() {
    const st = adhState(), cat = ADH.find(c => c.key === curTab);
    const tabs = $('adh-tabs'); tabs.textContent = '';
    ADH.forEach(c => {
      const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', c.key === curTab);
      const p = L.progress(st, c.key, c.items); b.textContent = c.title + ' ' + p.done + '/' + p.total;
      b.onclick = () => { curTab = c.key; renderAdhkar(); };
      tabs.appendChild(b);
    });
    const p = L.progress(st, cat.key, cat.items);
    $('adh-prog').textContent = 'خلّصت ' + p.done + ' من ' + p.total + ' النهارده';
    const list = $('adh-list'); list.textContent = '';
    cat.items.forEach((it, i) => {
      const cur = Math.min(Number((st[cat.key] || {})[i]) || 0, it.n), done = cur >= it.n;
      const d = document.createElement('div'); d.className = 'dhikr' + (done ? ' done' : '');
      const tx = document.createElement('div'); tx.className = 'tx'; tx.textContent = it.t;
      const ct = document.createElement('div'); ct.className = 'ct';
      const num = document.createElement('span'); num.className = 'num'; num.textContent = it.n > 1 ? 'التكرار ' + cur + ' / ' + it.n : (done ? 'تم' : 'مرة واحدة');
      const btns = document.createElement('div'); btns.className = 'btns';
      const tap = document.createElement('button'); tap.type = 'button'; tap.className = 'tap'; tap.textContent = done ? 'تم ✓' : (it.n > 1 ? 'عدّ' : 'خلّصته'); tap.disabled = done;
      tap.setAttribute('aria-label', (done ? 'تم' : 'عدّ') + ' الذكر رقم ' + (i + 1));
      tap.onclick = () => { A.s = L.tap(adhState(), cat.key, i, it.n); save(AKEY, A); renderAdhkar(); const nb = $('adh-list').children[i]; if (nb) { const t = nb.querySelector('button.tap:not(:disabled)'); if (t) t.focus(); } };
      const un = document.createElement('button'); un.type = 'button'; un.className = 'ghost sm'; un.textContent = 'رجّع'; un.disabled = cur === 0;
      un.setAttribute('aria-label', 'رجّع عدّة للذكر رقم ' + (i + 1));
      un.onclick = () => { A.s = L.undo(adhState(), cat.key, i); save(AKEY, A); renderAdhkar(); };
      btns.append(un, tap); ct.append(num, btns); d.append(tx, ct); list.appendChild(d);
    });
  }
  $('adh-reset').onclick = () => { A.s = L.resetCat(adhState(), curTab); save(AKEY, A); renderAdhkar(); };

  // الإعدادات
  const ps = $('place');
  L.PLACES.forEach(p => { const o = document.createElement('option'); o.value = p.id; o.textContent = p.ar; ps.appendChild(o); });
  function geoOption() {
    let o = ps.querySelector('option[value=geo]');
    if (S.geo && !o) { o = document.createElement('option'); o.value = 'geo'; o.textContent = 'موقعي'; ps.appendChild(o); }
  }
  geoOption(); ps.value = S.place;
  const ms = $('method'); L.METHODS.forEach(m => { const o = document.createElement('option'); o.value = m.id; o.textContent = m.ar; ms.appendChild(o); });
  ms.value = S.method; $('school').value = String(S.school);
  ps.onchange = () => { S.place = ps.value; save(KEY, S); refresh(); renderAdhkar(); };
  ms.onchange = () => { S.method = +ms.value; save(KEY, S); refresh(); };
  $('school').onchange = e => { S.school = +e.target.value; save(KEY, S); refresh(); };
  $('geo').onclick = () => {
    const gs = $('geo-status');
    if (!navigator.geolocation) { gs.textContent = 'متصفحك مش بيدعم تحديد الموقع.'; gs.className = 'status err'; return; }
    gs.textContent = 'بحدّد موقعك…'; gs.className = 'status';
    navigator.geolocation.getCurrentPosition(pos => {
      S.geo = { lat: +pos.coords.latitude.toFixed(4), lng: +pos.coords.longitude.toFixed(4), tz: deviceTz };
      S.place = 'geo'; save(KEY, S); geoOption(); ps.value = 'geo';
      gs.textContent = 'تمام. التوقيت المستخدم هو توقيت جهازك (' + deviceTz + ').'; gs.className = 'status ok';
      refresh();
    }, err => { gs.textContent = err && err.code === 1 ? 'رفضت إذن الموقع. اختار مدينة من القايمة.' : 'معرفتش أحدد موقعك. اختار مدينة من القايمة.'; gs.className = 'status err'; }, { timeout: 15000, maximumAge: 600000 });
  };
  $('compass').onclick = compass;

  renderQibla(); renderAdhkar(); refresh();
  setInterval(tick, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); renderAdhkar(); } });
})();
