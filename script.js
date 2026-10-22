// ============================================================
// DEMO DATA — Remplacez par votre fichier data.js
// ============================================================


// ============================================================
// VERSIONING — Modifiez le chiffre AVANT le point pour reset total,
// le chiffre APRÈS pour reset des clés uniquement.
// ============================================================
const CURRENT_VERSION = "1.4";

// DROP RATES — C:40 | PC:25 | R:20 | TR:8 | L:5 | A:2
const DROP_RATES = { C:40, PC:25, R:20, TR:8, L:5, A:2 };
// Ordre de fallback si pool vide (du plus rare vers le plus commun)
const RARITY_FALLBACK = ['A','L','TR','R','PC','C'];

const MAX_KEYS = 3;
const REGEN_MS = 4 * 60 * 60 * 1000;
const FRAGS_PER_KEY = 5;
const LSKEY = 'arcane-vault';

// ============================================================
// WEB AUDIO API
// ============================================================
let audioCtx = null;
function getAudioCtx(){ if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)(); return audioCtx; }

let shakeInterval = null;
function playClickSound(){
  // Tension croissante : clics de plus en plus rapides
  try{
    const ctx = getAudioCtx();
    let t = ctx.currentTime;
    let interval = 0.22;
    for(let i=0;i<8;i++){
      const o=ctx.createOscillator(), g=ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type='square'; o.frequency.value=120+i*15;
      g.gain.setValueAtTime(0,t); g.gain.linearRampToValueAtTime(0.08,t+0.01); g.gain.linearRampToValueAtTime(0,t+0.05);
      o.start(t); o.stop(t+0.06);
      t += interval;
      interval = Math.max(0.06, interval*0.78);
    }
  }catch(e){}
}

function playImpactSound(){
  try{
    const ctx = getAudioCtx();
    const t = ctx.currentTime;
    // Sub-bass thump
    const o=ctx.createOscillator(), g=ctx.createGain();
    const dist=ctx.createWaveShaper();
    const curve=new Float32Array(256);
    for(let i=0;i<256;i++){ const x=i*2/256-1; curve[i]=x*(Math.PI+400)/(Math.PI+400*Math.abs(x)); }
    dist.curve=curve;
    o.connect(dist); dist.connect(g); g.connect(ctx.destination);
    o.type='sine'; o.frequency.setValueAtTime(80,t); o.frequency.exponentialRampToValueAtTime(20,t+0.4);
    g.gain.setValueAtTime(0.9,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.4);
    o.start(t); o.stop(t+0.5);
    // Crack noise
    const buf=ctx.createBuffer(1,ctx.sampleRate*0.1,ctx.sampleRate);
    const d=buf.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1);
    const src=ctx.createBufferSource(), gn=ctx.createGain();
    src.buffer=buf; gn.gain.setValueAtTime(0.4,t); gn.gain.exponentialRampToValueAtTime(0.001,t+0.08);
    src.connect(gn); gn.connect(ctx.destination);
    src.start(t);
  }catch(e){}
}

function playRevealSound(rarity){
  try{
    const ctx = getAudioCtx();
    let t = ctx.currentTime + 0.05;
    const isHighTier = rarity==='L'||rarity==='A';
    // Arpège ascendant, plus complexe pour L/A
    const scales = {
      C:[261,330,392], PC:[261,330,392,523], R:[293,370,440,587],
      TR:[311,415,523,622,830], L:[329,415,523,659,830,1046,1319], A:[277,370,466,587,740,932,1175,1480]
    };
    const notes = scales[rarity]||scales['C'];
    notes.forEach((freq,i)=>{
      const o=ctx.createOscillator(), g=ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = isHighTier ? 'sine' : 'triangle';
      o.frequency.value=freq;
      const delay = i*0.08*(isHighTier?0.9:1);
      g.gain.setValueAtTime(0,t+delay);
      g.gain.linearRampToValueAtTime(isHighTier?0.18:0.12,t+delay+0.02);
      g.gain.exponentialRampToValueAtTime(0.001,t+delay+(isHighTier?0.8:0.5));
      o.start(t+delay); o.stop(t+delay+(isHighTier?0.9:0.6));
    });
    // Pour A: harmonie supplémentaire
    if(rarity==='A'){
      setTimeout(()=>{
        try{
          const ctx2=getAudioCtx(), t2=ctx2.currentTime+0.1;
          [277,554,1108].forEach((f,i)=>{
            const o=ctx2.createOscillator(),g=ctx2.createGain();
            o.connect(g);g.connect(ctx2.destination);
            o.type='sine';o.frequency.value=f;
            g.gain.setValueAtTime(0,t2+i*0.1);
            g.gain.linearRampToValueAtTime(0.1,t2+i*0.1+0.03);
            g.gain.exponentialRampToValueAtTime(0.001,t2+i*0.1+1.2);
            o.start(t2+i*0.1);o.stop(t2+i*0.1+1.3);
          });
        }catch(e){}
      },400);
    }
  }catch(e){}
}

