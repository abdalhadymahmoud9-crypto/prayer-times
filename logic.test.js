const test = require('node:test');
const assert = require('node:assert');
const L = require('./logic.js');
const ADH = require('./adhkar.js');
const T = { Fajr: '04:57', Sunrise: '06:28', Dhuhr: '11:42', Asr: '14:36', Maghrib: '16:55', Isha: '18:17' };

test('parseHM يقبل الصيغ الطبيعية ويرفض الغلط', () => {
  assert.strictEqual(L.parseHM('04:57'), 4 * 3600 + 57 * 60);
  assert.strictEqual(L.parseHM('16:55 (EET)'), 16 * 3600 + 55 * 60);
  assert.strictEqual(L.parseHM('24:00'), null);
  assert.strictEqual(L.parseHM('x'), null);
  assert.strictEqual(L.parseHM(undefined), null);
});
test('validTimings يرفض ترتيب غلط أو ناقص', () => {
  assert.ok(L.validTimings(T));
  assert.ok(!L.validTimings(Object.assign({}, T, { Asr: '10:00' })));
  assert.ok(!L.validTimings({ Fajr: '04:57' }));
  assert.ok(!L.validTimings(null));
});
test('status: قبل الفجر الصلاة الحالية العشاء والجاية الفجر', () => {
  const s = L.status(T, null, 3 * 3600);
  assert.strictEqual(s.current, 'Isha'); assert.strictEqual(s.next, 'Fajr');
  assert.strictEqual(s.remaining, 4 * 3600 + 57 * 60 - 3 * 3600 + 0);
});
test('status: بين الظهر والعصر', () => {
  const s = L.status(T, null, 12 * 3600);
  assert.strictEqual(s.current, 'Dhuhr'); assert.strictEqual(s.next, 'Asr');
  assert.strictEqual(s.remaining, 14 * 3600 + 36 * 60 - 12 * 3600);
  assert.strictEqual(s.wrapped, false);
});
test('status: بعد العشاء بياخد فجر بكرة لو متاح وبيعلّم لو مقدّر', () => {
  const a = L.status(T, 5 * 3600 + 20 * 60, 20 * 3600);
  assert.strictEqual(a.next, 'Fajr'); assert.ok(a.wrapped); assert.ok(!a.estimatedTomorrow);
  assert.strictEqual(a.remaining, 24 * 3600 + 5 * 3600 + 20 * 60 - 20 * 3600);
  const b = L.status(T, null, 20 * 3600);
  assert.ok(b.estimatedTomorrow);
});
test('status: بين الفجر والشروق بيتعلّم', () => {
  assert.ok(L.status(T, null, 5 * 3600 + 30 * 60).sunriseNow);
  assert.ok(!L.status(T, null, 7 * 3600).sunriseNow);
});
test('الوقت في المنطقة الزمنية بيتحسب صح بغض النظر عن جهاز المستخدم', () => {
  const n = L.nowIn(new Date('2026-11-25T19:40:22Z'), 'Africa/Cairo'); // القاهرة UTC+2 في نوفمبر
  assert.deepStrictEqual([n.y, n.m, n.d], [2026, 11, 25]);
  assert.strictEqual(n.sec, 21 * 3600 + 40 * 60 + 22);
  const t = L.nowIn(new Date('2026-11-25T23:30:00Z'), 'Africa/Cairo');
  assert.deepStrictEqual([t.m, t.d], [11, 26]);
  assert.strictEqual(L.dayParam(t), '26-11-2026');
  assert.strictEqual(L.dayKey(L.addDay(t, 5)), '2026-12-01');
});
test('القبلة من القاهرة قرب ١٣٦° ومن أسوان قرب ١٢٥°، والمسافة معقولة', () => {
  const c = L.qibla(30.0444, 31.2357);
  assert.ok(c > 134 && c < 138, String(c));
  assert.ok(L.qibla(31.2001, 29.9187) > 134 && L.qibla(31.2001, 29.9187) < 142);
  const k = L.distanceKm(30.0444, 31.2357);
  assert.ok(k > 1200 && k < 1300, String(k));
  assert.ok(L.qibla(21.4225, 39.8262 - 0.1) > 80 && L.qibla(21.4225, 39.8262 - 0.1) < 100); // غرب الكعبة: القبلة شرقًا
});
test('عدّاد الذكر: يزيد لحد العدد المطلوب ومبيعدّيهوش ويرجع خطوة', () => {
  let s = {};
  for (let i = 0; i < 5; i++) s = L.tap(s, 'morning', 2, 3);
  assert.strictEqual(s.morning[2], 3);
  s = L.undo(s, 'morning', 2); assert.strictEqual(s.morning[2], 2);
  assert.deepStrictEqual(L.undo({}, 'x', 0), {});
  assert.deepStrictEqual(L.resetCat(s, 'morning'), {});
});
test('tap مبيغيّرش الحالة الأصلية', () => {
  const s = { a: { 0: 1 } }; const r = L.tap(s, 'a', 0, 5);
  assert.strictEqual(s.a[0], 1); assert.strictEqual(r.a[0], 2);
});
test('progress بيعدّ الأذكار المكتملة بس', () => {
  const items = [{ n: 1 }, { n: 3 }, { n: 2 }];
  let s = L.tap({}, 'c', 0, 1); s = L.tap(s, 'c', 1, 3);
  assert.deepStrictEqual(L.progress(s, 'c', items), { done: 1, total: 3 });
});
test('بيانات الأذكار: الفئات والأعداد سليمة والنصوص مش فاضية', () => {
  assert.deepStrictEqual(ADH.map(c => c.key), ['morning', 'after', 'sleep', 'wake', 'adhan']);
  assert.deepStrictEqual(ADH.map(c => c.items.length), [24, 8, 13, 4, 5]);
  for (const c of ADH) for (const it of c.items) {
    assert.ok(it.t.length > 10, c.key); assert.ok(Number.isInteger(it.n) && it.n >= 1 && it.n <= 100);
    assert.ok(!it.t.includes('((') && !it.t.includes('*'));
  }
});
test('الأماكن والطرق: إحداثيات داخل مصر وطريقة مصر أولى', () => {
  for (const p of L.PLACES) assert.ok(p.lat > 22 && p.lat < 32 && p.lng > 24 && p.lng < 37, p.id);
  assert.strictEqual(L.METHODS[0].id, 5);
  assert.strictEqual(new Set(L.PLACES.map(p => p.id)).size, L.PLACES.length);
});
