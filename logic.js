(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PrayerLogic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const PLACES = [
    { id: 'cairo', ar: 'القاهرة', lat: 30.0444, lng: 31.2357 },
    { id: 'giza', ar: 'الجيزة', lat: 30.0131, lng: 31.2089 },
    { id: 'alex', ar: 'الإسكندرية', lat: 31.2001, lng: 29.9187 },
    { id: 'mansoura', ar: 'المنصورة', lat: 31.0409, lng: 31.3785 },
    { id: 'tanta', ar: 'طنطا', lat: 30.7865, lng: 31.0004 },
    { id: 'portsaid', ar: 'بورسعيد', lat: 31.2653, lng: 32.3019 },
    { id: 'suez', ar: 'السويس', lat: 29.9668, lng: 32.5498 },
    { id: 'ismailia', ar: 'الإسماعيلية', lat: 30.5965, lng: 32.2715 },
    { id: 'fayoum', ar: 'الفيوم', lat: 29.3084, lng: 30.8428 },
    { id: 'minya', ar: 'المنيا', lat: 28.1099, lng: 30.7503 },
    { id: 'asyut', ar: 'أسيوط', lat: 27.1809, lng: 31.1837 },
    { id: 'sohag', ar: 'سوهاج', lat: 26.5591, lng: 31.6957 },
    { id: 'luxor', ar: 'الأقصر', lat: 25.6872, lng: 32.6396 },
    { id: 'aswan', ar: 'أسوان', lat: 24.0889, lng: 32.8998 },
    { id: 'hurghada', ar: 'الغردقة', lat: 27.2579, lng: 33.8116 },
    { id: 'sharm', ar: 'شرم الشيخ', lat: 27.9158, lng: 34.33 }
  ];
  // رقم الطريقة في Aladhan API (aladhan.com/prayer-times-api) واسمها
  const METHODS = [
    { id: 5, ar: 'الهيئة المصرية العامة للمساحة (الفجر ١٩٫٥° والعشاء ١٧٫٥°)' },
    { id: 4, ar: 'جامعة أم القرى، مكة' },
    { id: 3, ar: 'رابطة العالم الإسلامي' },
    { id: 2, ar: 'الجمعية الإسلامية لأمريكا الشمالية (ISNA)' }
  ];
  const PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  const NAMES = { Fajr: 'الفجر', Sunrise: 'الشروق', Dhuhr: 'الظهر', Asr: 'العصر', Maghrib: 'المغرب', Isha: 'العشاء' };
  const SHOWN = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

  function parseHM(s) {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(s || '').trim());
    if (!m) return null;
    const h = +m[1], mi = +m[2];
    if (h > 23 || mi > 59) return null;
    return h * 3600 + mi * 60;
  }
  function validTimings(t) {
    if (!t || typeof t !== 'object') return false;
    let last = -1;
    for (const k of SHOWN) {
      const v = parseHM(t[k]);
      if (v === null || v <= last) return false;
      last = v;
    }
    return true;
  }
  // الوقت الحالي في منطقة زمنية معيّنة، بدون الاعتماد على منطقة الجهاز
  function nowIn(date, tz) {
    const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const p = {};
    for (const x of f.formatToParts(date)) p[x.type] = x.value;
    return { y: +p.year, m: +p.month, d: +p.day, sec: (+p.hour) * 3600 + (+p.minute) * 60 + (+p.second) };
  }
  function dayParam(n) { return String(n.d).padStart(2, '0') + '-' + String(n.m).padStart(2, '0') + '-' + n.y; }
  function dayKey(n) { return n.y + '-' + String(n.m).padStart(2, '0') + '-' + String(n.d).padStart(2, '0'); }
  function addDay(n, k) {
    const d = new Date(Date.UTC(n.y, n.m - 1, n.d + k));
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), sec: n.sec };
  }
  // الصلاة الجاية والحالية. tomorrowFajr بالثواني من منتصف الليل (اختياري)
  function status(timings, tomorrowFajr, sec) {
    const times = PRAYERS.map(k => [k, parseHM(timings[k])]);
    let current = null, next = null;
    for (const [k, v] of times) { if (v <= sec) current = k; else if (!next) { next = [k, v]; } }
    let wrapped = false;
    if (!next) {
      const f = tomorrowFajr != null ? tomorrowFajr : times[0][1];
      next = ['Fajr', f + 86400];
      wrapped = true;
    }
    if (!current) current = 'Isha';
    const sunrise = parseHM(timings.Sunrise);
    const sunriseNow = sec >= times[0][1] && sec < sunrise; // بعد الفجر وقبل الشروق
    return { current, next: next[0], remaining: next[1] - sec, wrapped, sunriseNow, estimatedTomorrow: wrapped && tomorrowFajr == null };
  }
  function fmtRemaining(s) {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0');
  }
  function to12(sec) {
    const h = Math.floor(sec / 3600) % 24, m = Math.floor((sec % 3600) / 60);
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return h12 + ':' + String(m).padStart(2, '0') + (h < 12 ? ' ص' : ' م');
  }
  // اتجاه القبلة: زاوية من الشمال الحقيقي باتجاه عقارب الساعة (دائرة عظمى لحد الكعبة)
  const KAABA = { lat: 21.4225, lng: 39.8262 };
  function qibla(lat, lng) {
    const r = Math.PI / 180, p1 = lat * r, p2 = KAABA.lat * r, dl = (KAABA.lng - lng) * r;
    const y = Math.sin(dl) * Math.cos(p2);
    const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
    return ((Math.atan2(y, x) / r) + 360) % 360;
  }
  function distanceKm(lat, lng) {
    const r = Math.PI / 180, R = 6371;
    const a = Math.sin((KAABA.lat - lat) * r / 2) ** 2 + Math.cos(lat * r) * Math.cos(KAABA.lat * r) * Math.sin((KAABA.lng - lng) * r / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }
  // عدّاد الأذكار: الحالة {cat: {index: count}} ليوم واحد
  function tap(state, cat, idx, need) {
    const s = state && typeof state === 'object' ? state : {};
    const c = Object.assign({}, s[cat]);
    const cur = Math.min(Number(c[idx]) || 0, need);
    if (cur >= need) return s;
    c[idx] = cur + 1;
    return Object.assign({}, s, { [cat]: c });
  }
  function undo(state, cat, idx) {
    const s = state || {};
    const c = Object.assign({}, s[cat]);
    if (!(c[idx] > 0)) return s;
    c[idx] -= 1;
    return Object.assign({}, s, { [cat]: c });
  }
  function resetCat(state, cat) { const s = Object.assign({}, state || {}); delete s[cat]; return s; }
  function progress(state, cat, items) {
    const c = (state && state[cat]) || {};
    let done = 0;
    items.forEach((it, i) => { if ((Number(c[i]) || 0) >= it.n) done++; });
    return { done, total: items.length };
  }
  return { PLACES, METHODS, PRAYERS, NAMES, SHOWN, parseHM, validTimings, nowIn, dayParam, dayKey, addDay, status, fmtRemaining, to12, qibla, distanceKm, tap, undo, resetCat, progress, KAABA };
});
