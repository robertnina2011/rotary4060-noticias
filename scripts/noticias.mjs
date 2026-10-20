/* Recolector de noticias del Distrito 4060.
   Busca cada día noticias sobre Rotary, Rotaract e Interact en República Dominicana (Google Noticias),
   las entradas del sitio rotary4060.org y, si hay credenciales, las últimas publicaciones de Instagram.
   Devuelve las vigentes (las más recientes) y un archivo que nunca borra nada.

   Uso local:   node scripts/noticias.mjs          → escribe data/noticias.json, data/archivo-noticias.json, data/instagram.json
   En Netlify:  netlify/functions/noticias-diarias.mjs lo ejecuta a diario y guarda el resultado en Netlify Blobs.

   Instagram no permite leer perfiles sin permiso. Para mostrar publicaciones, cada cuenta debe ser
   profesional (empresa o creador) y generar un token de la API de Instagram; se configuran como variables:
   IG_TOKEN_ROTARYDISTRITO4060, IG_TOKEN_INTERACT4060, IG_TOKEN_CLUBROTARACTSANCRISTOBAL. Sin token, esa cuenta se omite. */

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const VIGENTES = 12;            // cuántas se muestran en la portada
const DIAS_VIGENCIA = 180;      // más antiguas que esto pasan solo al archivo
const IG_CUENTAS = ['rotarydistrito4060', 'interact4060', 'clubrotaractsancristobal'];

const BUSQUEDAS = [
  '"Distrito 4060" Rotary',
  '"Club Rotario" República Dominicana',
  '"Rotary" "República Dominicana"',
  'Rotaract dominicana',
  '"club Interact" dominicana',
  'rotarios dominicanos'
];

const limpiar = s => String(s || '')
  .replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim();
