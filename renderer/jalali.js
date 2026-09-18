// Calendar conversion core adapted from jalaali-js (MIT License).
// Copyright (c) 2020 Behrang Norouzinia.
// See THIRD_PARTY_NOTICES.md for attribution and license details.
// jalali.js — Gregorian <-> Jalali (Shamsi) conversion, no dependencies.
(function (g) {
  function div(a, b) { return ~~(a / b); }
  function mod(a, b) { return a - ~~(a / b) * b; }
  function jalCal(jy) {
    var breaks = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
    var bl = breaks.length, gy = jy + 621, leapJ = -14, jp = breaks[0], jm, jump = 0, leap, leapG, march, n, i;
    for (i = 1; i < bl; i += 1) {
      jm = breaks[i]; jump = jm - jp;
      if (jy < jm) break;
      leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
      jp = jm;
    }
    n = jy - jp;
    leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
    if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
    leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
    march = 20 + leapJ - leapG;
    if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
    leap = mod(mod(n + 1, 33) - 1, 4);
    if (leap === -1) leap = 4;
    return { leap: leap, gy: gy, march: march };
  }
  function g2d(gy, gm, gd) {
    var d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
    d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
    return d;
  }
  function j2d(jy, jm, jd) {
    var r = jalCal(jy);
    return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
  }
  function toJalali(gy, gm, gd) {
    var jdn = g2d(gy, gm, gd);
    var jy = gy - 621, r = jalCal(jy), jdn1f = g2d(r.gy, 3, r.march), k = jdn - jdn1f, jm, jd;
    if (k >= 0) {
      if (k <= 185) { jm = 1 + div(k, 31); jd = mod(k, 31) + 1; return { jy: jy, jm: jm, jd: jd }; }
      k -= 186;
    } else { jy -= 1; k += 179; if (r.leap === 1) k += 1; }
    jm = 7 + div(k, 30); jd = mod(k, 30) + 1;
    return { jy: jy, jm: jm, jd: jd };
  }
  function isLeap(jy) { return jalCal(jy).leap === 0; }
  function monthLen(jy, jm) { if (jm <= 6) return 31; if (jm <= 11) return 30; return isLeap(jy) ? 30 : 29; }

  var MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
  var WEEK = ['شنبه', 'یک‌شنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه']; // Sat..Fri
  function faNum(x) { var fa = '۰۱۲۳۴۵۶۷۸۹'; return String(x).replace(/\d/g, function (d) { return fa[d]; }); }
  function jOfDate(d) { return toJalali(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
  function weekIdx(d) { return (d.getDay() + 1) % 7; }           // Sat=0..Fri=6
  function jdnOfDate(d) { return g2d(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
  function jKey(d) { var j = jOfDate(d); return j.jy + '-' + j.jm + '-' + j.jd; }
  // A local JS Date (midnight) for a Jalali y/m/d, via day-difference from today (DST-safe).
  function dateOfJalali(jy, jm, jd) {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var diff = j2d(jy, jm, jd) - jdnOfDate(today);
    var t = new Date(today); t.setDate(t.getDate() + diff);
    return t;
  }
  // weekday column (Sat=0) for a jdn, calibrated against today
  function jdnWeek(jdn) {
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var base = jdnOfDate(today), w = (today.getDay() + 1) % 7;
    var r = ((jdn - base) % 7 + w) % 7; return (r + 7) % 7;
  }
  g.J = {
    toJalali: toJalali, j2d: j2d, g2d: g2d, monthLen: monthLen, isLeap: isLeap,
    MONTHS: MONTHS, WEEK: WEEK, faNum: faNum, jOfDate: jOfDate, weekIdx: weekIdx,
    jdnOfDate: jdnOfDate, jKey: jKey, dateOfJalali: dateOfJalali, jdnWeek: jdnWeek,
  };
})(window);
