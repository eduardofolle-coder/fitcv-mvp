const fs = require('fs');
const path = require('path');

function fixFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const originalContent = content;

  // Only fix local imports (those starting with ./ or ../)
  content = content.replace(/from\s+['"](\.[^'"]+?)(?<!\.js)['"];/g, (match, importPath) => {
    return `from '${importPath}.js';`;
  });

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content);
    console.log(`✅ Fixed: ${path.basename(filePath)}`);
    return true;
  }
  return false;
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      walkDir(fullPath);
    } else if (file.endsWith('.js')) {
      fixFile(fullPath);
    }
  });
}

const distDir = path.join(__dirname, 'dist');
console.log('Fixing ESM imports in', distDir);
walkDir(distDir);
console.log('✅ Done');
