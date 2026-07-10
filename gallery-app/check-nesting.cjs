const fs = require('fs');
const lines = fs.readFileSync('src/pages/ProductDetailPage.tsx','utf8').split('\n');
let depth = 0;
for (let i = 309; i < Math.min(632, lines.length); i++) {
  const l = lines[i];
  const opens = (l.match(/<div[\s>]/g) || []).length;
  const closes = (l.match(/<\/div>/g) || []).length;
  depth += opens - closes;
  if (opens > 0 || closes > 0) {
    console.log((i+1) + ': depth=' + depth + ' +' + opens + ' -' + closes + ' | ' + l.trim().substring(0, 100));
  }
  if (depth < 0) {
    console.log('  *** NEGATIVE DEPTH at line ' + (i+1) + ' ***');
  }
}
console.log('Final depth:', depth);
