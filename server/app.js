import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { fileTypeFromFile } from 'file-type';
import { z } from 'zod';
import { randomUUID, randomBytes, timingSafeEqual, scryptSync } from 'node:crypto';
import { mkdir, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';

const safeUrl=z.string().max(2000).refine(s=>/^\/uploads\/(?:[a-z0-9-]+\/)*[a-z0-9-]+\.(jpg|jpeg|png|webp|gif|mp4|webm)$/i.test(s)||(()=>{try{return new URL(s).protocol==='https:';}catch{return false;}})(),'URL phải là HTTPS hoặc tệp đã tải lên.');
const optionalPrice=z.union([z.literal(''),z.string().trim().max(50),z.number()]).nullable().optional();
const roomSchema=z.object({location_id:z.string().min(1),name:z.string().trim().min(2).max(120),area:z.coerce.number().int().min(1).max(2000),bedrooms:z.coerce.number().int().min(0).max(20),description:z.string().trim().min(10).max(5000),amenities:z.array(z.string().trim().min(1).max(100)).max(30),monthly_price:optionalPrice,promotion_price:optionalPrice,daily_price:optionalPrice,availability:z.enum(['available','occupied']).default('occupied'),published:z.boolean(),media:z.array(z.object({kind:z.enum(['image','video']),url:safeUrl,alt:z.string().max(200).default('')})).max(50)});
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const inquirySchema=z.object({name:z.string().trim().min(2).max(100),phone:z.string().trim().regex(/^[+\d ()-]{8,25}$/),email:z.union([z.literal(''),z.string().email().max(200)]).default(''),location_id:z.string().min(1),room_id:z.string().nullable().optional(),visit_date:z.string().nullable().optional().refine(s=>!s||(/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s&&s>=today()),'Ngày xem phòng không hợp lệ hoặc đã qua.'),method:z.enum(['Trực tiếp','Video call']),note:z.string().max(2000).default('')});

export async function createApp(db,{password,uploadDir='./uploads',production=false}={}){
  const app=express();const sessions=new Map();
  const mailTo=(process.env.MAIL_TO||'').split(',').map(value=>value.trim()).filter(Boolean);
  const mailer=process.env.SMTP_USER&&process.env.SMTP_PASS&&mailTo.length?nodemailer.createTransport({host:process.env.SMTP_HOST||'smtp.gmail.com',port:Number(process.env.SMTP_PORT||465),secure:process.env.SMTP_SECURE!=='false',auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}}):null;
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  await mkdir(uploadDir,{recursive:true});
  await db.query('CREATE TABLE IF NOT EXISTS admin_credentials (id TEXT PRIMARY KEY, password_hash TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
  const hashPassword=value=>{const salt=randomBytes(16).toString('hex');return `${salt}:${scryptSync(value,salt,64).toString('hex')}`;};
  const verifyPassword=(value,stored)=>{try{const [salt,expectedHex]=stored.split(':');const actual=scryptSync(value,salt,64),expected=Buffer.from(expectedHex,'hex');return actual.length===expected.length&&timingSafeEqual(actual,expected);}catch{return false;}};
  if(!(await db.query("SELECT id FROM admin_credentials WHERE id='primary'")).rows.length)await db.query("INSERT INTO admin_credentials (id,password_hash) VALUES ('primary',$1)",[hashPassword(password)]);
  app.use(helmet({strictTransportSecurity:false,contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'",'https://fonts.googleapis.com'],fontSrc:["'self'",'https://fonts.gstatic.com'],imgSrc:["'self'",'https:','blob:'],mediaSrc:["'self'",'https:','blob:'],connectSrc:["'self'"],upgradeInsecureRequests:null}}}));
  app.use(express.json({limit:'1mb'}));
  app.use('/api',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
  app.use('/uploads',express.static(path.resolve(uploadDir),{dotfiles:'deny',maxAge:'1d'}));
  const protect=(req,res,next)=>{
    const token=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('ruby_session='))?.slice(13);
    const session=sessions.get(token);
    if(!session||session<Date.now()){sessions.delete(token);return res.status(401).json({error:'Vui lòng đăng nhập quản trị.'});}
    if(!['GET','HEAD'].includes(req.method)&&req.headers['x-ruby-admin']!=='1')return res.status(403).json({error:'Yêu cầu không hợp lệ.'});
    next();
  };
  app.get('/api/health',async(_req,res)=>{await db.query('SELECT 1');res.json({ok:true});});
  app.post('/api/admin/login',rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-7',legacyHeaders:false}), async(req,res)=>{
    const input=typeof req.body.password==='string'?req.body.password:'';
    const stored=(await db.query("SELECT password_hash FROM admin_credentials WHERE id='primary'")).rows[0]?.password_hash;
    if(!stored||!verifyPassword(input,stored))return res.status(401).json({error:'Mật khẩu không đúng.'});
    for(const [token,expiry] of sessions)if(expiry<Date.now())sessions.delete(token);
    const token=randomBytes(32).toString('hex');sessions.set(token,Date.now()+8*60*60*1000);
    res.cookie('ruby_session',token,{httpOnly:true,sameSite:'strict',secure:production,maxAge:8*60*60*1000,path:'/api/admin'});res.json({ok:true});
  });
  app.use('/api/admin',protect);
  app.get('/api/admin/session',(_req,res)=>res.json({ok:true}));
  app.post('/api/admin/change-password',async(req,res)=>{
    const schema=z.object({currentPassword:z.string().min(1).max(200),newPassword:z.string().min(10,'Mật khẩu mới cần ít nhất 10 ký tự.').max(200)});
    const data=schema.parse(req.body),stored=(await db.query("SELECT password_hash FROM admin_credentials WHERE id='primary'")).rows[0]?.password_hash;
    if(!stored||!verifyPassword(data.currentPassword,stored))return res.status(400).json({error:'Mật khẩu hiện tại không đúng.'});
    if(data.currentPassword===data.newPassword)return res.status(400).json({error:'Mật khẩu mới phải khác mật khẩu hiện tại.'});
    await db.query("UPDATE admin_credentials SET password_hash=$1,updated_at=NOW() WHERE id='primary'",[hashPassword(data.newPassword)]);
    sessions.clear();res.clearCookie('ruby_session',{path:'/api/admin'}).json({ok:true});
  });
  app.post('/api/admin/logout',(req,res)=>{
    const token=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('ruby_session='))?.slice(13);sessions.delete(token);
    res.clearCookie('ruby_session',{path:'/api/admin'}).json({ok:true});
  });
  async function catalog(admin=false){
    const [locations,rooms,media]=await Promise.all([db.query('SELECT * FROM locations ORDER BY position'),db.query(`SELECT * FROM rooms ${admin?'':'WHERE published = true'} ORDER BY created_at,id`),db.query('SELECT * FROM media ORDER BY position,id')]);
    return {locations:locations.rows,rooms:rooms.rows.map(r=>({...r,media:media.rows.filter(m=>m.room_id===r.id)}))};
  }
  app.get('/api/catalog',async(_req,res)=>res.json(await catalog()));
  app.get('/api/admin/catalog',async(_req,res)=>res.json(await catalog(true)));
  async function saveRoom(req,res){
    const r=roomSchema.parse(req.body),id=req.params.id||randomUUID();
    if(!(await db.query('SELECT id FROM locations WHERE id=$1',[r.location_id])).rows.length)return res.status(400).json({error:'Cơ sở không hợp lệ.'});
    if(req.params.id&&!(await db.query('SELECT id FROM rooms WHERE id=$1',[id])).rows.length)return res.status(404).json({error:'Không tìm thấy phòng.'});
    await db.transaction(async tx=>{
      await tx.query(`INSERT INTO rooms (id,location_id,name,area,bedrooms,description,amenities,published,monthly_price,promotion_price,daily_price,availability) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT(id) DO UPDATE SET location_id=$2,name=$3,area=$4,bedrooms=$5,description=$6,amenities=$7,published=$8,monthly_price=$9,promotion_price=$10,daily_price=$11,availability=$12`,[id,r.location_id,r.name,r.area,r.bedrooms,r.description,JSON.stringify(r.amenities),r.published,r.monthly_price||null,r.promotion_price||null,r.daily_price||null,r.availability]);
      await tx.query('DELETE FROM media WHERE room_id=$1',[id]);
      for(const [position,m] of r.media.entries())await tx.query('INSERT INTO media VALUES ($1,$2,$3,$4,$5,$6)',[randomUUID(),id,m.kind,m.url,m.alt,position]);
    });res.status(req.params.id?200:201).json({id});
  }
  app.post('/api/admin/rooms',saveRoom);app.put('/api/admin/rooms/:id',saveRoom);
  app.delete('/api/admin/rooms/:id',async(req,res)=>{await db.query('DELETE FROM rooms WHERE id=$1',[req.params.id]);res.json({ok:true});});
  const upload=multer({dest:path.resolve(uploadDir),limits:{fileSize:500*1024*1024,files:1}});
  app.post('/api/admin/upload',upload.single('file'),async(req,res,next)=>{
    if(!req.file)return res.status(400).json({error:'Vui lòng chọn tệp.'});
    try{
      const type=await fileTypeFromFile(req.file.path);
      const allowed=['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm'];
      if(!type||!allowed.includes(type.mime)|| (type.mime.startsWith('image/')&&req.file.size>20*1024*1024)){
        await unlink(req.file.path);return res.status(400).json({error:'Chấp nhận JPG, PNG, WebP, GIF tối đa 20 MB; MP4, WebM tối đa 500 MB.'});
      }
      const name=`${randomUUID()}.${type.ext}`;await rename(req.file.path,path.join(uploadDir,name));
      res.status(201).json({url:`/uploads/${name}`,kind:type.mime.startsWith('image/')?'image':'video',alt:req.file.originalname.slice(0,200)});
    }catch(e){await unlink(req.file.path).catch(()=>{});next(e);}
  });
  app.post('/api/inquiries',rateLimit({windowMs:60*60*1000,limit:10,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Bạn đã gửi nhiều yêu cầu. Vui lòng thử lại sau hoặc gọi hotline.'}}),async(req,res)=>{
    const data=inquirySchema.parse(req.body);
    if(!(await db.query('SELECT id FROM locations WHERE id=$1',[data.location_id])).rows.length)return res.status(400).json({error:'Cơ sở không hợp lệ.'});
    if(data.room_id&&!(await db.query("SELECT id FROM rooms WHERE id=$1 AND location_id=$2 AND published=true AND availability='available'",[data.room_id,data.location_id])).rows.length)return res.status(400).json({error:'Phòng đã được thuê, không còn hiển thị hoặc không thuộc cơ sở đã chọn.'});
    const id=randomUUID();await db.query('INSERT INTO inquiries (id,name,phone,email,location_id,room_id,visit_date,method,note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',[id,data.name,data.phone,data.email,data.location_id,data.room_id||null,data.visit_date||null,data.method,data.note]);
    if(mailer){
      const location=(await db.query('SELECT name FROM locations WHERE id=$1',[data.location_id])).rows[0]?.name||data.location_id;
      const room=data.room_id?(await db.query('SELECT name FROM rooms WHERE id=$1',[data.room_id])).rows[0]?.name:'Cần tư vấn căn hộ';
      const text=[`Có yêu cầu xem phòng mới #${id.slice(0,8).toUpperCase()}`,`Khách hàng: ${data.name}`,`Điện thoại: ${data.phone}`,`Email: ${data.email||'Không cung cấp'}`,`Cơ sở: ${location}`,`Phòng: ${room}`,`Ngày dự kiến: ${data.visit_date||'Chưa chọn'}`,`Hình thức: ${data.method}`,`Lời nhắn: ${data.note||'Không có'}`].join('\n');
      const fields=[['Khách hàng',data.name],['Điện thoại',data.phone],['Email',data.email||'Không cung cấp'],['Cơ sở',location],['Phòng',room],['Ngày dự kiến',data.visit_date||'Chưa chọn'],['Hình thức',data.method]];
      const html=`<!doctype html><html><body style="margin:0;background:#f5f1ed;font-family:Arial,sans-serif;color:#292929"><div style="padding:32px 12px"><div style="max-width:640px;margin:auto;background:#fff;border-top:5px solid #a80316;box-shadow:0 8px 28px rgba(0,0,0,.08)"><div style="padding:28px 32px 20px;border-bottom:1px solid #e8e1dc"><div style="font-size:22px;font-weight:700;color:#a80316">RubyHouse</div><div style="margin-top:6px;font-size:12px;letter-spacing:.12em;color:#777">YÊU CẦU XEM PHÒNG MỚI</div></div><div style="padding:26px 32px"><p style="margin:0 0 22px;color:#555">Khách hàng vừa gửi yêu cầu từ website. Vui lòng liên hệ để xác nhận lịch hẹn.</p><table role="presentation" style="width:100%;border-collapse:collapse">${fields.map(([label,value])=>`<tr><td style="width:135px;padding:11px 8px;border-bottom:1px solid #eee;color:#777;font-size:13px">${label}</td><td style="padding:11px 8px;border-bottom:1px solid #eee;font-weight:600">${escapeHtml(value)}</td></tr>`).join('')}</table><div style="margin-top:24px;padding:18px;background:#f8f3f1;border-left:3px solid #a80316"><div style="font-size:12px;font-weight:700;color:#a80316;letter-spacing:.08em">LỜI NHẮN</div><div style="margin-top:9px;line-height:1.6;white-space:pre-wrap">${escapeHtml(data.note||'Không có')}</div></div><div style="margin-top:24px;font-size:12px;color:#888">Mã yêu cầu: <strong>${id.slice(0,8).toUpperCase()}</strong></div></div><div style="padding:17px 32px;background:#292929;color:#bbb;font-size:11px">RubyHouse · Your trusted home away from home</div></div></div></body></html>`;
      mailer.sendMail({from:`${process.env.MAIL_FROM_NAME||'RubyHouse Website'} <${process.env.SMTP_USER}>`,to:mailTo,replyTo:data.email||undefined,subject:`[RubyHouse] Yêu cầu xem phòng mới - ${data.name}`,text,html,priority:'high',headers:{Importance:'high','X-Priority':'1'}}).catch(error=>console.error('Không gửi được email thông báo:',error.message));
    }
    res.status(201).json({id});
  });
  app.get('/api/admin/inquiries',async(_req,res)=>res.json((await db.query(`SELECT i.*,l.name AS location_name,r.name AS room_name FROM inquiries i JOIN locations l ON l.id=i.location_id LEFT JOIN rooms r ON r.id=i.room_id ORDER BY i.created_at DESC LIMIT 500`)).rows));
  app.delete('/api/admin/inquiries/:id',async(req,res)=>{
    const result=await db.query('DELETE FROM inquiries WHERE id=$1 RETURNING id',[req.params.id]);
    if(!result.rows.length)return res.status(404).json({error:'Không tìm thấy yêu cầu.'});
    res.json({ok:true});
  });
  app.use('/api',(_req,res)=>res.status(404).json({error:'Không tìm thấy API.'}));
  app.use(express.static(path.resolve('dist')));
  app.get('/{*path}',(_req,res)=>res.sendFile(path.resolve('dist/index.html')));
  app.use((err,_req,res,_next)=>{
    if(err instanceof z.ZodError)return res.status(400).json({error:'Vui lòng kiểm tra thông tin đã nhập.',details:err.flatten()});
    if(err instanceof multer.MulterError)return res.status(400).json({error:'Tệp quá lớn hoặc tải lên không hợp lệ (video tối đa 500 MB).'});
    console.error(err.message);res.status(500).json({error:'Không thể xử lý yêu cầu. Vui lòng thử lại.'});
  });return app;
}
