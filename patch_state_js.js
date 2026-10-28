/**
 * patch_state_js.js - Rewrites the sanitizeText function in js/state.js
 * Uses only ASCII character codes - no raw multibyte chars in this script.
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'js', 'state.js');
let content = fs.readFileSync(filePath, 'utf8');

// Find the sanitizeText function start and end
const fnStart = content.indexOf('// Recursive UTF-8 Mojibake Sanitizer');
const fnEnd   = content.indexOf('\nexport function sanitizeObject');

if (fnStart === -1 || fnEnd === -1) {
  console.error('Could not find sanitizeText function boundaries in state.js');
  process.exit(1);
}

const newFn = `// Recursive UTF-8 Mojibake Sanitizer & Repair Engine
export function sanitizeText(val) {
  if (typeof val !== 'string') return val;
  let out = val;
  // 2-byte sequences (C2 xx) misread as Latin-1 (Windows-1252)
  out = out.split('\\u00C2\\u00A9').join('\\u00A9');   // Â© -> ©
  out = out.split('\\u00C2\\u00AE').join('\\u00AE');   // Â® -> ®
  out = out.split('\\u00C2\\u00B7').join('\\u00B7');   // Â· -> ·
  // 3-byte sequences (E2 xx xx) misread as Latin-1
  out = out.split('\\u00E2\\u0080\\u00A2').join('\\u2022'); // â€¢ -> bullet
  out = out.split('\\u00E2\\u0080\\u0093').join('\\u2013'); // â€" -> en dash
  out = out.split('\\u00E2\\u0080\\u0099').join('\\u2019'); // â€™ -> rsquote
  out = out.split('\\u00E2\\u0080\\u009C').join('\\u201C'); // â€œ -> ldquote
  out = out.split('\\u00E2\\u0080\\u009D').join('\\u201D'); // â€  -> rdquote
  out = out.split('\\u00E2\\u009C\\u0093').join('\\u2713'); // âœ" -> checkmark
  out = out.split('\\u00E2\\u009C\\u00A8').join('\\u2728'); // âœ¨ -> sparkles
  out = out.split('\\u00E2\\u0086\\u0092').join('\\u2192'); // â†' -> right arrow
  out = out.split('\\u00E2\\u0086\\u0091').join('\\u2191'); // â†' -> up arrow
  out = out.split('\\u00E2\\u0086\\u0093').join('\\u2193'); // â†" -> down arrow
  out = out.split('\\u00E2\\u0096\\u00B6').join('\\u25B6'); // â–¶ -> play triangle
  out = out.split('\\u00E2\\u0096\\u00B8').join('\\u25B8'); // â–¸ -> small play
  out = out.split('\\u00E2\\u0096\\u00BE').join('\\u25BE'); // â—¾ -> down triangle
  out = out.split('\\u00E2\\u00AC\\u0087').join('\\u2B07'); // â¬‡ -> down arrow box
  out = out.split('\\u00E2\\u00AD\\u0090').join('\\u2B50'); // â­  -> star
  out = out.split('\\u00E2\\u009A\\u00A1').join('\\u26A1'); // âš¡ -> lightning
  out = out.split('\\u00E2\\u009C\\u0089').join('\\u2709'); // âœ‰ -> envelope
  // 4-byte emoji (F0 9F xx xx) misread as Latin-1
  out = out.split('\\u00C3\\u00B0\\u0178\\u0161\\u201A\\u20AC').join('\\uD83D\\uDE80'); // 🚀
  out = out.split('\\u00C3\\u00B0\\u0178\\u201D\\u20AC').join('\\uD83D\\uDD10');       // 🔐
  out = out.split('\\u00C3\\u00B0\\u0178\\u201D\\u00B1').join('\\uD83D\\uDCF1');       // 📱
  out = out.split('\\u00C3\\u00B0\\u0178\\u2019\\u00A5').join('\\uD83D\\uDC65');       // 👥
  out = out.split('\\u00C3\\u00B0\\u0178\\u2019\\u017D').join('\\uD83D\\uDC8E');       // 💎
  out = out.split('\\u00C3\\u00B0\\u0178\\u201D\\u008A').join('\\uD83D\\uDCCA');       // 📊
  out = out.split('\\u00C3\\u00B0\\u0178\\u201D\\u201E').join('\\uD83D\\uDCC4');       // 📄
  out = out.split('\\u00C3\\u00B0\\u0178\\u017D\\u00A0').join('\\uD83C\\uDFA0');       // 🎠
  out = out.split('\\u00C3\\u00B0\\u0178\\u008C').join('\\uD83C\\uDF0D');              // 🌍
  out = out.split('\\u00C3\\u00B0\\u0178\\u201D\\u008A').join('\\uD83D\\uDCCA');       // 📊
  // Remove stray lone Â (must be last)
  out = out.split('\\u00C2\\u00A0').join(' ');          // Â NBSP -> space
  out = out.split('\\u00C2').join('');                  // lone Â -> remove
  return out;
}
`;

const before = content.slice(0, fnStart);
const after  = content.slice(fnEnd);
const patched = before + newFn + after;

fs.writeFileSync(filePath, patched, 'utf8');
console.log('state.js sanitizeText function patched successfully.');
console.log('Function length:', newFn.length, 'chars');
