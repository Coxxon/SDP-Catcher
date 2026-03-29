const fs = require('fs');
const glob = require('glob'); // Not available by default maybe?
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    isDirectory ? walkDir(dirPath, callback) : callback(path.join(dir, f));
  });
}

function processFile(filePath) {
  if (!filePath.endsWith('.tsx') && !filePath.endsWith('.css')) return;
  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // 1. Replace Tailwind arbitrary pixels: [10px] -> [0.625rem]
  content = content.replace(/\[([0-9\.]+)px\]/g, (match, p1) => {
    const rem = parseFloat(p1) / 16;
    return `[${rem}rem]`;
  });

  // 2. Replace Lucide sizes: size={14} -> size="0.875rem"
  // size={12} -> size="0.75rem"
  content = content.replace(/size={([0-9\.]+)}/g, (match, p1) => {
    const rem = parseFloat(p1) / 16;
    return `size="${rem}rem"`;
  });
  
  // 3. Replace any hard inline styles if any (like width: 10px -> width: 0.625rem)
  content = content.replace(/:\s*([0-9\.]+)px/g, (match, p1) => {
    const rem = parseFloat(p1) / 16;
    return `: ${rem}rem`;
  });

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${filePath}`);
  }
}

walkDir(path.join(__dirname, 'src'), processFile);
console.log("Done");
