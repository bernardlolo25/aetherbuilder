import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const siteJsonPath = path.join(__dirname, 'data', 'site.json');

if (fs.existsSync(siteJsonPath)) {
  // Read as raw bytes to handle BOM detection
  let raw = fs.readFileSync(siteJsonPath);

  // Strip UTF-8 BOM (EF BB BF) if present - prevents JSON parse failure
  if (raw[0] === 0xEF && raw[1] === 0xBB && raw[2] === 0xBF) {
    console.log('BOM detected — stripping...');
    raw = raw.slice(3);
  }

  let content = raw.toString('utf8');

  // Replace common corrupted UTF-8 byte sequences (Latin-1 mojibake)
  const replacements = [
    [/\u00C2\u00A9/g, '\u00A9'],      // Â© -> ©
    [/\u00C2\u00AE/g, '\u00AE'],      // Â® -> ®
    [/\u00C2\u00B7/g, '\u00B7'],      // Â· -> ·
    [/\u00E2\u0080\u00A2/g, '\u2022'], // â€¢ -> •
    [/\u00E2\u0080\u0093/g, '\u2013'], // â€" -> –
    [/\u00E2\u0080\u0099/g, '\u2019'], // â€™ -> '
    [/\u00E2\u0080\u009C/g, '\u201C'], // â€œ -> "
    [/\u00E2\u0080\u009D/g, '\u201D'], // â€  -> "
    [/\u00E2\u009C\u0093/g, '\u2713'], // âœ" -> ✓
    [/\u00E2\u009C\u00A8/g, '\u2728'], // âœ¨ -> ✨
    [/\u00E2\u0086\u0092/g, '\u2192'], // â†' -> →
    [/\u00E2\u0086\u0091/g, '\u2191'], // â†' -> ↑
    [/\u00E2\u0086\u0093/g, '\u2193'], // â†" -> ↓
    [/\u00E2\u0096\u00B6/g, '\u25B6'], // â–¶ -> ▶
    [/\u00E2\u0096\u00B8/g, '\u25B8'], // â–¸ -> ▸
    [/\u00E2\u0096\u00BE/g, '\u25BE'], // â—¾ -> ▾
    [/\u00E2\u00AC\u0087/g, '\u2B07'], // â¬‡ -> ⬇
    [/\u00E2\u00AD\u0090/g, '\u2B50'], // â­  -> ⭐
    [/\u00E2\u009A\u00A1/g, '\u26A1'], // âš¡ -> ⚡
    // 4-byte emoji misread as 4 Latin-1 chars
    [/\u00C3\u00B0\u0178\u0161\u201A\u20AC/g, '\uD83D\uDE80'], // 🚀
    [/\u00C3\u00B0\u0178\u201D\u20AC/g, '\uD83D\uDD10'],       // 🔐
    [/\u00C3\u00B0\u0178\u201D\u00B1/g, '\uD83D\uDCF1'],       // 📱
    [/\u00C3\u00B0\u0178\u2019\u00A5/g, '\uD83D\uDC65'],       // 👥
    [/\u00C3\u00B0\u0178\u2019\u017D/g, '\uD83D\uDC8E'],       // 💎
    [/\u00C3\u00B0\u0178\u201D\u008A/g, '\uD83D\uDCCA'],       // 📊
    [/\u00C3\u00B0\u0178\u201D\u201E/g, '\uD83D\uDCC4'],       // 📄
    [/\u00C3\u00B0\u0178\u017D\u00A0/g, '\uD83C\uDFA0'],       // 🎠
    [/\u00C3\u00B0\u0178\u008C/g,       '\uD83C\uDF0D'],       // 🌍
    // Lone Â (must be last — it's a prefix of other patterns)
    [/\u00C2\u00A0/g, ' '],   // Â NBSP -> space
    [/\u00C2/g, ''],          // lone Â -> remove
  ];

  for (const [regex, rep] of replacements) {
    content = content.replace(regex, rep);
  }

  // Parse and re-format JSON cleanly with UTF-8 (no BOM)
  try {
    const obj = JSON.parse(content);
    fs.writeFileSync(siteJsonPath, JSON.stringify(obj, null, 2), { encoding: 'utf8' });
    console.log('\u2705 data/site.json successfully cleaned, BOM removed, UTF-8 sanitized.');
  } catch (e) {
    fs.writeFileSync(siteJsonPath, content, { encoding: 'utf8' });
    console.log('\u2705 data/site.json text cleaned (JSON re-format skipped).');
    console.error('JSON parse error:', e.message);
  }
} else {
  console.log('data/site.json does not exist yet.');
}
