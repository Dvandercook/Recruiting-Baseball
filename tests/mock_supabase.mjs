/* A stand-in for the parts of Supabase the app actually calls, so sync can be
   tested end to end without touching a real project. Implements the same
   contract as the SQL: server-stamped updated_at, upsert on (kind,rid),
   updated_at=gte filtering, and auth that rejects unknown users. */
import http from 'http';

const USERS = { 'dv@school.edu':'pw1', 'coach2@school.edu':'pw2' };
const rows = new Map();           // "kind rid" -> row
let seq = 0;
const stamp = () => {
  seq++;
  return new Date(Date.UTC(2026, 7, 16, 12, 0, 0, 0) + seq * 1000).toISOString();
};
const sessions = new Map();       // access_token -> email

function body(req){
  return new Promise(res=>{ let b=''; req.on('data',c=>b+=c); req.on('end',()=>res(b)); });
}
function send(res, code, obj){
  const s = JSON.stringify(obj);
  res.writeHead(code, {'Content-Type':'application/json','Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'});
  res.end(s);
}

export function start(port){
  const srv = http.createServer(async (req,res)=>{
    const u = new URL(req.url, 'http://x');
    if(req.method === 'OPTIONS') return send(res, 200, {});

    if(u.pathname === '/auth/v1/token'){
      const b = JSON.parse((await body(req)) || '{}');
      if(u.searchParams.get('grant_type') === 'refresh_token'){
        const email = [...sessions.entries()].find(([,e])=> b.refresh_token === 'r-'+e);
        if(!email) return send(res, 401, { error_description:'bad refresh token' });
        return send(res, 200, { access_token:'a-'+email[1], refresh_token:b.refresh_token,
                                expires_in:3600, user:{ email:email[1] } });
      }
      if(USERS[b.email] !== b.password){
        return send(res, 400, { error_description:'Invalid login credentials' });
      }
      const tok = 'a-' + b.email;
      sessions.set(tok, b.email);
      return send(res, 200, { access_token:tok, refresh_token:'r-'+b.email,
                              expires_in:3600, user:{ email:b.email } });
    }

    if(u.pathname === '/rest/v1/records'){
      const auth = String(req.headers.authorization || '').replace('Bearer ','');
      const email = sessions.get(auth);
      if(!email) return send(res, 401, { message:'JWT required' });   // RLS stand-in

      if(req.method === 'POST'){
        const list = JSON.parse((await body(req)) || '[]');
        const out = list.map(r=>{
          const row = { kind:r.kind, rid:r.rid, data:r.data || {}, deleted:!!r.deleted,
                        updated_at: stamp(), updated_by: email };
          rows.set(r.kind + ' ' + r.rid, row);
          return row;
        });
        return send(res, 201, out);
      }
      if(req.method === 'GET'){
        const f = u.searchParams.get('updated_at');   // "gte.<iso>"
        const since = f ? f.split('.').slice(1).join('.') : '';
        const del = u.searchParams.get('deleted');    // "eq.false"
        let out = [...rows.values()]
          .filter(r=> !since || r.updated_at >= since)
          .filter(r=> !del || String(r.deleted) === del.split('.')[1])
          .sort((a,b)=> a.updated_at.localeCompare(b.updated_at));
        // PostgREST-style Range header paging
        const range = String(req.headers.range || '');
        const m = range.match(/^(\d+)-(\d+)$/);
        if(m) out = out.slice(+m[1], +m[2] + 1);
        return send(res, 200, out);
      }
    }
    send(res, 404, { message:'no route' });
  });
  return new Promise(r=> srv.listen(port, ()=> r({ srv, rows,
    reset(){ rows.clear(); seq = 0; } })));
}