// ============================================================
// STATE
// ============================================================
let state = {
  version: CURRENT_VERSION,
  keys: MAX_KEYS,
  lastRegen: Date.now(),
  inventory: {},
  fragments: 0,
  forceLegendary: false,
  mjActive: false
};

function saveState(){ localStorage.setItem(LSKEY, JSON.stringify(state)); }

function loadState(){
  const raw = localStorage.getItem(LSKEY);
  if(!raw){ saveState(); return; }
  try{
    const saved = JSON.parse(raw);
    const sv = saved.version||'0.0';
    const [smaj,smin] = sv.split('.').map(Number);
    const [cmaj,cmin] = CURRENT_VERSION.split('.').map(Number);
    if(smaj !== cmaj){
      // RESET TOTAL
      state.keys=MAX_KEYS; state.lastRegen=Date.now();
      state.inventory={}; state.fragments=0;
      state.version=CURRENT_VERSION; saveState();
      setTimeout(()=>showToast('🔄 Mise à jour majeure — inventaire réinitialisé'),500);
    } else {
      state = Object.assign(state, saved);
      state.version = CURRENT_VERSION;
      if(smin !== cmin){
        // Reset clés uniquement, conserve inventaire
        state.keys=MAX_KEYS; state.lastRegen=Date.now();
        saveState();
        setTimeout(()=>showToast('⚿ Mise à jour — clés rechargées, inventaire conservé'),500);
      }
    }
  }catch(e){ saveState(); }
}

// ============================================================
// REGEN
// ============================================================
function processRegen(){
  const now = Date.now();
  const elapsed = now - state.lastRegen;
  const charges = Math.floor(elapsed / REGEN_MS);
  if(charges > 0 && state.keys < MAX_KEYS){
    state.keys = Math.min(MAX_KEYS, state.keys + charges);
    state.lastRegen += charges * REGEN_MS;
    if(state.keys >= MAX_KEYS) state.lastRegen = now;
    saveState();
  }
}

