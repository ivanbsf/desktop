'use strict';
/* ===== Configuração =====
   Vazio = detecta dono/repositório/pasta pela URL do GitHub Pages
   (ex.: usuario.github.io/repo/pasta/). Preencha só se precisar (ex.: teste local). */
const CONFIG = { owner: '', repo: '', pasta: '', branch: '' };

// Só caminhos de imagem conhecidos são aceitos vindos do JSON (evita URLs maliciosas)
const RE_ICONE = /^(assets\/site-icons\/[a-z0-9-]+\.png|data:image\/png;base64,[A-Za-z0-9+/=]+)$/;
const RE_FUNDO = /^(assets\/fundo-[a-z0-9]+\.jpg|data:image\/jpeg;base64,[A-Za-z0-9+/=]+)$/;

const $ = (s) => document.querySelector(s);
let dados = { titulo: 'Meus sites', descricao: '', overlay: 50, fundo: '', sites: [] };
let editando = false, token = null, sujo = false;
const locais = new Map();   // caminho -> {blob,url}: arquivos novos, para exibição
let pendentes = new Set();  // caminhos a enviar ao publicar
let publicados = new Set(); // caminhos que já estão no repositório
let remover = new Set();    // caminhos a apagar do repositório ao publicar

/* ===== Utilidades ===== */
// Cria elementos sem innerHTML (todo texto entra como texto, nunca como HTML)
function el(tag, props = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) k.startsWith('aria-') ? e.setAttribute(k, v) : (e[k] = v);
  e.append(...filhos);
  return e;
}
const id = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('');
const src = (p) => locais.get(p)?.url || p;
const usados = () => [dados.fundo, ...dados.sites.map((s) => s.icone)].filter((p) => p && !p.startsWith('data:'));
function aviso(msg) {
  $('#aviso').textContent = msg;
  clearTimeout(aviso.t);
  aviso.t = setTimeout(() => ($('#aviso').textContent = ''), 7000);
}
// Aceita apenas http/https, com host e sem usuário/senha embutidos
function urlValida(txt) {
  try {
    const u = new URL(String(txt).trim());
    return ['http:', 'https:'].includes(u.protocol) && u.hostname && !u.username && !u.password ? u.href : null;
  } catch { return null; }
}
// Valida/normaliza o sites.json carregado
function limpar(j) {
  return {
    titulo: String(j.titulo || 'Meus sites').slice(0, 60),
    descricao: String(j.descricao || '').slice(0, 160),
    overlay: Math.min(90, Math.max(0, Number(j.overlay ?? 50) || 0)),
    fundo: RE_FUNDO.test(j.fundo || '') ? j.fundo : '',
    sites: (Array.isArray(j.sites) ? j.sites : []).map((x) => ({
      id: String(x.id || '').replace(/[^a-z0-9-]/gi, '').slice(0, 20) || id(),
      nome: String(x.nome || '').slice(0, 40),
      url: urlValida(x.url || ''),
      icone: RE_ICONE.test(x.icone || '') ? x.icone : '',
    })).filter((x) => x.nome && x.url),
  };
}

