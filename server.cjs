const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const types = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.svg':'image/svg+xml'};
http.createServer((req,res)=>{
  let pathname;
  try {pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);} catch {res.writeHead(400);return res.end();}
  const allowed=['index.html','styles.css','data.js','app.js'];
  const file=pathname==='/'?'index.html':pathname.slice(1);
  if(!allowed.includes(file)){res.writeHead(404);return res.end('Not found');}
  fs.readFile(path.join(__dirname,file),(error,body)=>{if(error){res.writeHead(500);return res.end('Read error');}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(body);});
}).listen(4173,'127.0.0.1',()=>console.log('Local: http://localhost:4173'));