function updateTimer(){
  processRegen();
  const keysEl = document.getElementById('keys-icons');
  const bar = document.getElementById('timer-bar');
  const txt = document.getElementById('timer-text');
  const fragEl = document.getElementById('frag-info');

  // Draw keys (can exceed MAX_KEYS via fragments)
  keysEl.innerHTML='';
  const displayMax = Math.max(MAX_KEYS, state.keys);
  for(let i=0;i<displayMax;i++){
    const d=document.createElement('div');
    d.className='key-icon '+(i<state.keys?'active':'inactive');
    d.innerHTML=`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/></svg>`;
    keysEl.appendChild(d);
  }

  // Timer
  if(state.keys >= MAX_KEYS){
    bar.style.width='100%';
    txt.textContent='Toutes les clés disponibles';
  } else {
    const elapsed = Date.now() - state.lastRegen;
    const remaining = REGEN_MS - elapsed;
    bar.style.width=Math.min(100,(elapsed/REGEN_MS)*100)+'%';
    const h=Math.floor(remaining/3600000);
    const m=Math.floor((remaining%3600000)/60000);
    const s=Math.floor((remaining%60000)/1000);
    txt.textContent=`Prochaine clé dans ${h}h ${m.toString().padStart(2,'0')}m ${s.toString().padStart(2,'0')}s`;
  }

  // Fragments
  fragEl.innerHTML = state.fragments>0
    ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="var(--c-r)" style="flex-shrink:0"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
       <span style="color:var(--c-r)">${state.fragments}/${FRAGS_PER_KEY} fragments</span>`
    : '';
}

// ============================================================
// STARS
// ============================================================
function initStars(){
  const c=document.getElementById('stars');
  for(let i=0;i<80;i++){
    const s=document.createElement('div');
    s.className='star';
    const sz=Math.random()*2+1;
    s.style.cssText=`width:${sz}px;height:${sz}px;top:${Math.random()*100}%;left:${Math.random()*100}%;--d:${2+Math.random()*4}s;--delay:${-Math.random()*4}s;opacity:${Math.random()*.5}`;
    c.appendChild(s);
  }
}

// ============================================================
// RARITY TABLES
// ============================================================
const RARITY_LABELS = { C:'Commun', PC:'Peu Commun', R:'Rare', TR:'Très Rare', L:'Légendaire', A:'Artefact' };
const RARITY_COLORS = { C:'var(--c-c)', PC:'var(--c-pc)', R:'var(--c-r)', TR:'var(--c-tr)', L:'var(--c-l)', A:'var(--c-a)' };
const RARITY_DOTS   = { C:'#94a3b8', PC:'#4ade80', R:'#22d3ee', TR:'#a855f7', L:'#f97316', A:'#e11d48' };

function rollRarity(){
  const r=Math.random()*100; let cumul=0;
  for(const [k,v] of Object.entries(DROP_RATES)){ cumul+=v; if(r<=cumul) return k; }
  return 'C';
}

function rollLoot(rarity){
  // Fallback cascade si pool vide pour cette rareté
  const idx = RARITY_FALLBACK.indexOf(rarity);
  const candidates = idx>=0 ? RARITY_FALLBACK.slice(idx) : [rarity,'C'];
  for(const r of candidates){
    const pool = loots.filter(l=>l.split('|')[3]===r);
    if(pool.length) return pool[Math.floor(Math.random()*pool.length)];
  }
  return loots[Math.floor(Math.random()*loots.length)];
}

// ============================================================
// TYPE ICONS
// ============================================================
function typeIcon(type){
  const t=(type||'').toLowerCase();
  const icons={
    arme:`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14.5 2.5l7 7-11 11-4-4 11-11zM2 22l4-4M8 8l2 2"/></svg>`,
    armure:`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2L4 6v6c0 5.5 3.8 10.7 8 12 4.2-1.3 8-6.5 8-12V6l-8-4z"/></svg>`,
    anneau:`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>`,
    sceptre:`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2v20M8 6l4-4 4 4"/><circle cx="12" cy="6" r="3"/></svg>`,
    potion:`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 3h6M10 3v4L6 12v7a2 2 0 002 2h8a2 2 0 002-2v-7l-4-5V3"/></svg>`,
    parchemin:`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2h12a2 2 0 012 2v16a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zM8 8h8M8 12h8M8 16h5"/></svg>`,
    default:`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`
  };
  for(const k of Object.keys(icons)){ if(t.includes(k)) return icons[k]; }
  return icons.default;
}

// ============================================================
// PARTICLES
// ============================================================
function createParticles(card, rarity){
  card.querySelectorAll('.particle').forEach(p=>p.remove());
  const palettes={
    L:['#f97316','#fbbf24','#fb923c','#fde68a'],
    A:['#e11d48','#fbbf24','#a855f7','#f43f5e','#fff']
  };
  const colors = palettes[rarity]||palettes['L'];
  const count = rarity==='A' ? 24 : 16;
  for(let i=0;i<count;i++){
    const p=document.createElement('div');
    p.className='particle';
    const sz=3+Math.random()*5;
    p.style.cssText=`width:${sz}px;height:${sz}px;background:${colors[Math.floor(Math.random()*colors.length)]};
      left:${Math.random()*100}%;bottom:${Math.random()*60}%;
      --d:${2+Math.random()*4}s;--delay:${-Math.random()*4}s;--x:${(Math.random()-.5)*50}px;opacity:.8`;
    card.appendChild(p);
  }
}