/* ===== Renderização ===== */
function renderizar() {
  $('#titulo').textContent = dados.titulo;
  $('#descricao').textContent = dados.descricao;
  document.title = dados.titulo;
  const r = document.documentElement.style; // CSSOM é permitido pela CSP
  r.setProperty('--ov', dados.overlay / 100);
  r.setProperty('--fundo', dados.fundo ? `url("${src(dados.fundo)}")` : 'none');
  const grade = $('#grade');
  grade.replaceChildren();
  for (const s of dados.sites) {
    const icone = s.icone ? el('img', { className: 'ico', src: src(s.icone), alt: '', loading: 'lazy' })
                          : el('div', { className: 'ico' }, s.nome[0].toUpperCase());
    // Abre em nova aba com rel seguro
    const li = el('li', {}, el('a', { className: 'card', href: s.url, target: '_blank', rel: 'noopener noreferrer' }, icone, el('span', {}, s.nome)));
    if (editando) li.append(el('div', { className: 'edit' },
      el('button', { type: 'button', textContent: 'Editar', 'aria-label': `Editar ${s.nome}`, onclick: () => abrirSite(s) }),
      el('button', { type: 'button', textContent: 'Remover', 'aria-label': `Remover ${s.nome}`, onclick: () => removerSite(s) })));
    grade.append(li);
  }
  $('#vazio').hidden = dados.sites.length > 0;
  barra();
}
function barra() {
  const b = $('#barra');
  b.replaceChildren();
  const btn = (t, f, c = '') => b.append(el('button', { type: 'button', textContent: t, onclick: f, className: c }));
  if (!editando) return btn('Editar', () => $('#dSenha').showModal());
  btn('Adicionar site', () => abrirSite());
  btn('Aparência', abrirAparencia);
  btn(token ? 'Publicar' : 'Exportar JSON', token ? publicar : exportar, 'primario');
  if (token) btn('Exportar JSON', exportar);
  btn('Sair', sair);
}
const alterado = () => { sujo = true; renderizar(); };

