/* Real minification, with the two constraints this app actually has:
   - top-level names are the shared API between files, so they must not be
     mangled or dropped as "unused" (a9 calls into a3, a13 into a5, and so on)
   - nothing may be reordered across files                                   */
import { minify } from 'terser';
import fs from 'fs';

const [,, inPath, outPath] = process.argv;
const code = fs.readFileSync(inPath, 'utf8');
const res = await minify(code, {
  ecma: 2020,
  compress: { toplevel: false, passes: 2, drop_debugger: true },
  mangle:   { toplevel: false },      // locals only; globals keep their names
  format:   { comments: false },
});
if(res.error) throw res.error;
fs.writeFileSync(outPath, res.code);
console.log(`${inPath} ${code.length} -> ${res.code.length}`);
