import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { appendFile } from 'node:fs/promises';
import { openDatabase,initialize } from './db.js';
import { createApp } from './app.js';
let password=process.env.ADMIN_PASSWORD;
if(process.env.NODE_ENV==='production'&&!process.env.DATABASE_URL&&!process.env.PGHOST)throw new Error('Set DATABASE_URL or PostgreSQL PG* variables before production startup.');
if(!password){
  if(process.env.NODE_ENV==='production')throw new Error('Set ADMIN_PASSWORD before production startup.');
  password=randomBytes(18).toString('base64url');
  await appendFile('.env',`\nADMIN_PASSWORD=${password}\n`);
  console.log('Đã tạo mật khẩu quản trị trong .env (ADMIN_PASSWORD).');
}
const db=await openDatabase(process.env.DATABASE_URL);
await initialize(db);
const app=await createApp(db,{password,production:process.env.NODE_ENV==='production'});
const server=app.listen(process.env.PORT||3001,process.env.HOST||'127.0.0.1',()=>console.log(`Ruby House API: http://${process.env.HOST||'127.0.0.1'}:${process.env.PORT||3001} | Database: ${process.env.DATABASE_URL||process.env.PGHOST?'PostgreSQL server':'local persistent PostgreSQL (PGlite)'}`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(async()=>{await db.close();process.exit(0);}));
