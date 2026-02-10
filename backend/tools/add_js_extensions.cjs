const fs = require('fs');
const path = require('path');

function processFile(filePath) {
  let text = fs.readFileSync(filePath, 'utf8');
  const dir = path.dirname(filePath);
  // regex to match import/export lines with relative paths without extension
  const re = /(import\s+[\s\S]*?from\s+|export\s+\{?[\s\S]*?\}?\s+from\s+)(['"])(\.\.?\/[^'"\n]+?)(['"])/g;
  // Also handle dynamic import() and require()
  const re2 = /(import\(|require\()(['"])(\.\.?\/)([^'"\)]+)(['"])\)?/g;

  let changed = false;
  text = text.replace(re, (m, p1, q, rel, q2) => {
    const pathStr = rel;
    // if path already has extension or ends with slash, skip
    if (/\.[tj]s(x)?$/.test(pathStr) || pathStr.endsWith('/')) return m;
    // determine whether path corresponds to a file or directory
    const absoluteTs = path.join(dir, pathStr + '.ts');
    const absoluteIndexTs = path.join(dir, pathStr, 'index.ts');
    let replacement;
    if (fs.existsSync(absoluteTs)) {
      replacement = `${pathStr}.js`;
    } else if (fs.existsSync(absoluteIndexTs)) {
      replacement = `${pathStr}/index.js`;
    } else {
      // default to .js
      replacement = `${pathStr}.js`;
    }
    changed = true;
    return `${p1}${q}${replacement}${q}`;
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

// Post-pass: convert imports that became './name.js' but actually point to a
// directory (with index.ts) into './name/index.js'
function fixDirectoryStyle() {
  const files = [];
  function collect(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) collect(full);
      else if (e.isFile() && full.endsWith('.ts')) files.push(full);
    }
  }
  collect(target);
  const importRe = /(from\s+['"])(\.\.?\/[^'"\n]+)\.js(['"])/g;
  for (const f of files) {
    let txt = fs.readFileSync(f, 'utf8');
    let changed2 = false;
    txt = txt.replace(importRe, (m, p1, p2, p3) => {
      const maybeDir = path.join(path.dirname(f), p2);
      if (fs.existsSync(maybeDir) && fs.statSync(maybeDir).isDirectory()) {
        changed2 = true;
        return `${p1}${p2}/index.js${p3}`;
      }
      return m;
    });
    if (changed2) {
      fs.writeFileSync(f, txt, 'utf8');
      console.log('Fixed directory import in', f);
    }
  }
}

fixDirectoryStyle();
