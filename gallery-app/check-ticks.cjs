const fs = require('fs');
const lines = fs.readFileSync('src/pages/ProductDetailPage.tsx','utf8').split('\n');
for(let i=0;i<lines.length;i++){
  const cnt = (lines[i].match(/`/g)||[]).length;
  if(cnt>0) console.log((i+1)+': n='+cnt+' '+lines[i].trim().substring(0,120));
}
