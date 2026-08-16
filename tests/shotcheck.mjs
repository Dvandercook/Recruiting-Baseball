import { chromium } from 'playwright';
const b = await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const p = await (await b.newContext()).newPage();
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR: '+e.message));

// Stand in for the model, returning what Luke Potter's bio should yield.
await p.addInitScript(() => {
  const real = window.fetch;
  window.fetch = async (url, opts) => {
    if(String(url).includes('api.anthropic.com')){
      window.__sentSystem = JSON.parse(opts.body).system;
      return { ok:true, status:200, text: async () => '', json: async () => ({ content: [{ type:'text', text: JSON.stringify({
        first:'Luke', last:'Potter', xHandle:'@LukePotterr6',
        position:'OF', state:'IL', city:'Downers Grove',
        school:'DGS HS', team:'Trosky Illinois 17U',
        gradClass:'2028', bt:'L/L',
        height:'5\'11"', weight:'176lbs', gpa:'3.76 GPA',
        phone:'630-743-9824', email:'Potterluke860@gmail.com',
        commit:'', pbrUrl:'', pgUrl:'',
        metrics:'EV 100, 60: 6.92, OFVel 85, BtSp 79.4, also WR/DB',
        originNotes:'X bio screenshot'
      })}]})};
    }
    return real(url, opts);
  };
});
await p.goto('file:///home/claude/recruiting_board_v2.html'); await p.waitForTimeout(1100);
await p.locator('[data-goto="hs"]').click(); await p.waitForTimeout(600);
await p.locator('#addPlayerBtn').click(); await p.waitForTimeout(400);
// a dummy image just to enable the button
await p.setInputFiles('#f_screenshot', { name:'shot.png', mimeType:'image/png',
  buffer: Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082','hex') });
await p.waitForTimeout(400);
await p.locator('#extractBtn').click(); await p.waitForTimeout(1200);

console.log('prompt asks for phone:', (await p.evaluate(()=>window.__sentSystem)).includes('phone: the phone number'));
console.log('status:', await p.locator('#shotStatus').innerText());
console.log('\nform after extraction:');
for (const [label,id] of [['first','f_first'],['last','f_last'],['pos','f_pos'],['state','f_state'],
  ['city','f_city'],['school','f_school'],['team','f_team'],['grad','f_grad'],['bt','f_bt'],
  ['height','f_height'],['weight','f_weight'],['gpa','f_gpa'],['phone','f_phone'],['email','f_email'],
  ['x','f_x'],['commit','f_commit'],['pbr','f_pbr'],['origin','f_origin'],['notes','f_notes']]) {
  const v = await p.locator('#'+id).inputValue();
  console.log('  '+label.padEnd(7), v ? v : '(blank)');
}
console.log('\n-- save and check the profile --');
await p.locator('#submitAdd').click(); await p.waitForTimeout(1000);
console.log('  drawer:', await p.locator('#dName').innerText(), '|', (await p.locator('#dSub').innerText()).replace(/\n/g,' | '));
console.log('  phone :', await p.locator('#fi_phone').inputValue());
console.log('  email :', await p.locator('#fi_email').inputValue());
console.log('  height:', await p.locator('#fi_height').inputValue(), '| weight:', await p.locator('#fi_weight').inputValue(), '| gpa:', await p.locator('#fi_gpa').inputValue());
console.log('  X link:', await p.locator('#fi_xLink').inputValue());
console.log('  notes :', await p.locator('#notesArea').inputValue());

console.log('\n-- a bio with no phone/email says so --');
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
await p.evaluate(()=>{
  const real = window.fetch;
  window.fetch = async (u,o)=> String(u).includes('api.anthropic.com')
    ? { ok:true, status:200, text: async()=>'', json: async()=>({content:[{type:'text',text:JSON.stringify({first:'Test',last:'Nocontact',position:'RHP',phone:'',email:''})}]}) }
    : real(u,o);
});
await p.locator('#addPlayerBtn').click(); await p.waitForTimeout(400);
await p.setInputFiles('#f_screenshot', { name:'s.png', mimeType:'image/png', buffer: Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082','hex') });
await p.waitForTimeout(300);
await p.locator('#extractBtn').click(); await p.waitForTimeout(1000);
console.log(' ', await p.locator('#shotStatus').innerText());
console.log('\nERRORS:', errs.length?errs:'none');
await b.close();