// ============================================================
// OPEN CHEST
// ============================================================
let isAnimating=false;
function openChest(){
  if(isAnimating||state.keys<=0) return;
  playClickSound();
  isAnimating=true;
  state.keys--;
  if(state.keys===MAX_KEYS-1) state.lastRegen=Date.now();
  saveState(); updateTimer();

  const btn=document.getElementById('open-btn');
  const chest=document.getElementById('chest-svg');
  const glow=document.getElementById('chest-glow');
  btn.disabled=true;
  chest.classList.add('shake');
  glow.style.animation='breathe 0.3s ease-in-out infinite';

  setTimeout(()=>{
    const flash=document.getElementById('flash');
    flash.style.opacity='1';
    if(navigator.vibrate) navigator.vibrate([80,30,120]);
    playImpactSound();

    setTimeout(()=>{
      flash.style.opacity='0';
      document.getElementById('chest-wrap').style.display='none';
      btn.style.display='none';

      const rarity = state.forceLegendary ? 'A' : rollRarity();
      if(state.forceLegendary){
        state.forceLegendary=false;
        document.getElementById('force-legendary').checked=false;
        saveState();
      }
      const lootStr=rollLoot(rarity);
      const [name,link,type,actualRarity] = lootStr.split('|');
      // Use actualRarity (handles fallback cascade correctly)
      const finalRarity = actualRarity || rarity;

      state.inventory[lootStr]=(state.inventory[lootStr]||0)+1;
      saveState();

      playRevealSound(finalRarity);
      buildCard(name,link,type,finalRarity);

      const ca=document.getElementById('card-area');
      ca.style.display='block';
      requestAnimationFrame(()=>requestAnimationFrame(()=>document.getElementById('card-flip').classList.add('flipped')));
      isAnimating=false;
    },130);
  },1500);
}

function buildCard(name,link,type,rarity){
  const card=document.getElementById('loot-card');
  card.className=`loot-card r-${rarity}`;
  const isHigh=rarity==='L'||rarity==='A';
  if(isHigh) createParticles(card,rarity);
  else card.querySelectorAll('.particle').forEach(p=>p.remove());

  const color=RARITY_COLORS[rarity];
  const icon=typeIcon(type);
  const nameClass=rarity==='A'?'artefact-glow':rarity==='L'?'legendary-glow':'';

  const linkHTML = (link && link !== '#')
    ? '<a class="card-link" href="' + link + '" target="_blank" rel="noopener">'
      + '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>'
      + 'Voir la fiche</a>'
    : '';
  document.getElementById('card-inner').innerHTML =
    '<div style="display:flex;align-items:center;gap:12px;">'
    + '<div class="card-type-icon" style="color:' + color + ';border-color:' + color + '33">' + icon + '</div>'
    + '<div>'
    + '<div class="card-rarity rc-' + rarity + '">' + (RARITY_LABELS[rarity]||rarity) + '</div>'
    + '<div class="card-type" style="margin-top:2px">'
    + '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" opacity=".5"><circle cx="12" cy="12" r="4"/></svg>' + type
    + '</div></div></div>'
    + '<div class="card-name ' + nameClass + '" style="color:' + color + '">' + name + '</div>'
    + linkHTML;
}

function resetToChest(){
  document.getElementById('card-area').style.display='none';
  document.getElementById('card-flip').classList.remove('flipped');
  document.getElementById('chest-wrap').style.display='flex';
  const btn=document.getElementById('open-btn');
  btn.style.display=''; btn.disabled=state.keys<=0;
  updateTimer();
}

// ============================================================
// INVENTORY SIDEBAR
// ============================================================
let activeTab='all';
function openSidebar(){ document.getElementById('sidebar').classList.add('open'); document.getElementById('overlay').classList.add('show'); renderInventory(); }
function closeSidebar(){ document.getElementById('sidebar').classList.remove('open'); document.getElementById('overlay').classList.remove('show'); }

function recycleByIndex(idx, e){ recycleItem(window._invKeys[idx], e); }
function recycleItem(lootKey, e){
  e.stopPropagation();
  if((state.inventory[lootKey]||0) < 2) return;
  state.inventory[lootKey]--;
  state.fragments++;
  // Convert fragments to keys (can exceed MAX_KEYS)
  if(state.fragments >= FRAGS_PER_KEY){
    state.fragments -= FRAGS_PER_KEY;
    state.keys++;
    saveState(); updateTimer();
    showToast('✨ Clé forgée depuis les fragments !');
    document.getElementById('open-btn').disabled=false;
  } else {
    saveState(); updateTimer();
    showToast(`♻ Fragment récupéré (${state.fragments}/${FRAGS_PER_KEY})`);
  }
  renderInventory();
}

