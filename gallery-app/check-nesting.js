const fs = require('fs');
const lines = fs.readFileSync('src/pages/ProductDetailPage.tsx', 'utf8').split('\n');
let depth = 0;
for (let i = 309; i < Math.min(595, lines.length); i++) {
  const line = lines[i];
  const opens = (line.match(/<div[\s>]/g) || []).length;
  const closes = (line.match(/<\/div>/g) || []).length;
  const mainOpens = (line.match(/<main[\s>]/g) || []).length;
  const mainCloses = (line.match(/<\/main>/g) || []).length;
  depth += opens - closes;
  if (opens > 0 || closes > 0) {
    console.log(`${i+1}: depth=${depth} +${opens} -${closes} | ${line.trim().substring(0, 80)}`);
  }
  if (depth < 0) {
    console.log(`  *** NEGATIVE DEPTH at line ${i+1} ***`);
  }
}