const clave = t => limpiar(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').slice(0, 90);
// nombres de los clubes del distrito (de assets/clubes.js): una noticia que los menciona es del distrito
const CLUBES_4060 = ["Santo Domingo Centro Neurodiversidad", "San Felipe Intercultural DCHSAA", "Santiago Monumental Innovador", "Santo Domingo Arroyo Hondo", "Santiago de los Caballeros", "Santo Domingo Bella Vista", "Santo Domingo Quisqueya", "La Romana Flor del Este", "San Juan de la Maguana", "San Juan de La Maguana", "Las Matas de Farfán RD", "Santo Domingo Colonial", "Santo Domingo Poniente", "San José de las Matas", "Santiago Rincon Largo", "Santiago Empresarial", "San Pedro de Macorís", "Las Matas de Farfán", "La Romana Río Dulce", "Santo Domingo Norte", "Santiago Monumental", "Punta Cana-Bávaro", "Cayetano Germosen", "Universidad Intec", "Santiago Gurabito", "Romana Rio Dulce", "Santiago Corazón", "Villa Trina-Moca", "Santiago Apostól", "Santiago Centro", "Higüey-Cayacoa", "San Cristóbal", "Rancho Arriba", "Santa Barbara", "Puerto Plata", "La Vega Real", "Las Terrenas", "Villa Tapia", "Pedernales", "Villa Riva", "La Romana", "Esperanza", "Navarrete", "Barahona", "Anacaona", "Pimentel", "Tamboril", "Sánchez", "Tenares", "Salcedo", "Maguana", "Dajabón", "Higuey", "Sosua", "Nizao", "Cotui", "Nagua", "Bonao", "Cotuí"];
const fold = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const CLUB_RE = new RegExp(CLUBES_4060.map(c => fold(c).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'));
const tema = t => /rotari|rotary|rotaract|interact(iano| 4060|\b.*club)|club interact|paul harris|polio/i.test(t);
const fuera = t => /venezuela|aruba|argentina|colombia|m[eé]xico|per[uú]|chile|guatemala|honduras|ecuador|bolivia|paraguay|uruguay|espa[nñ]a|puerto rico|panam[aá]|costa rica|el salvador|nicaragua|cuba|distrito (?!4060)\d{4}/i.test(t);
const rdTexto = t => /dominican|\brd\b|santo domingo|santiago|la vega|san cristobal|san crist[oó]bal|punta cana|la romana|bávaro|bavaro|moca|bani|baní|azua|higüey|higuey|puerto plata|san juan|monte plata|barahona|samaná|samana|bonao|cotu[ií]|distrito 4060|listín|listin|diario libre|hoy digital|el nuevo diario|el caribe|n digital|acento|cdn|z101|el d[ií]a/i.test(t);
const rd = (titulo, fuente) => !fuera(titulo) && (rdTexto(`${titulo} ${fuente}`) || CLUB_RE.test(fold(titulo)));

async function get(url, ms = 15000, as = 'text') {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, {headers: {'user-agent': UA, 'accept-language': 'es-DO,es;q=0.9'}, signal: c.signal});
    if (!r.ok) return null;
    return as === 'json' ? await r.json() : await r.text();
  } catch { return null; } finally { clearTimeout(t); }
}

async function googleNoticias() {
  const out = [];
  for (const q of BUSQUEDAS) {
    const xml = await get(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=es-419&gl=DO&ceid=DO:es-419`);
    if (!xml) continue;
    for (const it of xml.split('<item>').slice(1)) {
      const tag = n => (it.match(new RegExp(`<${n}[^>]*>([\\s\\S]*?)</${n}>`)) || [])[1] || '';
      const fuente = limpiar(tag('source'));
      let titulo = limpiar(tag('title'));
      if (fuente && titulo.endsWith(' - ' + fuente)) titulo = titulo.slice(0, -(fuente.length + 3));
      const fecha = new Date(limpiar(tag('pubDate')));
      if (!titulo || isNaN(fecha)) continue;
      if (!tema(titulo) || !rd(titulo, fuente)) continue;
      out.push({titulo, url: limpiar(tag('link')), fuente: fuente || 'Prensa', fecha: fecha.toISOString(), tipo: 'prensa'});
    }
  }
  return out;
}

async function sitioDistrito() {
  const posts = await get('https://rotary4060.org/wp-json/wp/v2/posts?per_page=10&_embed=wp:featuredmedia&_fields=date,link,title,excerpt,_embedded,_links', 15000, 'json');
  if (!Array.isArray(posts)) return [];
  return posts.map(p => ({
    titulo: limpiar(p.title && p.title.rendered),
    url: p.link,
    fuente: 'rotary4060.org',
    fecha: new Date(p.date).toISOString(),
    resumen: limpiar(p.excerpt && p.excerpt.rendered).slice(0, 220),
    imagen: (((p._embedded || {})['wp:featuredmedia'] || [])[0] || {}).source_url || null,
    tipo: 'distrito'
  })).filter(p => p.titulo);
}

async function instagram(env = {}) {
  const out = [];
  for (const cuenta of IG_CUENTAS) {
    const token = env[`IG_TOKEN_${cuenta.toUpperCase()}`];
    if (!token) continue;
    const j = await get(`https://graph.instagram.com/me/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp&limit=6&access_token=${encodeURIComponent(token)}`, 15000, 'json');
    for (const m of (j && j.data) || []) out.push({
      cuenta, url: m.permalink, fecha: m.timestamp,
      imagen: m.media_type === 'VIDEO' ? m.thumbnail_url : m.media_url,
      texto: limpiar(m.caption).slice(0, 160)
    });
  }
  return out.sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 9);
}

/* Une lo nuevo con el archivo previo (sin duplicados, por enlace o por título) y separa las vigentes. */
export async function recolectar(archivoPrevio = [], env = {}) {
  const [prensa, distrito, ig] = await Promise.all([googleNoticias(), sitioDistrito(), instagram(env)]);
  const vistos = new Map();
  for (const n of [...archivoPrevio, ...distrito, ...prensa]) {
    const k = clave(n.titulo);
    if (!k) continue;
    const prev = vistos.get(k);
    if (!prev) vistos.set(k, {...n, visto: n.visto || new Date().toISOString()});
    else if (!prev.imagen && n.imagen) vistos.set(k, {...prev, imagen: n.imagen, resumen: prev.resumen || n.resumen});
  }
  const archivo = [...vistos.values()].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const limite = Date.now() - DIAS_VIGENCIA * 864e5;
  const vigentes = archivo.filter(n => +new Date(n.fecha) >= limite).slice(0, VIGENTES);
  const actualizado = new Date().toISOString();
  return {
    noticias: {actualizado, vigentes},
    archivo: {actualizado, total: archivo.length, noticias: archivo},
    instagram: {actualizado, cuentas: IG_CUENTAS, publicaciones: ig}
  };
}

/* Ejecución local: lee el archivo existente, recolecta y escribe los tres JSON. */
const {fileURLToPath} = await import('node:url');
if (typeof process !== 'undefined' && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
  await fs.mkdir(dir, {recursive: true});
  let previo = [];
  try { previo = JSON.parse(await fs.readFile(path.join(dir, 'archivo-noticias.json'), 'utf8')).noticias || []; } catch {}
  const r = await recolectar(previo, process.env);
  await fs.writeFile(path.join(dir, 'noticias.json'), JSON.stringify(r.noticias, null, 1));
  await fs.writeFile(path.join(dir, 'archivo-noticias.json'), JSON.stringify(r.archivo, null, 1));
  await fs.writeFile(path.join(dir, 'instagram.json'), JSON.stringify(r.instagram, null, 1));
  console.log(`Vigentes: ${r.noticias.vigentes.length} · Archivo: ${r.archivo.total} · Instagram: ${r.instagram.publicaciones.length}`);
}