function renderInventory(){
  const search=document.getElementById('search-input').value.toLowerCase();
  const entries=Object.entries(state.inventory).filter(([,c])=>c>0);

  // Completion bar
  const totalUnique=loots.length;
  const discovered=Object.keys(state.inventory).filter(k=>(state.inventory[k]||0)>0).length;
  const pct=totalUnique>0?Math.round(discovered/totalUnique*100):0;
  document.getElementById('completion-text').textContent=`Collection : ${discovered} / ${totalUnique} objets uniques`;
  document.getElementById('completion-pct').textContent=pct+'%';
  document.getElementById('completion-fill').style.width=pct+'%';

  // Tabs
  const tabs=document.getElementById('sidebar-tabs');
  const tabDefs=[['all','Tout'],['A','Artefact'],['L','Légendaire'],['TR','T. Rare'],['R','Rare'],['PC','P. Commun'],['C','Commun']];
  tabs.innerHTML=tabDefs.map(([k,l])=>`<button class="tab-btn ${activeTab===k?'active':''}" onclick="setTab('${k}')">${l}</button>`).join('');

  // Filter + sort
  const order={A:0,L:1,TR:2,R:3,PC:4,C:5};
  const filtered=entries
    .filter(([k])=>{ const [n,,,r]=k.split('|'); return (activeTab==='all'||r===activeTab)&&(!search||n.toLowerCase().includes(search)); })
    .sort(([a],[b])=>{ const ra=a.split('|')[3],rb=b.split('|')[3]; return (order[ra]??9)-(order[rb]??9); });

  const list=document.getElementById('inv-list');
  if(!filtered.length){
    list.innerHTML=`<div class="inv-empty">Aucun objet trouvé.<br><br>Ouvrez des coffres pour<br>remplir votre inventaire.</div>`;
  } else {
    // Store keys in a temp lookup so onclick can reference by index safely
    window._invKeys = filtered.map(([k])=>k);
    list.innerHTML=filtered.map(([k,cnt],idx)=>{
      const [n,lnk,,rar]=k.split('|');
      const extraHTML = cnt > 1
        ? '<span class="inv-count rc-' + rar + '">×' + cnt + '</span>'
          + '<button class="recycle-btn" onclick="recycleByIndex(' + idx + ',event)" title="Recycler un doublon">♻</button>'
        : '';
      return '<div class="inv-item" onclick="window.open(\'' + lnk.replace(/'/g,"\\'") + '\',\'_blank\')">'
        + '<div class="inv-dot" style="background:' + (RARITY_DOTS[rar]||'#666') + '"></div>'
        + '<span class="inv-name">' + n + '</span>'
        + extraHTML
        + '</div>';
    }).join('');
  }

  // Stats
  const stats={A:0,L:0,TR:0,R:0,PC:0,C:0};
  Object.keys(state.inventory).filter(k=>state.inventory[k]>0).forEach(k=>{ const r=k.split('|')[3]; if(stats[r]!==undefined) stats[r]++; });
  document.getElementById('inv-stats').innerHTML=Object.entries(stats).map(([k,v])=>`
    <div class="stat-chip"><span class="stat-num rc-${k}">${v}</span><span class="stat-lbl">${k}</span></div>`).join('');
}

function setTab(t){ activeTab=t; renderInventory(); }

// ============================================================
// MJ / SECRET
// ============================================================
function openMJModal(){
  document.getElementById('modal').classList.add('show');
  document.getElementById('mj-input').value='';
  document.getElementById('mj-input').focus();
}
let logoClicks=0, logoTimer=null;
document.getElementById('logo-click').addEventListener('click',()=>{
  logoClicks++;
  clearTimeout(logoTimer);
  logoTimer=setTimeout(()=>logoClicks=0,1500);
  if(logoClicks>=5){ logoClicks=0; openMJModal(); }
});
let invBtnClicks=0, invBtnTimer=null;
document.querySelector('.inv-btn').addEventListener('click',()=>{
  invBtnClicks++;
  clearTimeout(invBtnTimer);
  invBtnTimer=setTimeout(()=>invBtnClicks=0,1500);
  if(invBtnClicks>=5){ invBtnClicks=0; openMJModal(); return; }
  openSidebar();
},{capture:true});
document.getElementById('secret-zone').addEventListener('click',openMJModal);

function checkMJCode(){
  const v=document.getElementById('mj-input').value;
  if(v.length===4){
    if(v==='8416'){
      closeModal(); state.mjActive=true;
      document.getElementById('mj-panel').classList.add('show');
      document.getElementById('force-legendary').checked=state.forceLegendary;
      showToast('⚙ Mode Maître du Jeu activé');
    } else {
      document.getElementById('mj-input').value='';
      document.getElementById('mj-input').style.borderColor='rgba(239,68,68,.5)';
      setTimeout(()=>document.getElementById('mj-input').style.borderColor='',800);
    }
  }
}
function closeModal(){ document.getElementById('modal').classList.remove('show'); }
function mjResetKeys(){ state.keys=MAX_KEYS; state.lastRegen=Date.now(); saveState(); updateTimer(); document.getElementById('open-btn').disabled=false; showToast('⚿ Clés rechargées !'); }
function updateForceLegendary(){ state.forceLegendary=document.getElementById('force-legendary').checked; saveState(); showToast(state.forceLegendary?'☆ Prochain drop : ARTEFACT forcé':'Drop aléatoire rétabli'); }

// ============================================================
// TOAST
// ============================================================
let toastTimer=null;
function showToast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg; t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove('show'),2800);
}

