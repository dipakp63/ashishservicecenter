const fs = require('fs');
const path = require('path');

const appJsPath = path.join(__dirname, 'public', 'app.js');
const empBlockPath = path.join(__dirname, 'emp_block.js');

try {
  let appJs = fs.readFileSync(appJsPath, 'utf8');
  const empBlock = fs.readFileSync(empBlockPath, 'utf8');

  const startMarker = '  // ── EMPLOYEE MANAGEMENT ──────────────────────────────────────────────────────';
  const endMarker = '  // ── END EMPLOYEE MANAGEMENT ───────────────────────────────────────────────────';

  const startIndex = appJs.indexOf(startMarker);
  const endIndex = appJs.indexOf(endMarker);

  if (startIndex === -1 || endIndex === -1) {
    console.error('Error: Could not find markers in public/app.js');
    process.exit(1);
  }

  const before = appJs.substring(0, startIndex);
  const after = appJs.substring(endIndex + endMarker.length);

  const updatedAppJs = before + empBlock + after;
  fs.writeFileSync(appJsPath, updatedAppJs, 'utf8');
  console.log('Successfully spliced emp_block.js into public/app.js using markers.');
} catch (err) {
  console.error('Splicing failed:', err.message);
  process.exit(1);
}
