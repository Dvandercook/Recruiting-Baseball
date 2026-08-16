import CleanCSS from 'clean-css';
import fs from 'fs';
const [,, inPath, outPath] = process.argv;
const css = fs.readFileSync(inPath, 'utf8');
// level 1 only: whitespace, shorter colours, redundant semicolons. Level 2
// reorders and merges rules, which this stylesheet's cascade relies on.
const out = new CleanCSS({ level: 1 }).minify(css);
if(out.errors.length) throw new Error(out.errors.join('; '));
fs.writeFileSync(outPath, out.styles);
console.log(`css ${css.length} -> ${out.styles.length}`);