document.addEventListener('keydown',e=>{ if(e.key==='Escape') closeModal(); });

// ============================================================
// INIT
// ============================================================
window.onload = function() {
  // Enregistrement du Service Worker pour le mode hors-ligne
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
      .then(() => console.log('SW enregistré avec succès'))
      .catch(err => console.error('Erreur d\'enregistrement SW', err));
  }
  
  // Logique d'initialisation existante
  loadState();
  processRegen();
  initStars();
  updateTimer();
  setInterval(updateTimer,1000);
  document.getElementById('open-btn').disabled=state.keys<=0;
  document.getElementById('card-area').style.display='none';
  document.getElementById('chest-wrap').style.display='flex';
};


// <!-- FOOTER TEXTES ET LOGIQUE JURIDIQUE -->
const LEGAL_TEXTS = {
    mentions: {
        title: "Mentions Légales",
        body: "<p>L'application <strong>Arcane Vault</strong> est un outil de simulation de tirages pour jeux de rôle sur table éditée à des fins ludiques par <strong>Moulecake Corporation Company</strong>.</p><p><strong>Hébergement :</strong> Ce site est propulsé de manière statique et gratuite via l'infrastructure globale de GitHub Pages (GitHub, Inc.).</p><p><strong>Propriété :</strong> Les contenus de règles et fiches d'objets magiques restent la propriété exclusive de leurs auteurs respectifs (Wizards of the Coast / AideDD).</p>"
    },
    confidentialite: {
        title: "Confidentialité & Cookies",
        body: "<p>Chez Moulecake Corp, on respecte vos données. Cette application n'utilise <strong>aucun cookie publicitaire ou traceur tiers</strong>.</p><p><strong>Utilisation du localStorage :</strong> L'application utilise exclusivement la mémoire locale de votre propre navigateur (localStorage) pour enregistrer de manière totalement autonome votre progression de jeu : votre inventaire de JDR, vos fragments de clé accumulés ainsi que le calcul du temps de recharge de vos lancers. <strong>Aucune donnée n'est collectée ou transmise à travers internet.</strong></p>"
    },
    accessibilite: {
        title: "Accessibilité",
        body: "<p>L'interface de l'Arcane Vault a été optimisée avec un design sombre à fort contraste pour limiter la fatigue oculaire lors des sessions nocturnes de jeu de rôle sur table.</p><p>Le système intègre l'API Web Vibration du navigateur pour donner un retour physique haptique sur les appareils mobiles compatibles lors de la cinématique d'impact du coffre.</p>"
    }
};

function openLegalModal(type) {
    const modal = document.getElementById('legal-modal');
    const title = document.getElementById('legal-modal-title');
    const body = document.getElementById('legal-modal-body');
    
    if (modal && title && body && LEGAL_TEXTS[type]) {
        title.innerHTML = LEGAL_TEXTS[type].title;
        body.innerHTML = LEGAL_TEXTS[type].body;
        modal.style.display = 'flex';
    }
}

function closeLegalModal() {
    const modal = document.getElementById('legal-modal');
    if (modal) modal.style.display = 'none';
}

// Fermer la modale si on clique à côté de la boîte de dialogue
window.addEventListener('click', function(e) {
    const modal = document.getElementById('legal-modal');
    if (e.target === modal) closeLegalModal();
});