/* ===== Imagens: validação e redimensionamento no navegador ===== */
async function ehPng(f) { // confere a assinatura real do arquivo, não só a extensão
  const h = new Uint8Array(await f.slice(0, 8).arrayBuffer());
  return [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => h[i] === v);
}
async function redimensionar(arquivo, max, tipo, qualidade) {
  const bmp = await createImageBitmap(arquivo);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = el('canvas', { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
  const g = c.getContext('2d');
  if (tipo === 'image/jpeg') { g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); }
  g.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((ok, erro) => c.toBlob((b) => (b ? ok(b) : erro(new Error('Não foi possível processar a imagem.'))), tipo, qualidade));
}
function adicionarLocal(caminho, blob) {
  locais.set(caminho, { blob, url: URL.createObjectURL(blob) });
  pendentes.add(caminho);
  return caminho;
}
function descartar(caminho) { // arquivo deixou de ser usado
  if (!caminho || caminho.startsWith('data:')) return;
  if (locais.has(caminho)) { URL.revokeObjectURL(locais.get(caminho).url); locais.delete(caminho); }
  pendentes.delete(caminho);
  if (publicados.has(caminho)) remover.add(caminho);
}
function prever(img, url) { img.hidden = !url; url ? (img.src = url) : img.removeAttribute('src'); }

/* ===== Cards: adicionar / editar / remover ===== */
let siteEdit = null, iconeNovo = null;
function abrirSite(s) {
  siteEdit = s || null; iconeNovo = null;
  const f = $('#fSite');
  f.reset();
  f.querySelector('.erro').textContent = '';
  $('#tSite').textContent = s ? 'Editar site' : 'Novo site';
  f.elements.nome.value = s?.nome || '';
  f.elements.url.value = s?.url || '';
  prever($('#pIcone'), s?.icone ? src(s.icone) : '');
  $('#dSite').showModal();
}
$('#fSite').elements.icone.onchange = async (e) => {
  const f = e.target.files[0], erro = $('#fSite .erro');
  erro.textContent = ''; iconeNovo = null;
  if (!f) return;
  try {
    if (f.size > 2e6 || !(await ehPng(f))) throw new Error('Envie um arquivo PNG de até 2 MB.');
    iconeNovo = await redimensionar(f, 256, 'image/png'); // prévia antes de salvar
    prever($('#pIcone'), URL.createObjectURL(iconeNovo));
  } catch (x) { erro.textContent = x.message; e.target.value = ''; }
};
$('#fSite').onsubmit = (e) => {
  e.preventDefault();
  const f = e.target.elements, erro = e.target.querySelector('.erro');
  const nome = f.nome.value.trim(), url = urlValida(f.url.value);
  if (!nome) return void (erro.textContent = 'Informe o nome do site.');
  if (!url) return void (erro.textContent = 'Informe um endereço válido, começando com http:// ou https://.');
  const s = siteEdit || { id: id(), icone: '' };
  Object.assign(s, { nome, url });
  if (iconeNovo) { descartar(s.icone); s.icone = adicionarLocal(`assets/site-icons/${s.id}-${id()}.png`, iconeNovo); }
  if (!siteEdit) dados.sites.push(s);
  alterado();
  $('#dSite').close();
};
function removerSite(s) {
  if (!confirm(`Remover "${s.nome}"?`)) return;
  descartar(s.icone);
  dados.sites = dados.sites.filter((x) => x !== s);
  alterado();
}

/* ===== Aparência: título, descrição, fundo e camada escura ===== */
let fundoNovo = null;
function abrirAparencia() {
  const f = $('#fApar').elements;
  fundoNovo = null; f.fundo.value = ''; f.semfundo.checked = false;
  f.titulo.value = dados.titulo; f.descricao.value = dados.descricao; f.ov.value = dados.overlay;
  $('#fApar .erro').textContent = '';
  prevFundo();
  $('#dApar').showModal();
}
function prevFundo() { // prévia com a camada escura aplicada
  const f = $('#fApar').elements, a = f.ov.value / 100;
  $('#oOv').textContent = f.ov.value + '%';
  const url = f.semfundo.checked ? '' : fundoNovo ? fundoNovo.url : dados.fundo ? src(dados.fundo) : '';
  $('#pFundo').style.backgroundImage = url ? `linear-gradient(rgba(0,0,0,${a}),rgba(0,0,0,${a})),url("${url}")` : 'none';
}
$('#fApar').oninput = prevFundo;
$('#fApar').elements.fundo.onchange = async (e) => {
  const f = e.target.files[0], erro = $('#fApar .erro');
  erro.textContent = ''; fundoNovo = null;
  if (f) try {
    if (f.size > 15e6 || !/^image\/(png|jpeg|webp)$/.test(f.type)) throw new Error('Use PNG, JPG ou WebP de até 15 MB.');
    const blob = await redimensionar(f, 1920, 'image/jpeg', 0.82); // comprime para carregar rápido
    fundoNovo = { blob, url: URL.createObjectURL(blob) };
  } catch (x) { erro.textContent = x.message; e.target.value = ''; }
  prevFundo();
};
$('#fApar').onsubmit = (e) => {
  e.preventDefault();
  const f = e.target.elements;
  dados.titulo = f.titulo.value.trim() || 'Meus sites';
  dados.descricao = f.descricao.value.trim();
  dados.overlay = +f.ov.value;
  if (f.semfundo.checked || fundoNovo) { descartar(dados.fundo); dados.fundo = ''; }
  if (fundoNovo) { dados.fundo = adicionarLocal(`assets/fundo-${id()}.jpg`, fundoNovo.blob); URL.revokeObjectURL(fundoNovo.url); }
  alterado();
  $('#dApar').close();
};

/* ===== Cofre: descriptografa o token só na memória (AES-GCM + PBKDF2) ===== */
async function abrirCofre(senha) {
  const dec = (b) => Uint8Array.from(atob(b), (c) => c.charCodeAt(0));
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey']);
  const chave = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: dec(COFRE_EMBUTIDO.salt), iterations: 600000, hash: 'SHA-256' },
    material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: dec(COFRE_EMBUTIDO.iv) }, chave, dec(COFRE_EMBUTIDO.ciphertext));
  return new TextDecoder().decode(claro);
}
$('#fSenha').onsubmit = async (e) => {
  e.preventDefault();
  const erro = e.target.querySelector('.erro');
  erro.textContent = '';
  if (typeof COFRE_EMBUTIDO === 'undefined' || !COFRE_EMBUTIDO) return void (erro.textContent = 'Cofre não configurado (veja o README) ou use "Editar sem publicar".');
  try { token = await abrirCofre(e.target.elements.senha.value.trim()); entrarEdicao(); }
  catch { erro.textContent = 'Senha incorreta ou cofre inválido.'; }
};
$('#semToken').onclick = () => { token = null; entrarEdicao(); };
function entrarEdicao() { editando = true; $('#fSenha').reset(); $('#dSenha').close(); renderizar(); }
function sair() {
  if (sujo && !confirm('Há alterações não publicadas. Sair mesmo assim?')) return;
  sujo = false; location.reload(); // descarta rascunho e o token da memória
}

