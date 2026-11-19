#!/usr/bin/env node
/**
 * fix_site_json.js - Strips UTF-8 BOM and repairs all mojibake in data/site.json
 * All repair patterns use ASCII string literals only (no raw multibyte in source).
 * Run: node fix_site_json.js
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'data', 'site.json');

// Build mojibake strings from raw byte sequences that were misread as Latin1
// When UTF-8 bytes are read as Windows-1252, the 2-byte sequence for U+00A9 (c2 a9)
// becomes the string "Â©". We represent those here using unicode escapes.

// Two-byte UTF-8 sequences misread as Latin-1
const copyright_wrong    = '\u00C2\u00A9';   // Â© -> ©
const registered_wrong   = '\u00C2\u00AE';   // Â® -> ®
const middledot_wrong    = '\u00C2\u00B7';   // Â· -> ·
const nbsp_wrong         = '\u00C2\u00A0';   // Â  -> (space)
const lone_Â             = '\u00C2';         // Â  -> (remove)
const bullet_wrong       = '\u00E2\u0080\u00A2'; // â€¢ -> •
const endash_wrong       = '\u00E2\u0080\u0093'; // â€" -> –
const rsquote_wrong      = '\u00E2\u0080\u0099'; // â€™ -> '
const ldquote_wrong      = '\u00E2\u0080\u009C'; // â€œ -> "
const rdquote_wrong      = '\u00E2\u0080\u009D'; // â€  -> "
const check_wrong        = '\u00E2\u009C\u0093'; // âœ" -> ✓
const sparkles_wrong     = '\u00E2\u009C\u00A8'; // âœ¨ -> ✨
const rarrow_wrong       = '\u00E2\u0086\u0092'; // â†' -> →
const uarrow_wrong       = '\u00E2\u0086\u0091'; // â†' -> ↑
const darrow_wrong       = '\u00E2\u0086\u0093'; // â†" -> ↓
const play_wrong         = '\u00E2\u0096\u00B6'; // â–¶ -> ▶
const play2_wrong        = '\u00E2\u0096\u00B8'; // â–¸ -> ▸
const dtri_wrong         = '\u00E2\u2014\u00BE'; // â—¾ -> ▾
const dnarrow_wrong      = '\u00E2\u00AC\u0087'; // â¬‡ -> ⬇
const star_wrong         = '\u00E2\u00AD\u0090'; // â­  -> ⭐  (note trailing space stripped separately)
const lightning_wrong    = '\u00E2\u009A\u00A1'; // âš¡ -> ⚡
const hamburger_wrong    = '\u00E2\u2122\u00B0'; // â˜° -> ☰

// 4-byte emoji: read as 4 separate Windows-1252 bytes
// These show as ð + 3 more chars. We detect by the ð prefix (0xC3 0xB0 in the wrong encoding = ð)
const rocket_wrong       = '\u00C3\u00B0\u0178\u0161\u201A\u20AC'; // ðŸš€ -> 🚀
const lock_wrong         = '\u00C3\u00B0\u0178\u201D\u20AC';       // ðŸ"  -> 🔐 (approx)
const phone_wrong        = '\u00C3\u00B0\u0178\u201D\u00B1';       // ðŸ"± -> 📱
const people_wrong       = '\u00C3\u00B0\u0178\u2019\u00A5';       // ðŸ'¥ -> 👥
const diamond_wrong      = '\u00C3\u00B0\u0178\u2019\u017D';       // ðŸ'Ž -> 💎
const chart_wrong        = '\u00C3\u00B0\u0178\u201D\u008A';       // ðŸ"Š -> 📊
const page_wrong         = '\u00C3\u00B0\u0178\u201D\u201E';       // ðŸ"„ -> 📄
const carousel_wrong     = '\u00C3\u00B0\u0178\u017D\u00A0';       // ðŸŽ  -> 🎠
const globe_wrong        = '\u00C3\u00B0\u0178\u008C';             // ðŸŒ  -> 🌍

// Correct Unicode replacements
const REP = [
  [copyright_wrong,  '\u00A9'],     // ©
  [registered_wrong, '\u00AE'],     // ®
  [middledot_wrong,  '\u00B7'],     // ·
  [nbsp_wrong,       ' '],          // space
  [bullet_wrong,     '\u2022'],     // •
  [endash_wrong,     '\u2013'],     // –
  [rsquote_wrong,    '\u2019'],     // '
  [ldquote_wrong,    '\u201C'],     // "
  [rdquote_wrong,    '\u201D'],     // "
  [check_wrong,      '\u2713'],     // ✓
  [sparkles_wrong,   '\u2728'],     // ✨
  [rarrow_wrong,     '\u2192'],     // →
  [uarrow_wrong,     '\u2191'],     // ↑
  [darrow_wrong,     '\u2193'],     // ↓
  [play_wrong,       '\u25B6'],     // ▶
  [play2_wrong,      '\u25B8'],     // ▸
  [dnarrow_wrong,    '\u2B07'],     // ⬇
  [star_wrong,       '\u2B50'],     // ⭐
  [lightning_wrong,  '\u26A1'],     // ⚡
  [rocket_wrong,     '\uD83D\uDE80'], // 🚀
  [lock_wrong,       '\uD83D\uDD10'], // 🔐
  [phone_wrong,      '\uD83D\uDCF1'], // 📱
  [people_wrong,     '\uD83D\uDC65'], // 👥
  [diamond_wrong,    '\uD83D\uDC8E'], // 💎
  [chart_wrong,      '\uD83D\uDCCA'], // 📊
  [page_wrong,       '\uD83D\uDCC4'], // 📄
  [carousel_wrong,   '\uD83C\uDFA0'], // 🎠
  [globe_wrong,      '\uD83C\uDF0D'], // 🌍
  // Lone Â must be last (it is a prefix of many above)
  [lone_Â,           ''],
];

function sanitizeText(val) {
  if (typeof val !== 'string') return val;
  let out = val;
  for (const [from, to] of REP) {
    if (out.includes(from)) {
      // Use split/join to replace all occurrences safely
      out = out.split(from).join(to);
    }
  }
  return out;
}

function sanitizeObject(obj) {
  if (!obj) return obj;
  if (typeof obj === 'string') return sanitizeText(obj);
  if (Array.isArray(obj)) return obj.map(item => sanitizeObject(item));
  if (typeof obj === 'object') {
    const res = {};
    for (const [k, v] of Object.entries(obj)) {
      res[k] = sanitizeObject(v);
    }
    return res;
  }
  return obj;
}

// ---- MAIN ----
let raw = fs.readFileSync(filePath);
let stripped = false;

// Strip UTF-8 BOM (EF BB BF)
if (raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF) {
  console.log('UTF-8 BOM detected — stripping...');
  raw = raw.slice(3);
  stripped = true;
}

let parsed;
try {
  parsed = JSON.parse(raw.toString('utf8'));
} catch (e) {
  console.error('JSON parse error after BOM strip:', e.message);
  process.exit(1);
}

const cleaned = sanitizeObject(parsed);

// Write back as UTF-8 without BOM
fs.writeFileSync(filePath, JSON.stringify(cleaned, null, 2), { encoding: 'utf8' });
console.log('data/site.json written (no BOM, UTF-8 clean).');
if (stripped) console.log('   BOM was removed.');
console.log('Done.');
