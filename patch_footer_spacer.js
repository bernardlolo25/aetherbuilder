/**
 * patch_footer_spacer.js
 * Adds a page-bottom spacer <div> after a fixed footer so content is never hidden behind it.
 * Run: node patch_footer_spacer.js
 */
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'js', 'widgets.js');
let content = fs.readFileSync(filePath, 'utf8');

// Replace the minimal footer return to wrap with spacer
const OLD_MINIMAL_RETURN =
  "      // Mode 1: Display ONLY Copyright Section\n" +
  "      if (props.showOnlyCopyright) {\n" +
  "        return `";

const NEW_MINIMAL_RETURN =
  "      // Height of the footer for spacer (approx)\n" +
  "      const footerHeight = props.fixedBottom\n" +
  "        ? (props.showOnlyCopyright ? '72px' : (props.showColumns !== false ? '320px' : '120px'))\n" +
  "        : '0px';\n" +
  "      const spacerHtml = props.fixedBottom\n" +
  "        ? '<div class=\"wb-footer-spacer\" style=\"height: ' + footerHeight + '; width: 100%; display: block;\"></div>'\n" +
  "        : '';\n\n" +
  "      // Mode 1: Display ONLY Copyright Section\n" +
  "      if (props.showOnlyCopyright) {\n" +
  "        return spacerHtml + `";

content = content.split(OLD_MINIMAL_RETURN).join(NEW_MINIMAL_RETURN);

// Also update the end of minimal return to close the spacer
// The minimal footer ends with:   `;\n      }\n
// We add spacerHtml before the backtick template literal
// The template already starts with spacerHtml + `...` so the return includes spacer + footer HTML

// Now update full footer return similarly
const OLD_FULL_RETURN = "      return `\n        <footer class=\"wb-footer\" style=\"${fixedStyle}\">";
const NEW_FULL_RETURN = "      return spacerHtml + `\n        <footer class=\"wb-footer\" style=\"${fixedStyle}\">";

content = content.split(OLD_FULL_RETURN).join(NEW_FULL_RETURN);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Footer spacer patch applied.');