/* ===== Publicação via API do GitHub (Contents API) ===== */
function destino() {
  const p = location.pathname.split('/').filter(Boolean);
  const dir = location.pathname.endsWith('/') ? p : p.slice(0, -1);
  return { owner: CONFIG.owner || location.hostname.split('.')[0], repo: CONFIG.repo || dir[0] || location.hostname, pasta: CONFIG.pasta || dir.slice(1).join('/') };
}
async function gh(rota, opc = {}) {
  const r = await fetch('https://api.github.com' + rota, {
    method: opc.method, body: opc.body && JSON.stringify(opc.body),
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  if (r.status === 404 && opc.ok404) return null;
  if (!r.ok) throw new Error(`GitHub respondeu ${r.status}. Confira o token e as permissões do repositório.`);
  return r.json();
}
const b64 = (buf) => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
async function publicar() {
  const { owner, repo, pasta } = destino(), base = `/repos/${owner}/${repo}`;
  const caminho = (p) => encodeURI((pasta ? pasta + '/' : '') + p);
  try {
    aviso('Publicando…');
    const branch = CONFIG.branch || (await gh(base)).default_branch;
    const sha = async (p) => (await gh(`${base}/contents/${caminho(p)}?ref=${branch}`, { ok404: true }))?.sha;
    const enviar = async (p, conteudo) => gh(`${base}/contents/${caminho(p)}`, { method: 'PUT', body: { message: `Hub: atualiza ${p}`, content: conteudo, branch, sha: await sha(p) } });
    for (const p of pendentes) await enviar(p, b64(await locais.get(p).blob.arrayBuffer())); // 1º imagens
    await enviar('sites.json', b64(new TextEncoder().encode(JSON.stringify(dados, null, 2) + '\n'))); // 2º JSON
    for (const p of remover) { // 3º limpa arquivos não usados
      const s = await sha(p);
      if (s) await gh(`${base}/contents/${caminho(p)}`, { method: 'DELETE', body: { message: `Hub: remove ${p}`, sha: s, branch } });
    }
    publicados = new Set(usados()); pendentes.clear(); remover.clear(); sujo = false;
    aviso('Publicado! O GitHub Pages leva cerca de 1 minuto para refletir.');
  } catch (x) { aviso(x.message); }
}

/* ===== Exportar JSON (alternativa sem token): imagens novas vão embutidas ===== */
async function exportar() {
  const dataUrl = (b) => new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); });
  const copia = structuredClone(dados);
  for (const [o, k] of [[copia, 'fundo'], ...copia.sites.map((s) => [s, 'icone'])])
    if (pendentes.has(o[k])) o[k] = await dataUrl(locais.get(o[k]).blob);
  const a = el('a', { href: URL.createObjectURL(new Blob([JSON.stringify(copia, null, 2)], { type: 'application/json' })), download: 'sites.json' });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ===== Inicialização ===== */
document.addEventListener('click', (e) => e.target.closest('[data-fechar]')?.closest('dialog').close());
addEventListener('beforeunload', (e) => { if (sujo) e.preventDefault(); });
(async () => {
  try { const r = await fetch('sites.json', { cache: 'no-cache' }); if (r.ok) dados = limpar(await r.json()); } catch { /* usa padrão */ }
  publicados = new Set(usados());
  renderizar();
})();
