// ============================================================
// DEMO DATA — Remplacez par votre fichier data.js
// ============================================================


// ============================================================
// VERSIONING — Modifiez le chiffre AVANT le point pour reset total,
// le chiffre APRÈS pour reset des clés uniquement.
// ============================================================
const CURRENT_VERSION = "1.7";

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
  mjActive: false,
 pseudo: ''           // ← AJOUT
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
      // Nettoyer un activeTrade résiduel corrompu
      if(state.activeTrade && !state.activeTrade.giveKey) state.activeTrade = null;
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
function openSidebar(){ document.getElementById('sidebar').classList.add('open'); document.getElementById('overlay').classList.add('show'); renderInventory(); refreshTradeSelect(); }
function closeSidebar(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').classList.remove('show');
  // Réinitialiser accordéon sauf si troc actif
  if(!state.activeTrade){
    pactesOpen = false;
    document.getElementById('pactes-body').classList.remove('open');
    document.getElementById('pactes-chevron').style.transform = '';
    closePacteSection('grimoire');
    closePacteSection('pacte');
  }
}

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
  refreshTradeSelect(); // ← AJOUTER
}

function renderInventory(){
    // Badge joueur
  const badge = document.getElementById('player-badge');
  if(badge) badge.innerHTML = state.pseudo
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
      + '&nbsp;Aventurier :&nbsp;<strong>' + state.pseudo + '</strong>'
    : '';
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
document.querySelector('.inv-btn').addEventListener('click', function(e){
  // Ignorer les clics venant de l'intérieur de la sidebar
  if(document.getElementById('sidebar').contains(e.target)) return;
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
function closeMJPanel(){
  document.getElementById('mj-panel').classList.remove('show');
  state.mjActive=false;
  showToast('Mode MJ désactivé');
}
function mjRenamePseudo(){
  const np = prompt('Nouveau pseudo (2–15 caractères) :', state.pseudo||'');
  if(np === null) return;
  const trimmed = np.trim();
  if(trimmed.length < 2 || trimmed.length > 15){
    showToast('❌ Pseudo invalide (2–15 caractères)'); return;
  }
  state.pseudo = trimmed; saveState();
  renderInventory();
  showToast('✎ Pseudo mis à jour : ' + trimmed);
}

function mjAddItem(){
  if(!loots || !loots.length){ showToast('❌ data.js non chargé'); return; }
  const query = prompt('Nom de l\'objet à ajouter (recherche partielle) :');
  if(!query) return;
  const matches = loots.filter(l => l.split('|')[0].toLowerCase().includes(query.toLowerCase()));
  if(!matches.length){ showToast('❌ Aucun objet trouvé pour : ' + query); return; }
  const display = matches.slice(0, 8);
  let msg = display.map((l,i) => (i+1) + '. ' + l.split('|')[0]).join('\n');
  if(matches.length > 8) msg += '\n… (' + (matches.length-8) + ' autres, affinez la recherche)';
  const raw = prompt('Résultats :\n' + msg + '\n\nNuméro à ajouter (1-' + display.length + ') :');
  if(raw === null) return;
  const idx = parseInt(raw);
  if(isNaN(idx) || idx < 1 || idx > display.length){ showToast('❌ Choix invalide (1-' + display.length + ')'); return; }
  const lootStr = display[idx-1];
  const name = lootStr.split('|')[0];
  state.inventory[lootStr] = (state.inventory[lootStr]||0) + 1;
  if(!state.mjAdded) state.mjAdded = [];
  state.mjAdded.push({ name, ts: Date.now() });
  saveState(); renderInventory(); refreshTradeSelect();
  showToast('⚙ MJ : "' + name + '" ajouté');
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
// ÉTAPE C — EXPORT / IMPORT / INSPECTION
// ============================================================

const PROFILE_PREFIX = 'AV1-';

function exportProfileCode(){
  const payload = {
    pseudo:    state.pseudo,
    inventory: state.inventory,
    fragments: state.fragments,
    keys:      state.keys,
    version:   state.version
  };
  try {
    // btoa safe unicode
    const json   = JSON.stringify(payload);
    const b64    = btoa(unescape(encodeURIComponent(json)));
    const code   = PROFILE_PREFIX + b64;
    navigator.clipboard.writeText(code)
      .then(()=> showToast('✓ Code copié dans le presse-papier !'))
      .catch(()=>{ prompt('Copie ce code :', code); });
  } catch(e){ showToast('❌ Erreur lors de l\'export'); }
}

function toggleInspectInput(){
  const w = document.getElementById('inspect-input-wrap');
  w.style.display = w.style.display === 'none' ? 'block' : 'none';
}

function toggleLoadInput(){
  const w = document.getElementById('load-input-wrap');
  w.style.display = w.style.display === 'none' ? 'block' : 'none';
  // Fermer l'autre si ouvert
  document.getElementById('inspect-input-wrap').style.display = 'none';
}

function toggleInspectInput(){
  const w = document.getElementById('inspect-input-wrap');
  w.style.display = w.style.display === 'none' ? 'block' : 'none';
  // Fermer l'autre si ouvert
  document.getElementById('load-input-wrap').style.display = 'none';
}

function runLoad(){
  const raw = document.getElementById('load-code-input').value.trim();
  if(!raw.startsWith(PROFILE_PREFIX)){ showToast('❌ Code invalide (doit commencer par AV1-)'); return; }
  try {
    const json    = decodeURIComponent(escape(atob(raw.slice(PROFILE_PREFIX.length))));
    const payload = JSON.parse(json);
    if(!payload.pseudo || !payload.inventory) throw new Error();

    // SÉCURITÉ ANTI-ROLLBACK
    const incomingNonce = payload.lastTradeNonce || 0;
    const localNonce    = state.lastTradeNonce   || 0;
    if(incomingNonce < localNonce){
      showToast('🚫 FRAUDE DÉTECTÉE — Sauvegarde antérieure à un troc validé. Chargement refusé.');
      return;
    }

    // Écrasement total
    state.pseudo          = payload.pseudo;
    state.inventory       = payload.inventory;
    state.fragments       = payload.fragments || 0;
    state.keys            = Math.min(payload.keys || 0, MAX_KEYS);
    state.lastTradeNonce  = incomingNonce; // ← conserver le nonce du profil chargé
    state.processedNonces = payload.processedNonces || [];
    state.lastRegen       = Date.now();
    state.version         = CURRENT_VERSION;
    saveState(); renderInventory(); updateTimer();
    showToast('💾 Profil de ' + payload.pseudo + ' restauré !');
    document.getElementById('load-input-wrap').style.display = 'none';
    document.getElementById('load-code-input').value = '';

  } catch(e){ showToast('❌ Code corrompu ou illisible'); }
}

function runInspect(){
  const raw = document.getElementById('inspect-code-input').value.trim();
  if(!raw.startsWith(PROFILE_PREFIX)){ showToast('❌ Code invalide (doit commencer par AV1-)'); return; }
  try {
    const json    = decodeURIComponent(escape(atob(raw.slice(PROFILE_PREFIX.length))));
    const payload = JSON.parse(json);
    if(!payload.pseudo || !payload.inventory) throw new Error();
    openInspectPanel(payload);
  } catch(e){ showToast('❌ Code corrompu ou illisible'); }
}

function openInspectPanel(payload){
  // Masquer le contenu normal, afficher le panneau inspection
  ['completion-bar','search-wrap','sidebar-tabs','inv-list','inv-stats','share-section']
    .forEach(id =>{ const el=document.getElementById(id)||document.querySelector('.'+id);
      if(el) el.style.display='none'; });
  document.getElementById('player-badge').style.display = 'none';

  const panel = document.getElementById('inspect-panel');
  panel.style.display = 'flex';

  document.getElementById('inspect-title').textContent =
    '👁 ' + payload.pseudo;

  // Barre de complétion
  const total     = loots.length;
  const discovered = Object.keys(payload.inventory).filter(k=>payload.inventory[k]>0).length;
  const pct        = total > 0 ? Math.round(discovered/total*100) : 0;
  document.getElementById('inspect-completion-text').textContent =
    'Collection : ' + discovered + ' / ' + total + ' objets uniques';
  document.getElementById('inspect-completion-pct').textContent = pct + '%';
  document.getElementById('inspect-completion-fill').style.width = pct + '%';

  // Liste objets (lecture seule, triée par rareté)
  const order = {A:0,L:1,TR:2,R:3,PC:4,C:5};
  const entries = Object.entries(payload.inventory)
    .filter(([,c])=>c>0)
    .sort(([a],[b])=>(order[a.split('|')[3]]??9)-(order[b.split('|')[3]]??9));

  const list = document.getElementById('inspect-inv-list');
  list.innerHTML = entries.length ? entries.map(([k,cnt])=>{
    const [n,lnk,,rar] = k.split('|');
    return '<div class="inv-item" onclick="window.open(\'' + lnk.replace(/'/g,"\\'") + '\',\'_blank\')">'
      + '<div class="inv-dot" style="background:' + (RARITY_DOTS[rar]||'#666') + '"></div>'
      + '<span class="inv-name">' + n + '</span>'
      + (cnt>1 ? '<span class="inv-count rc-'+rar+'">×'+cnt+'</span>' : '')
      + '</div>';
  }).join('')
  : '<div class="inv-empty">Inventaire vide.</div>';

  // Stats
  const stats={A:0,L:0,TR:0,R:0,PC:0,C:0};
  entries.forEach(([k])=>{ const r=k.split('|')[3]; if(stats[r]!==undefined) stats[r]++; });
  document.getElementById('inspect-inv-stats').innerHTML =
    Object.entries(stats).map(([k,v])=>
      '<div class="stat-chip"><span class="stat-num rc-'+k+'">'+v+'</span><span class="stat-lbl">'+k+'</span></div>'
    ).join('');
}

function closeInspect(){
  document.getElementById('inspect-panel').style.display = 'none';
  // Restaurer les sections normales
  // Remplacer la ligne restoreIds par :
const restoreIds = ['completion-bar','search-wrap','sidebar-tabs','inv-list','inv-stats','share-section'];
  restoreIds.forEach(id =>{
    const el = document.getElementById(id) || document.querySelector('.'+id);
    if(el) el.style.display = '';
  });
  document.getElementById('player-badge').style.display = '';
  document.getElementById('inspect-code-input').value = '';
  document.getElementById('inspect-input-wrap').style.display = 'none';
  document.getElementById('load-code-input').value = '';
  document.getElementById('load-input-wrap').style.display = 'none';
  renderInventory();
}

// ============================================================
// INIT
// ============================================================
window.onload = function() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/mcc/arcane_vault/sw.js')
      .then(() => console.log('SW enregistré'))
      .catch(err => console.error('Erreur SW', err));
  }

  loadState();
  processRegen();
  initStars();

  // Étape B — gestion écran d'accueil
  const welcome = document.getElementById('welcome-screen');
  if(state.pseudo && state.pseudo.length >= 2){
    // Joueur connu : bypass écran d'accueil
    welcome.style.display = 'none';
    bootApp();
  } else {
    // Nouveau joueur : afficher l'écran d'accueil, masquer #app
    document.getElementById('app').style.visibility = 'hidden';
    document.getElementById('app').style.opacity = '0';
  }
};

function bootApp(){
  updateTimer();
  setInterval(updateTimer, 1000);
  document.getElementById('open-btn').disabled = state.keys <= 0;
  document.getElementById('card-area').style.display = 'none';
  document.getElementById('chest-wrap').style.display = 'flex';
}

function validatePseudoInput(){
  const val = document.getElementById('pseudo-input').value.trim();
  const hint = document.getElementById('pseudo-hint');
  const btn = document.getElementById('welcome-btn');
  if(val.length === 0){
    hint.textContent = ''; hint.className = 'welcome-hint';
    btn.disabled = true;
  } else if(val.length < 2){
    hint.textContent = 'Minimum 2 caractères.';
    hint.className = 'welcome-hint error'; btn.disabled = true;
  } else {
    hint.textContent = 'Prêt à entrer dans le Vault, ' + val + ' !';
    hint.className = 'welcome-hint ok'; btn.disabled = false;
  }
}

function submitPseudo(){
  const val = document.getElementById('pseudo-input').value.trim();
  if(val.length < 2 || val.length > 15) return;
  state.pseudo = val; saveState();

  const welcome = document.getElementById('welcome-screen');
  const appEl = document.getElementById('app');
  welcome.classList.add('hidden');
  appEl.style.visibility = 'visible';
  appEl.style.opacity = '0';
  appEl.style.transition = 'opacity .5s ease';
  requestAnimationFrame(()=> requestAnimationFrame(()=>{ appEl.style.opacity = '1'; }));

  bootApp();

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

// ============================================================
// ÉTAPE D — TROC SÉCURISÉ (flux 2 temps)
// ============================================================

const TRADE_PREFIX = 'AV-TRD-';
const CONFIRM_PREFIX = 'AV-TRD-CFM-';

function _genConfirmCode(nonce){
  // Code court déterministe B-XXXX basé sur le nonce
  const n = (nonce % 9000) + 1000;
  return 'B-' + n;
}

function refreshTradeSelect(){
  const sel = document.getElementById('trade-give-select');
  if(!sel) return;
  const prev = sel.value;
  sel.innerHTML = '<option value="">— Sélectionner —</option>';
  Object.entries(state.inventory)
    .filter(([,c]) => c >= 1)
    .sort(([a],[b]) => a.localeCompare(b))
    .forEach(([k]) => {
      const [n,,,r] = k.split('|');
      const opt = document.createElement('option');
      opt.value = k;
      opt.textContent = n + ' (' + (RARITY_LABELS[r]||r) + ')';
      sel.appendChild(opt);
    });
  if(prev) sel.value = prev;
}

// ── ÉTAPE 1 : DONNEUR forge le contrat ──────────────────────
function forgeTradeContract(){
  const giveKey  = document.getElementById('trade-give-select').value.trim();
  const wantName = document.getElementById('trade-want-input').value.trim();

  if(!giveKey){ showToast('❌ Sélectionne un objet à proposer'); return; }
  if(wantName.length < 2){ showToast('❌ Indique l\'objet désiré'); return; }
  if((state.inventory[giveKey]||0) < 1){
    showToast('❌ Tu ne possèdes plus cet objet'); return;
  }
  if(state.activeTrade){
    showToast('⚠ Un contrat est déjà en cours — annule-le avant d\'en créer un nouveau');
    lockPacteSection();
    return;
  }

  const nonce = Date.now();
  const confirmCode = _genConfirmCode(nonce);
  const [giveName,,,giveRar] = giveKey.split('|');

  // Séquestrer l'objet
  state.inventory[giveKey]--;
  if(state.inventory[giveKey] <= 0) delete state.inventory[giveKey];

  state.activeTrade = { nonce, giveKey, giveName, giveRar, wantName, from: state.pseudo, step: 'waiting_confirm' };
  state.lastTradeNonce = nonce;
  saveState(); renderInventory(); refreshTradeSelect();

  // Le confirmCode est embarqué dans le contrat (lisible par le receveur après traitement)
  const contract = { nonce, from: state.pseudo, giveKey, giveName, giveRar, wantName, confirmCode };
  const code = TRADE_PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify(contract))));
  document.getElementById('trade-contract-out').value = code;
  document.getElementById('trade-contract-wrap').style.display = 'block';

  // Afficher zone saisie code de confirmation
  _showConfirmInputZone();
  lockPacteSection();
  showToast('🔒 ' + giveName + ' séquestré — transmets le contrat à ton partenaire');
}

function _showConfirmInputZone(){
  // Injecter dynamiquement la zone de saisie du code B-XXXX si absente
  if(document.getElementById('confirm-code-wrap')) return;
  const wrap = document.createElement('div');
  wrap.id = 'confirm-code-wrap';
  wrap.style.cssText = 'margin-top:10px';
  wrap.innerHTML =
    '<div class="trade-label" style="color:#fbbf24">⏳ En attente de l\'objet B — Saisis le code de confirmation reçu</div>'
    + '<input id="confirm-code-input" class="search-input" type="text" placeholder="B-XXXX…" autocomplete="off" style="margin-top:6px">'
    + '<button class="share-btn share-btn-trade" style="margin-top:6px;width:100%" onclick="validateConfirmCode()">✅ Valider et recevoir l\'objet</button>';
  document.getElementById('trade-contract-wrap').after(wrap);
}

function copyTradeContract(){
  const code = document.getElementById('trade-contract-out').value;
  navigator.clipboard.writeText(code)
    .then(()=> showToast('📋 Contrat copié !'))
    .catch(()=> prompt('Copie ce contrat :', code));
}

// ── ÉTAPE 2 : RECEVEUR traite le contrat ────────────────────
function processTradeContract(){
  const raw = document.getElementById('trade-incoming-input').value.trim();
  if(!raw.startsWith(TRADE_PREFIX) || raw.startsWith(CONFIRM_PREFIX)){
    showToast('❌ Code invalide (doit commencer par AV-TRD-)'); return;
  }

  let contract;
  try {
    contract = JSON.parse(decodeURIComponent(escape(atob(raw.slice(TRADE_PREFIX.length)))));
  } catch(e){ showToast('❌ Contrat corrompu'); return; }

  const { nonce, from, giveKey, giveName, giveRar, wantName, confirmCode } = contract;

  if(from === state.pseudo){ showToast('❌ Tu ne peux pas traiter ton propre contrat'); return; }
  if(state.processedNonces && state.processedNonces.includes(nonce)){ showToast('🚫 Ce contrat a déjà été traité'); return; }

  // Chercher l'objet demandé (possédé en au moins 1)
  const wantKey = Object.keys(state.inventory).find(k =>
    k.split('|')[0].toLowerCase() === wantName.toLowerCase() && (state.inventory[k]||0) >= 1
  );
  if(!wantKey){
    showToast('❌ Tu ne possèdes pas "' + wantName + '"'); return;
  }

  const [wantDisplayName,,,wantRar] = wantKey.split('|');
  openTradeConfirmModal({ nonce, giveKey, giveName, giveRar, wantKey, wantDisplayName, wantRar, from, confirmCode });
}

// ── MODALE CONFIRMATION RECEVEUR ────────────────────────────
function openTradeConfirmModal(t){
  const box = document.querySelector('.modal-box');
  box.innerHTML =
    '<div class="modal-title" style="color:var(--c-tr)">⚔ Confirmer le Troc</div>'
    + '<div style="font-size:12px;color:var(--text-dim);line-height:1.8;margin-bottom:16px;">'
    + 'Partenaire : <strong style="color:var(--text)">' + t.from + '</strong><br>'
    + 'Tu <strong style="color:#f87171">donnes</strong> : <span class="rc-' + t.wantRar + '">' + t.wantDisplayName + '</span><br>'
    + 'Tu <strong style="color:#4ade80">reçois</strong> : <span class="rc-' + t.giveRar + '">' + t.giveName + '</span><br><br>'
    + '<span style="color:#f87171;font-size:11px;">⚠ Après confirmation, ton objet quitte définitivement ton inventaire.<br>'
    + 'Un code de confirmation sera affiché — transmets-le au donneur pour finaliser.</span>'
    + '</div>'
    + '<div class="modal-btns">'
    + '<button class="modal-btn" onclick="cancelTradeConfirm()">Annuler</button>'
    + '<button class="modal-btn confirm" onclick="executeTrade(' + JSON.stringify(t).replace(/"/g,'&quot;') + ')">Confirmer</button>'
    + '</div>';
  document.getElementById('modal').classList.add('show');
}

function cancelTradeConfirm(){
  const box = document.querySelector('.modal-box');
  box.innerHTML =
    '<div class="modal-title">⚿ CODE MAÎTRE</div>'
    + '<input class="modal-input" id="mj-input" type="password" maxlength="4" placeholder="····" oninput="checkMJCode()">'
    + '<div class="modal-btns"><button class="modal-btn" onclick="closeModal()">Annuler</button></div>';
  closeModal();
}

// ── ÉTAPE 2b : Exécution côté receveur ──────────────────────
function executeTrade(t){
  closeModal();

  // Receveur perd son objet B
  state.inventory[t.wantKey]--;
  if(state.inventory[t.wantKey] <= 0) delete state.inventory[t.wantKey];

  // Receveur reçoit objet A
  state.inventory[t.giveKey] = (state.inventory[t.giveKey]||0) + 1;

  if(!state.processedNonces) state.processedNonces = [];
  state.processedNonces.push(t.nonce);
  if(state.processedNonces.length > 20) state.processedNonces.shift();
  state.lastTradeNonce = Math.max(state.lastTradeNonce||0, t.nonce);

  saveState(); renderInventory(); refreshTradeSelect();
  document.getElementById('trade-incoming-input').value = '';

  // Afficher le code de confirmation en clair pour le transmettre au donneur
  _showReceiverConfirmCode(t.confirmCode, t.giveName, t.wantDisplayName);
}

function _showReceiverConfirmCode(code, received, given){
  const box = document.querySelector('.modal-box');
  box.innerHTML =
    '<div class="modal-title" style="color:#4ade80">✅ Troc Effectué !</div>'
    + '<div style="font-size:12px;color:var(--text-dim);line-height:1.8;margin-bottom:12px;">'
    + 'Tu as reçu : <strong class="rc-L">' + received + '</strong><br>'
    + 'Tu as donné : <strong>' + given + '</strong><br><br>'
    + '<span style="color:#fbbf24">Transmets ce code au donneur pour qu\'il reçoive son objet :</span>'
    + '</div>'
    + '<div style="font-family:monospace;font-size:22px;text-align:center;color:#fbbf24;letter-spacing:4px;padding:12px;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.3);border-radius:10px;margin-bottom:14px;">' + code + '</div>'
    + '<div class="modal-btns">'
    + '<button class="modal-btn" onclick="copyConfirmCode(\'' + code + '\')">📋 Copier le code</button>'
    + '<button class="modal-btn confirm" onclick="cancelTradeConfirm()">Fermer</button>'
    + '</div>';
  document.getElementById('modal').classList.add('show');
}

function copyConfirmCode(code){
  navigator.clipboard.writeText(code)
    .then(()=> showToast('📋 Code ' + code + ' copié !'))
    .catch(()=> prompt('Code de confirmation :', code));
}

// ── ÉTAPE 3 : DONNEUR valide avec le code B-XXXX ────────────
function validateConfirmCode(){
  if(!state.activeTrade){ showToast('❌ Aucun contrat actif'); return; }
  const input = document.getElementById('confirm-code-input');
  if(!input){ showToast('❌ Zone de saisie introuvable'); return; }
  const entered = input.value.trim().toUpperCase();
  const expected = _genConfirmCode(state.activeTrade.nonce).toUpperCase();

  if(entered !== expected){
    showToast('🚫 Code incorrect — le receveur n\'a pas encore validé ou code erroné');
    return;
  }

  // Donneur reçoit l'objet B demandé
  const wantKey = Object.keys(loots ? loots : []).length > 0
    ? loots.find(l => l.split('|')[0].toLowerCase() === state.activeTrade.wantName.toLowerCase())
    : null;

  // On cherche wantKey dans l'inventaire global (loots)
  const wantLootStr = loots && loots.find(l => l.split('|')[0].toLowerCase() === state.activeTrade.wantName.toLowerCase());

  const tradeCopy = Object.assign({}, state.activeTrade);
  state.activeTrade = null;

  if(wantLootStr){
    state.inventory[wantLootStr] = (state.inventory[wantLootStr]||0) + 1;
    showToast('🎉 Troc finalisé ! Tu as reçu : ' + wantLootStr.split('|')[0]);
  } else {
    showToast('⚠ Troc finalisé mais objet "' + tradeCopy.wantName + '" introuvable dans data.js — contacte le MJ');
  }

  saveState(); renderInventory(); refreshTradeSelect();

  // Nettoyer UI
  const confirmWrap = document.getElementById('confirm-code-wrap');
  if(confirmWrap) confirmWrap.remove();
  document.getElementById('trade-contract-wrap').style.display = 'none';
  document.getElementById('trade-contract-out').value = '';
  document.getElementById('trade-want-input').value = '';
  unlockPacteSection();
}

// ── ANNULER ──────────────────────────────────────────────────
function cancelActiveTrade(){
  if(!state.activeTrade) return;
  // Restituer l'objet séquestré AU DONNEUR
  state.inventory[state.activeTrade.giveKey] =
    (state.inventory[state.activeTrade.giveKey]||0) + 1;
  state.activeTrade = null;
  saveState(); renderInventory(); refreshTradeSelect();

  const confirmWrap = document.getElementById('confirm-code-wrap');
  if(confirmWrap) confirmWrap.remove();
  document.getElementById('trade-contract-wrap').style.display = 'none';
  document.getElementById('trade-contract-out').value = '';

  showToast('↩ Contrat annulé — objet restitué à ton inventaire');
  unlockPacteSection();
}

// ── ACCORDÉON ────────────────────────────────────────────────
let pactesOpen = false;

function togglePactesMenu(){
  if(pactesOpen && state.activeTrade){
    showToast('🔒 Un pacte est en cours — annule ou finalise le troc avant de fermer');
    return;
  }
  pactesOpen = !pactesOpen;
  document.getElementById('pactes-body').classList.toggle('open', pactesOpen);
  document.getElementById('pactes-chevron').style.transform = pactesOpen ? 'rotate(180deg)' : '';
  if(!pactesOpen){ closePacteSection('grimoire'); closePacteSection('pacte'); }
}

function togglePacteSection(id){
  const isOpen = document.getElementById('body-' + id).classList.contains('open');
  if(id === 'pacte' && isOpen && state.activeTrade){
    showToast('🔒 Annule ou finalise le troc avant de replier cette section'); return;
  }
  const other = id === 'grimoire' ? 'pacte' : 'grimoire';
  closePacteSection(other);
  if(isOpen) closePacteSection(id);
  else openPacteSection(id);
}

function openPacteSection(id){
  document.getElementById('body-' + id).classList.add('open');
  document.getElementById('chev-' + id).style.transform = 'rotate(180deg)';
}
function closePacteSection(id){
  document.getElementById('body-' + id).classList.remove('open');
  document.getElementById('chev-' + id).style.transform = '';
}
function lockPacteSection(){ 
  const btn = document.getElementById('toggle-pacte');
  if(btn) btn.classList.add('locked');
  if(!pactesOpen){
    pactesOpen=true;
    document.getElementById('pactes-body').classList.add('open');
    document.getElementById('pactes-chevron').style.transform='rotate(180deg)';
  }
  openPacteSection('pacte');
  closePacteSection('grimoire');
}
function unlockPacteSection(){
  const btn = document.getElementById('toggle-pacte');
  if(btn) btn.classList.remove('locked');
}
