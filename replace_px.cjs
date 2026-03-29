const fs = require('fs');
const path = require('path');

function walkDir(dir, callback) {
  fs.readdirSync(dir).forEach(f => {
    let dirPath = path.join(dir, f);
    let isDirectory = fs.statSync(dirPath).isDirectory();
    if (isDirectory) {
      walkDir(dirPath, callback);
    } else {
      callback(path.join(dir, f));
    }
  });
}

function processFile(filePath) {
  if (!filePath.endsWith('.tsx')) return;
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    let originalContent = content;

    // 1. arbitrary pixels: [10px] -> [0.625rem]
    content = content.replace(/\[([0-9\.]+)px\]/g, (match, p1) => {
      const rem = parseFloat(p1) / 16;
      return `[${rem}rem]`;
    });

    // 2. Lucide sizes: size={14} -> size="0.875rem"
    content = content.replace(/size={([0-9\.]+)}/g, (match, p1) => {
      const rem = parseFloat(p1) / 16;
      return `size="${rem}rem"`;
    });

    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Updated ${filePath}`);
    }
  } catch (err) {
    console.error(`Failed on ${filePath}: ${err.message}`);
  }
}

try {
  walkDir(path.join(__dirname, 'src'), processFile);
  console.log("Success");
} catch (err) {
  console.error(err);
}
