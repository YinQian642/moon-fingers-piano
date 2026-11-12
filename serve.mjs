import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('./dist',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm','.svg':'image/svg+xml','.json':'application/json','.mp3':'audio/mpeg','.mid':'audio/midi'};
http.createServer(async(req,res)=>{try {const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const target=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!target.startsWith(root+path.sep))throw Error();const data=await fs.readFile(target);res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(data);}catch{res.writeHead(404);res.end('Not found');}}).listen(4192,'127.0.0.1',()=>console.log('Local: http://127.0.0.1:4192'));
