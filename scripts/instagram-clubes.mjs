/* Últimas publicaciones de Instagram de cada club del Distrito 4060.
   Lee el perfil incrustado oficial (instagram.com/<cuenta>/embed/), que es público y trae las publicaciones recientes,
   guarda las 4 más nuevas de cada cuenta con su foto optimizada y borra las que ya no están.
   Cuentas: data/instagram-cuentas.json  ({"clubes": {"<slug del club>": "<usuario>"}, "distrito": ["<usuario>", …]})
   Resultado: data/instagram-clubes.json y data/ig/<usuario>/<código>.webp
   Uso: node scripts/instagram-clubes.mjs  (lo ejecuta cada mañana el flujo de GitHub Actions). */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
const POR_CUENTA = 4;
let sharp = null;
try { sharp = (await import('sharp')).default; } catch {}

async function perfil(usuario) {
  // con un navegador «completo» Instagram responde la versión que se arma con JavaScript; la sencilla trae los datos en el HTML
  const r = await fetch(`https://www.instagram.com/${usuario}/embed/?cr=1&v=14`, {headers: {'user-agent': 'Mozilla/5.0', 'accept-language': 'es-DO,es;q=0.9'}});
  if (!r.ok) return null;
  const m = (await r.text()).match(/"contextJSON":"((?:[^"\\]|\\.)*)"/);
  if (!m) return null;
  const c = JSON.parse(JSON.parse(`"${m[1]}"`)).context || {};
  const posts = (c.graphql_media || []).map(x => x.shortcode_media).filter(Boolean)
    .sort((a, b) => b.taken_at_timestamp - a.taken_at_timestamp).slice(0, POR_CUENTA);
  return {
    nombre: c.full_name || usuario, seguidores: c.followers_count ?? null, total: c.posts_count ?? null, foto: c.profile_pic_url || null,
    posts: posts.map(p => ({
      code: p.shortcode, url: `https://www.instagram.com/p/${p.shortcode}/`,
      src: p.display_url, video: !!p.is_video, album: p.__typename === 'GraphSidecar',
      fecha: new Date(p.taken_at_timestamp * 1000).toISOString(),
      texto: ((p.edge_media_to_caption?.edges || [])[0]?.node?.text || '').replace(/\s+/g, ' ').trim().slice(0, 280),
      likes: p.edge_liked_by?.count ?? p.edge_media_preview_like?.count ?? null,
      comentarios: p.edge_media_to_comment?.count ?? null
    }))
  };
}

async function guardar(url, destino, ancho) {
  try {
    const r = await fetch(url, {headers: {'user-agent': UA}});
    if (!r.ok) return null;
    let buf = Buffer.from(await r.arrayBuffer()), ext = 'jpg';
    if (sharp) { buf = await sharp(buf).resize({width: ancho, withoutEnlargement: true}).webp({quality: 74}).toBuffer(); ext = 'webp'; }
    const rel = `${destino}.${ext}`;
    await fs.mkdir(path.dirname(path.join(DIR, rel)), {recursive: true});
    await fs.writeFile(path.join(DIR, rel), buf);
    return rel;
  } catch { return null; }
}

const cfg = JSON.parse(await fs.readFile(path.join(DIR, 'instagram-cuentas.json'), 'utf8'));
let previo = {};
try { previo = JSON.parse(await fs.readFile(path.join(DIR, 'instagram-clubes.json'), 'utf8')).cuentas || {}; } catch {}
const usuarios = [...new Set([...Object.values(cfg.clubes || {}), ...(cfg.distrito || [])])];
const cuentas = {};
for (const u of usuarios) {
  const p = await perfil(u);
  if (!p || !p.posts.length) { if (previo[u]) cuentas[u] = previo[u]; console.log(`@${u}: sin respuesta, se mantiene lo anterior`); continue; }
  const avatar = p.foto ? await guardar(p.foto, `ig/${u}/perfil`, 160) : null;
  const posts = [];
  for (const x of p.posts) {
    const ya = (previo[u]?.posts || []).find(o => o.code === x.code && o.img);
    const img = ya ? ya.img : await guardar(x.src, `ig/${u}/${x.code}`, 720);
    const {src, ...resto} = x;
    posts.push({...resto, img});
  }
  cuentas[u] = {nombre: p.nombre, seguidores: p.seguidores, total: p.total, avatar: avatar || previo[u]?.avatar || null, posts};
  // borra fotos de publicaciones que ya salieron de las 4 últimas
  const quedan = new Set(posts.map(x => x.img).concat(cuentas[u].avatar).filter(Boolean).map(f => path.basename(f)));
  for (const f of await fs.readdir(path.join(DIR, 'ig', u)).catch(() => [])) if (!quedan.has(f)) await fs.rm(path.join(DIR, 'ig', u, f));
  console.log(`@${u}: ${posts.length} publicaciones`);
  await new Promise(r => setTimeout(r, 1500)); // sin prisa: una cuenta cada segundo y medio
}
await fs.writeFile(path.join(DIR, 'instagram-clubes.json'), JSON.stringify({actualizado: new Date().toISOString(), clubes: cfg.clubes, cuentas}, null, 1));
