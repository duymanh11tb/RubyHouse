import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { mkdir } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';

export async function openDatabase(url, directory='./data/postgres') {
  if (url || process.env.PGHOST) {
    const pool = new pg.Pool(url ? {connectionString:url} : {});
    await pool.query('SELECT 1');
    return {query:(...args)=>pool.query(...args), transaction:async fn=>{
      const client=await pool.connect();
      try {await client.query('BEGIN');const result=await fn(client);await client.query('COMMIT');return result;}
      catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
    },close:()=>pool.end()};
  }
  if(directory) await mkdir(directory,{recursive:true});
  const db=new PGlite(directory);
  await db.waitReady;
  return db;
}

export async function initialize(db){
  await db.query(`CREATE TABLE IF NOT EXISTS locations (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, address TEXT NOT NULL, description TEXT NOT NULL, position INTEGER NOT NULL
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY, location_id TEXT NOT NULL REFERENCES locations(id), name TEXT NOT NULL,
    area INTEGER NOT NULL CHECK(area > 0), bedrooms INTEGER NOT NULL CHECK(bedrooms >= 0),
    description TEXT NOT NULL, amenities JSONB NOT NULL DEFAULT '[]', published BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await db.query('ALTER TABLE rooms ADD COLUMN IF NOT EXISTS monthly_price TEXT');
  await db.query('ALTER TABLE rooms ADD COLUMN IF NOT EXISTS promotion_price TEXT');
  await db.query('ALTER TABLE rooms ADD COLUMN IF NOT EXISTS daily_price TEXT');
  await db.query("ALTER TABLE rooms ADD COLUMN IF NOT EXISTS availability TEXT NOT NULL DEFAULT 'occupied'");
  await db.query(`CREATE TABLE IF NOT EXISTS media (
    id TEXT PRIMARY KEY, room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN ('image','video')), url TEXT NOT NULL, alt TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS banner_media (
    id TEXT PRIMARY KEY, url TEXT NOT NULL, alt TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS inquiries (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL DEFAULT '',
    location_id TEXT NOT NULL REFERENCES locations(id), room_id TEXT REFERENCES rooms(id) ON DELETE SET NULL,
    visit_date DATE, method TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await db.query(`CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY)`);
  await db.transaction(async tx=>{
    const seeded=await tx.query("SELECT name FROM app_migrations WHERE name='initial-content'");
    if(seeded.rows.length)return;
    const locations=[
      ['van-phuc','Vạn Phúc','Số 1–3, ngõ 1 Vạn Phúc, Ba Đình, Hà Nội','Đối diện Đại sứ quán Nhật Bản, gần Lotte Center và Vinhomes Metropolis.',1],
      ['lieu-giai','Liễu Giai','Số 13, ngõ 19 Liễu Giai, Ba Đình, Hà Nội','Không gian sống yên tĩnh giữa trung tâm, thuận tiện làm việc và di chuyển.',2],
      ['phan-ke-binh','Phan Kế Bính','Số 12, ngõ 35 Phan Kế Bính, Ba Đình, Hà Nội','Gần phố ẩm thực Nhật Bản Linh Lang và Kim Mã, tiện nghi cho cuộc sống mỗi ngày.',3]
    ];
    for(const l of locations)await tx.query('INSERT INTO locations VALUES ($1,$2,$3,$4,$5)',l);
    const specs=[['van-phuc',48,1],['van-phuc',80,2],['lieu-giai',42,0],['lieu-giai',54,1],['phan-ke-binh',45,1],['phan-ke-binh',52,1]];
    for(const [loc,area,beds] of specs){
      await tx.query('INSERT INTO rooms (id,location_id,name,area,bedrooms,description,amenities) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [`${loc}-${area}`,loc,`${beds===0?'Studio':'Căn hộ'} ${area}m²`,area,beds,'Không gian sống riêng tư với nội thất đầy đủ, khu vực bếp và góc làm việc. Vui lòng liên hệ Ruby House để được tư vấn thông tin và tình trạng phòng thực tế.',JSON.stringify(['Wi-Fi tốc độ cao','Bếp đầy đủ tiện nghi','Điều hòa 2 chiều','Máy giặt','Bồn tắm','Dọn phòng'])]);
    }
    await tx.query("INSERT INTO app_migrations VALUES ('initial-content')");
  });

  const catalogImported=await db.query("SELECT name FROM app_migrations WHERE name='price-list-2026'");
  if(!catalogImported.rows.length){
    const source=JSON.parse(await readFile(new URL('./price-list-2026.json',import.meta.url),'utf8'));
    await db.transaction(async tx=>{
      await tx.query('DELETE FROM rooms');
      for(const room of source.rooms){
        await tx.query(
          'INSERT INTO rooms (id,location_id,name,area,bedrooms,description,amenities,published) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [room.id,room.location_id,room.name,room.area,room.bedrooms,room.description,JSON.stringify(room.amenities),room.published]
        );
        for(const [position,media] of room.media.entries()){
          await tx.query(
            'INSERT INTO media (id,room_id,kind,url,alt,position) VALUES ($1,$2,$3,$4,$5,$6)',
            [`${room.id}-media-${position+1}`,room.id,media.kind,media.url,media.alt||room.name,position]
          );
        }
      }
      await tx.query("INSERT INTO app_migrations VALUES ('price-list-2026')");
    });
  }

  const pricingImported=await db.query("SELECT name FROM app_migrations WHERE name='pricing-status-2026'");
  if(!pricingImported.rows.length){
    const source=JSON.parse(await readFile(new URL('./price-list-2026.json',import.meta.url),'utf8'));
    await db.transaction(async tx=>{
      for(const room of source.rooms){
        await tx.query(
          'UPDATE rooms SET monthly_price=$2,promotion_price=$3,daily_price=$4,availability=$5 WHERE id=$1',
          [room.id,room.monthly_price==null?null:String(room.monthly_price),room.promotion_price==null?null:String(room.promotion_price),room.daily_price==null||room.daily_price==='None'?null:String(room.daily_price),room.availability]
        );
      }
      await tx.query("INSERT INTO app_migrations VALUES ('pricing-status-2026')");
    });
  }
  const banners=await db.query('SELECT id FROM banner_media LIMIT 1');
  if(!banners.rows.length){
    await db.query("INSERT INTO banner_media (id,url,alt,position) SELECT 'initial-banner',url,alt,0 FROM media WHERE kind='image' ORDER BY position,id LIMIT 1");
  }
}
