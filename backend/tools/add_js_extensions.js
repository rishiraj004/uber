const fs = require('fs');
const path = require('path');

function processFile(filePath) {
  let text = fs.readFileSync(filePath, 'utf8');
  const dir = path.dirname(filePath);
  // regex to match import/export lines with relative paths without extension
  const re = /(import\s+[\s\S]*?from\s+|export\s+\{?[\s\S]*?\}?\s+from\s+)(['"])(\.\.\/|\.\/[^'"\n]+?)(['"])/g;
  // Also handle dynamic import() and require()
  const re2 = /(import\(|require\()(['"])(\.\.\/|\.\/)([^'"\)]+)(['"])\)?/g;

  let changed = false;
  text = text.replace(re, (m, p1, q, rel) => {
    // p1 already contains the part up to from
    // extract the path
    const parts = m.split(p1);
    const rest = parts[1];
    const quote = rest[0];
    const pathStr = rest.slice(1, rest.indexOf(quote, 1));
    // if path already has extension, skip
    if (/\.[tj]s(x)?$/.test(pathStr) || pathStr.endsWith('/')) return m;
    const newPath = `${pathStr}.js`;
    changed = true;
    return `${p1}${q}${newPath}${q}`;
  });

  text = text.replace(re2, (m, p1, q, rel, p4, q2) => {
    const pathStr = p4;
    if (/\.[tj]s(x)?$/.test(pathStr) || pathStr.endsWith('/')) return m;
    changed = true;
    return `${p1}${q}${rel}${pathStr}.js${q2}` + (m.endsWith(')') ? ')' : '');
  });

  if (changed) {
    fs.writeFileSync(filePath, text, 'utf8');
    console.log('Updated', filePath);
  }
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.isFile() && full.endsWith('.ts')) processFile(full);
  }
}

const target = path.join(__dirname, '..', 'src');
walk(target);
console.log('Done');
