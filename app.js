/* Matching Question Maker — app.js (updated for 2-4 columns, CSV export/import, multi-column matching) */
const qs = s => document.querySelector(s);
const qsa = s => [...document.querySelectorAll(s)];

// UI elements
const btnTheme = qs('#btn-theme');
const btnTeacher = qs('#btn-teacher');
const btnStudent = qs('#btn-student');
const btnLeaderboard = qs('#btn-leaderboard');
const teacherPanel = qs('#teacher');
const studentPanel = qs('#student');
const leaderboardPanel = qs('#leaderboard');

const columnCountEl = qs('#column-count');
const colsInputs = qs('#cols-inputs');
const addRowBtn = qs('#add-row');
const pairsList = qs('#pairs-list');
const setNameInput = qs('#set-name');
const saveSetBtn = qs('#save-set');
const exportBtn = qs('#export-set');
const importFile = qs('#import-file');
const savedSetsEl = qs('#saved-sets');

// Student
const chooseSet = qs('#choose-set');
const startQuizBtn = qs('#start-quiz');
const quizArea = qs('#quiz-area');
const columnsWrapper = qs('#columns-wrapper');
const checkBtn = qs('#check-answers');
const restartBtn = qs('#restart-quiz');
const resultEl = qs('#result');
// New controls
const multiplayerMode = qs('#multiplayer-mode');
const wsUrlInput = qs('#ws-url');
const btnBluetooth = qs('#btn-bluetooth');
const timerSecondsInput = qs('#timer-seconds');
const timerDisplay = qs('#timer-display');
const clickAudioEl = qs('#click-sound');
const bgImageInput = qs('#bg-image-file');
const bgMusicInput = qs('#bg-music-file');
const playerNameInput = qs('#player-name');
const endScreen = qs('#end-screen');
const endPlayerName = qs('#end-player-name');
const endScore = qs('#end-score');
const leaderboardListMain = qs('#leaderboard-list-main');
const leaderboardListEnd = qs('#leaderboard-list-end');
const closeEndScreenBtn = qs('#close-end-screen');
const clearLeaderboardBtn = qs('#clear-leaderboard');
const bgGifKeepAlive = qs('#bg-gif-keepalive');
const connStatus = qs('#conn-status');
const updateToast = qs('#update-toast');
const toastReload = qs('#toast-reload');
const toastDismiss = qs('#toast-dismiss');

const LEADERBOARD_KEY = 'mqm_leaderboard';
const THEME_KEY = 'mqm_theme';
const BG_IMAGE_META_KEY = 'mqm_bg_image_meta';
const BG_MUSIC_META_KEY = 'mqm_bg_music_meta';
const themes = [
  {id:'dark', label:'Dark'},
  {id:'light', label:'Light'},
  {id:'pink', label:'Pink'},
  {id:'blood', label:'Blood'},
  {id:'forest', label:'Forest'}
];

let currentTempPairs = []; // array of rows: each row is an array of column cells
let sets = {}; // saved sets by name (object: { name: {cols, rows}} )
let currentQuiz = null; // { cols, rows: [{id,cells}], matched: [] }
let selectedMap = {}; // temporary selections keyed by column index
// Multiplayer/comm
let bc = null; // BroadcastChannel
let ws = null; // WebSocket
let roomName = null;
// Timer
let quizTimer = null; // interval id
let quizTimeRemaining = 0;
let warningTriggered = false;
let warningLoop = null;
// Excitement assets
let bgImageDataUrl = null;
let bgMusicEl = null;
let gameEnded = false;
let bgImageIsGif = false;
let bgObjectUrl = null; // keep object URL for GIFs to ensure loop/playback
let bgMusicObjectUrl = null;
let bgImageNatural = {w:0,h:0};
let swNewWorker = null;
let swRefreshing = false;
let warningCtx = null;

function updateBackgroundTileSize(){
  if(!columnsWrapper || !bgImageDataUrl) return;
  const containerH = Math.max(columnsWrapper.clientHeight || 0, 200);
  const naturalH = bgImageNatural.h || containerH;
  const tileH = Math.min(naturalH, containerH);
  columnsWrapper.style.backgroundSize = `auto ${tileH}px`;
}

function switchMode(mode){
  const isTeacher = mode==='teacher';
  const isStudent = mode==='student';
  const isLeaderboard = mode==='leaderboard';

  if(teacherPanel) teacherPanel.classList.toggle('hidden', !isTeacher);
  if(studentPanel) studentPanel.classList.toggle('hidden', !isStudent);
  if(leaderboardPanel) leaderboardPanel.classList.toggle('hidden', !isLeaderboard);

  if(btnTeacher) btnTeacher.classList.toggle('active', isTeacher);
  if(btnStudent) btnStudent.classList.toggle('active', isStudent);
  if(btnLeaderboard) btnLeaderboard.classList.toggle('active', isLeaderboard);

  if(isStudent) refreshSetDropdown();
  if(isLeaderboard) renderLeaderboardFromStorage();
}

function applyTheme(id){
  const ids = themes.map(t=>t.id);
  const themeId = ids.includes(id) ? id : themes[0].id;
  document.body.classList.remove(...ids.map(t=>`theme-${t}`));
  document.body.classList.add(`theme-${themeId}`);
  localStorage.setItem(THEME_KEY, themeId);
  if(btnTheme){
    const label = themes.find(t=>t.id===themeId)?.label || themeId;
    btnTheme.textContent = `🎨 Theme · ${label}`;
  }
}

function cycleTheme(){
  const current = localStorage.getItem(THEME_KEY) || themes[0].id;
  const idx = themes.findIndex(t=>t.id===current);
  const next = themes[(idx+1+themes.length)%themes.length];
  applyTheme(next.id);
}

function applyButtonLabels(){
  const labels = {
    'btn-teacher':'🧑‍🏫 Teacher (Create)',
    'btn-student':'🎮 Student (Play)',
    'btn-leaderboard':'🏆 Leaderboard',
    'add-row':'➕ Add Row',
    'save-set':'💾 Save Set',
    'export-set':'⬇️ Export CSV',
    'start-quiz':'▶️ Start',
    'check-answers':'✅ Check Answers',
    'restart-quiz':'🔄 Restart',
    'btn-bluetooth':'🔗 Connect Bluetooth',
    'close-end-screen':'✖ Close',
    'clear-leaderboard':'🧹 Clear List'
  };
  Object.entries(labels).forEach(([id,text])=>{
    const el = qs(`#${id}`);
    if(el) el.textContent = text;
  });
}

function updateConnectionBadge(){
  const online = navigator.onLine;
  if(!connStatus) return;
  connStatus.textContent = online ? 'Online' : 'Offline';
  connStatus.classList.toggle('conn-offline', !online);
  connStatus.classList.toggle('conn-online', online);
}

function showUpdateToast(){
  if(updateToast) updateToast.classList.remove('hidden');
}
function hideUpdateToast(){
  if(updateToast) updateToast.classList.add('hidden');
}

btnTeacher.addEventListener('click', ()=>switchMode('teacher'));
btnStudent.addEventListener('click', ()=>switchMode('student'));
if(btnLeaderboard){ btnLeaderboard.addEventListener('click', ()=>switchMode('leaderboard')); }
if(btnTheme){ btnTheme.addEventListener('click', cycleTheme); }
if(clearLeaderboardBtn){
  clearLeaderboardBtn.addEventListener('click', ()=>{
    saveLeaderboard([]);
    renderLeaderboard([]);
  });
}
if(toastReload){
  toastReload.addEventListener('click', ()=>{
    hideUpdateToast();
    if(swNewWorker){ swNewWorker.postMessage('SKIP_WAITING'); }
    else { location.reload(); }
  });
}
if(toastDismiss){
  toastDismiss.addEventListener('click', hideUpdateToast);
}

if(columnCountEl) columnCountEl.addEventListener('change', renderColsInputs);
if(bgImageInput){
  bgImageInput.addEventListener('change', async e=>{
    const f = e.target.files && e.target.files[0];
    if(!f){
      bgImageDataUrl=null;
      bgImageIsGif=false;
      bgImageNatural = {w:0,h:0};
      if(bgObjectUrl){ URL.revokeObjectURL(bgObjectUrl); bgObjectUrl=null; }
      localStorage.removeItem(BG_IMAGE_META_KEY);
      deleteAssetFromDB('bgImage');
      clearBackground();
      return;
    }
    // detect GIF to keep animation alive; use object URL so browsers keep frames looping
    bgImageIsGif = (f.type==='image/gif') || /\.gif$/i.test(f.name||'');
    if(bgObjectUrl){ URL.revokeObjectURL(bgObjectUrl); bgObjectUrl=null; }
    if(bgImageIsGif){
      bgObjectUrl = URL.createObjectURL(f);
      bgImageDataUrl = bgObjectUrl;
    }else{
      bgImageDataUrl = await readFileAsDataUrl(f);
    }
    const probe = new Image();
    probe.onload = ()=>{
      bgImageNatural = {w:probe.naturalWidth, h:probe.naturalHeight};
      localStorage.setItem(BG_IMAGE_META_KEY, JSON.stringify({name:f.name,type:f.type,ts:Date.now(),w:bgImageNatural.w,h:bgImageNatural.h}));
      updateBackgroundTileSize();
    };
    probe.src = bgImageDataUrl;
    saveAssetToDB('bgImage', f).catch(()=>{});
    applyExcitement(); // update background immediately
  });
}
if(bgMusicInput){
  bgMusicInput.addEventListener('change', e=>{
    const f = e.target.files && e.target.files[0];
    if(!f){
      stopExcitement(true,false);
      if(bgMusicEl){ try{ bgMusicEl.pause(); }catch(_){ } }
      if(bgMusicObjectUrl){ URL.revokeObjectURL(bgMusicObjectUrl); bgMusicObjectUrl=null; }
      bgMusicEl=null;
      localStorage.removeItem(BG_MUSIC_META_KEY);
      deleteAssetFromDB('bgMusic');
      return;
    }
    if(bgMusicEl){ try{ bgMusicEl.pause(); }catch(_){ } }
    if(bgMusicObjectUrl){ URL.revokeObjectURL(bgMusicObjectUrl); bgMusicObjectUrl=null; }
    bgMusicObjectUrl = URL.createObjectURL(f);
    bgMusicEl = new Audio(bgMusicObjectUrl);
    bgMusicEl.loop = true;
    localStorage.setItem(BG_MUSIC_META_KEY, JSON.stringify({name:f.name,type:f.type,ts:Date.now()}));
    saveAssetToDB('bgMusic', f).catch(()=>{});
  });
}
if(closeEndScreenBtn){ closeEndScreenBtn.addEventListener('click', ()=>{ hideEndScreen(); }); }

function escapeHtml(s){return (s+'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}

// IndexedDB helpers for media caching
const ASSETS_DB = 'mqm_assets_db';
const ASSETS_STORE = 'files';
function openAssetsDB(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(ASSETS_DB, 1);
    req.onupgradeneeded = ()=>{ req.result.createObjectStore(ASSETS_STORE); };
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error);
  });
}
function saveAssetToDB(name, file){
  if(!name || !file) return Promise.resolve();
  return openAssetsDB().then(db=> new Promise((resolve,reject)=>{
    const tx = db.transaction(ASSETS_STORE,'readwrite');
    tx.objectStore(ASSETS_STORE).put(file, name);
    tx.oncomplete = ()=>resolve();
    tx.onerror = ()=>reject(tx.error);
  }));
}
function loadAssetFromDB(name){
  return openAssetsDB().then(db=> new Promise((resolve,reject)=>{
    const tx = db.transaction(ASSETS_STORE,'readonly');
    const req = tx.objectStore(ASSETS_STORE).get(name);
    req.onsuccess = ()=>resolve(req.result);
    req.onerror = ()=>reject(req.error);
  })).catch(()=>null);
}
function deleteAssetFromDB(name){
  return openAssetsDB().then(db=> new Promise((resolve,reject)=>{
    const tx = db.transaction(ASSETS_STORE,'readwrite');
    tx.objectStore(ASSETS_STORE).delete(name);
    tx.oncomplete = ()=>resolve();
    tx.onerror = ()=>reject(tx.error);
  })).catch(()=>{});
}

async function restoreBgImageFromCache(){
  try{
    const blob = await loadAssetFromDB('bgImage');
    if(blob){
      if(bgObjectUrl){ URL.revokeObjectURL(bgObjectUrl); bgObjectUrl=null; }
      bgObjectUrl = URL.createObjectURL(blob);
      bgImageDataUrl = bgObjectUrl;
      bgImageIsGif = (blob.type==='image/gif');
      const probe = new Image();
      probe.onload = ()=>{ bgImageNatural = {w:probe.naturalWidth, h:probe.naturalHeight}; updateBackgroundTileSize(); };
      probe.src = bgImageDataUrl;
      applyExcitement();
    }
  }catch(_){}
}

async function restoreBgMusicFromCache(){
  try{
    const blob = await loadAssetFromDB('bgMusic');
    if(blob){
      if(bgMusicEl){ try{ bgMusicEl.pause(); }catch(_){ } }
      if(bgMusicObjectUrl){ URL.revokeObjectURL(bgMusicObjectUrl); bgMusicObjectUrl=null; }
      bgMusicObjectUrl = URL.createObjectURL(blob);
      bgMusicEl = new Audio(bgMusicObjectUrl);
      bgMusicEl.loop = true;
    }
  }catch(_){}
}

function renderColsInputs(){
  const cols = Number(columnCountEl.value||2);
  colsInputs.innerHTML = '';
  for(let i=0;i<cols;i++){
    const inp = document.createElement('input'); inp.placeholder = `Column ${i+1} item`; inp.dataset.col = i; colsInputs.appendChild(inp);
  }
}

function renderPairs(){
  pairsList.innerHTML='';
  currentTempPairs.forEach((row,i)=>{
    const li = document.createElement('li');
    li.innerHTML = `<span>${row.map(v=>escapeHtml(v||'')).join(' ⇄ ')}</span><div><button data-i="${i}" class="remove">🗑 Remove</button></div>`;
    pairsList.appendChild(li);
  });
}

addRowBtn.addEventListener('click', ()=>{
  const inputs = [...colsInputs.querySelectorAll('input')];
  const values = inputs.map(i=>i.value.trim());
  if(values.every(v=>v==='')) return alert('Enter at least one value');
  if(values.some(v=>v==='')){ if(!confirm('Some columns are empty. Save row anyway?')) return; }
  currentTempPairs.push(values);
  inputs.forEach(i=>i.value='');
  renderPairs();
  playClick();
});

pairsList.addEventListener('click', e=>{
  if(e.target.matches('button.remove')){
    const i = Number(e.target.dataset.i);
    currentTempPairs.splice(i,1);
    renderPairs();
    playClick();
  }
});

function loadSets(){
  try{sets = JSON.parse(localStorage.getItem('mqm_sets')||'{}');}catch(e){sets={}};
}

function saveSets(){ localStorage.setItem('mqm_sets', JSON.stringify(sets)); }

saveSetBtn.addEventListener('click', ()=>{
  const name = (setNameInput.value || `Set ${Date.now()}`).trim();
  if(!name) return alert('Provide a set name');
  if(currentTempPairs.length===0) return alert('Add some rows first');
  const cols = Number(columnCountEl.value||2);
  sets[name]= { cols, rows: currentTempPairs.slice() };
  saveSets(); renderSavedSets(); setNameInput.value=''; currentTempPairs=[]; renderPairs(); refreshSetDropdown();
  playClick();
});

function renderSavedSets(){
  savedSetsEl.innerHTML='';
  Object.keys(sets).forEach(name=>{
    const s = sets[name]; const rows = s.rows? s.rows.length : 0; const cols = s.cols || 2;
    const li = document.createElement('li');
    li.innerHTML = `<span>${escapeHtml(name)} — ${cols} cols · ${rows} rows</span>
      <div><button data-name="${escapeHtml(name)}" class="load">📂 Load</button>
      <button data-name="${escapeHtml(name)}" class="delete">🗑 Delete</button></div>`;
    savedSetsEl.appendChild(li);
  });
}

savedSetsEl.addEventListener('click', e=>{
  const name = e.target.dataset.name;
  if(e.target.matches('button.load')){
    const s = sets[name]; if(!s) return; currentTempPairs = (s.rows||[]).slice(); columnCountEl.value = s.cols || 2; renderColsInputs(); renderPairs(); setNameInput.value = name;
  }
  if(e.target.matches('button.delete')){
    if(confirm('Delete set "'+name+'"?')){ delete sets[name]; saveSets(); renderSavedSets(); refreshSetDropdown(); }
  }
});

// Export CSV
exportBtn.addEventListener('click', ()=>{
  const name = setNameInput.value.trim();
  if(!name || !sets[name]) return alert('Save a set first and give it the name in the Set name input');
  const s = sets[name]; const cols = s.cols || 2; const header = Array.from({length:cols}, (_,i)=>`col${i+1}`).join(',');
  const rows = (s.rows||[]).map(r=> r.map(cell=>`"${(cell||'').replace(/"/g,'""')}"`).join(','));
  const csv = header + '\n' + rows.join('\n');
  const dataStr = 'data:text/csv;charset=utf-8,'+encodeURIComponent(csv);
  const a = document.createElement('a'); a.href=dataStr; a.download=`mqm-${name}.csv`; a.click();
  playClick();
});

importFile.addEventListener('change', async e=>{
  const f = e.target.files[0]; if(!f) return;
  try{
    const txt = await f.text();
    // try JSON first
    try{
      const obj = JSON.parse(txt);
      if(obj.name && Array.isArray(obj.pairs)){
        sets[obj.name]=obj.pairs; saveSets(); renderSavedSets(); refreshSetDropdown(); alert('Imported JSON'); return;
      }
    }catch(_){}
    // try CSV
    const lines = txt.split(/\r?\n/).filter(Boolean);
    if(lines.length>0){
      const header = lines[0].split(',').map(h=>h.trim());
      const cols = header.length;
      const rows = lines.slice(1).map(line=>{
        const cells = []; let cur=''; let inQuotes=false;
        for(let i=0;i<line.length;i++){
          const ch=line[i];
          if(ch==='"'){ if(inQuotes && line[i+1]==='"'){ cur+='"'; i++; } else { inQuotes=!inQuotes; } continue; }
          if(ch===',' && !inQuotes){ cells.push(cur); cur=''; continue; }
          cur+=ch;
        }
        cells.push(cur);
        return cells.map(c=>c.trim());
      });
      const fname = f.name.replace(/\.csv$/i,'') || `Imported ${Date.now()}`;
      sets[fname] = { cols, rows };
      saveSets(); renderSavedSets(); refreshSetDropdown(); alert('Imported CSV'); return;
    }
    alert('Invalid import format');
  }catch(err){alert('Failed to import: '+err.message)}
  playClick();
});

function refreshSetDropdown(){ loadSets(); chooseSet.innerHTML = ''; Object.keys(sets).forEach(name=>{ const s = sets[name]; const rows = s.rows? s.rows.length : 0; const cols = s.cols || 2; const op = document.createElement('option'); op.value=name; op.textContent = `${name} — ${cols} cols · ${rows} rows`; chooseSet.appendChild(op); }); }

startQuizBtn.addEventListener('click', ()=>{
  const name = chooseSet.value; if(!name) return alert('Choose a set');
  const s = sets[name]; if(!s) return alert('Set not found');
  const cols = s.cols || 2; const rows = (s.rows||[]).map((r,i)=>({id:i,cells:r.slice(),match:null}));
  currentQuiz = { cols, rows, matched: [] };
  // setup room name for multiplayer (use set name)
  roomName = name;
  setupMultiplayer();
  runQuiz();
  playClick();
});

function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}

function runQuiz(){
  if(!currentQuiz) return;
  hideEndScreen();
  quizArea.classList.remove('hidden'); resultEl.textContent='';
  gameEnded = false;
  // timer setup
  clearInterval(quizTimer); stopWarningLoop(); quizTimeRemaining = 0; if(timerDisplay){ timerDisplay.textContent = ''; timerDisplay.classList.remove('timer-flow'); } warningTriggered = false;
  const secs = Number(timerSecondsInput && timerSecondsInput.value) || 0;
  if(secs>0){ quizTimeRemaining = secs; timerDisplay.textContent = `Time: ${quizTimeRemaining}s`; quizTimer = setInterval(()=>{
    quizTimeRemaining--;
    if(quizTimeRemaining<=10){ triggerWarningPhase(); }
    if(quizTimeRemaining<=0){ clearInterval(quizTimer); timerDisplay.textContent='Time: 0s'; endGame('time'); } else { timerDisplay.textContent = `Time: ${quizTimeRemaining}s`; }
  },1000); }
  const cols = currentQuiz.cols; const rows = currentQuiz.rows;
  columnsWrapper.innerHTML = '';
  const colItems = Array.from({length:cols}, (_,c)=> rows.map(r=>({id:r.id, text:r.cells[c]||'', col:c})) );
  colItems.forEach(ci=>shuffle(ci));
  colItems.forEach((items,c)=>{
    const col = document.createElement('div'); col.className='column';
    const title = document.createElement('div'); title.className='col-title'; title.textContent = `Column ${c+1}`; col.appendChild(title);
    items.forEach(it=>{
      const btn = document.createElement('button'); btn.textContent = it.text; btn.dataset.id = it.id; btn.dataset.col = it.col; btn.addEventListener('click', onItemClick);
      col.appendChild(btn);
    });
    columnsWrapper.appendChild(col);
  });
  currentQuiz.matched = []; selectedMap = {};
  // announce start in multiplayer
  sendMsg({type:'start', room: roomName});
  // apply visual/audio excitement if provided
  applyExcitement();
  updateBackgroundTileSize();
}

function onItemClick(e){
  const btn = e.currentTarget; const id = Number(btn.dataset.id); const col = Number(btn.dataset.col);
  qsa(`#columns-wrapper .column:nth-child(${col+1}) button`).forEach(b=>b.classList.remove('selected'));
  btn.classList.add('selected'); selectedMap[col]=id;
  playClick();
  const cols = currentQuiz.cols; if(Object.keys(selectedMap).length===cols){
    for(const [c, sid] of Object.entries(selectedMap)){
      const b = qs(`#columns-wrapper .column:nth-child(${Number(c)+1}) button[data-id='${sid}']`);
    if(b){ b.disabled=true; b.classList.add('paired'); b.classList.remove('selected'); }
    }
    currentQuiz.matched.push(Object.values(selectedMap).map(v=>Number(v)));
    // broadcast matched group
    sendMsg({type:'matched', room: roomName, group: currentQuiz.matched[currentQuiz.matched.length-1]});
    selectedMap = {};
    if(currentQuiz.matched.length >= currentQuiz.rows.length){ endGame('completed'); }
  }
}

function checkAnswersAndShow(){
  endGame('check');
}

checkBtn.addEventListener('click', ()=>{ checkAnswersAndShow(); playClick(); });

restartBtn.addEventListener('click', ()=>{ runQuiz(); });

// Install + SW registration with update prompt
if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('sw.js').then(reg=>{
      if(reg.waiting){
        swNewWorker = reg.waiting;
        showUpdateToast();
      }
      reg.addEventListener('updatefound', ()=>{
        const newWorker = reg.installing;
        if(newWorker){
          newWorker.addEventListener('statechange', ()=>{
            if(newWorker.state === 'installed' && navigator.serviceWorker.controller){
              swNewWorker = reg.waiting || newWorker;
              showUpdateToast();
            }
          });
        }
      });
    }).catch(()=>{});
  });

  navigator.serviceWorker.addEventListener('controllerchange', ()=>{
    if(swRefreshing) return;
    swRefreshing = true;
    window.location.reload();
  });
}

// Play click sound (tries sound.mp3, falls back to WebAudio beep)
let __lastClickAt = 0;
function playClick() {
  try {
    const now = Date.now();
    if (now - __lastClickAt < 60) return;
    __lastClickAt = now;

    if (clickAudioEl) {
      clickAudioEl.currentTime = 0;
      const p = clickAudioEl.play();
      if (p && p.catch) p.catch(() => produceBeep());
      return;
    }
  } catch (e) {}

  produceBeep();

  // Play the sound
  const audio = new Audio('sound.mp3');
  audio.play();
}
function produceBeep(){
  try{
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type='sine'; o.frequency.value = 880; g.gain.value=0.02;
    o.connect(g); g.connect(ctx.destination);
    o.start(); setTimeout(()=>{ o.stop(); ctx.close(); },80);
  }catch(e){}
}

// Multiplayer: setup and messaging
function setupMultiplayer(){
  // close existing
  if(bc){ try{ bc.close(); }catch(e){} bc=null; }
  if(ws){ try{ ws.close(); }catch(e){} ws=null; }
  const mode = (multiplayerMode && multiplayerMode.value) || 'single';
  // show/hide WS url and bluetooth button
  if(wsUrlInput) wsUrlInput.style.display = (mode==='websocket')? 'inline-block' : 'none';
  if(btnBluetooth) btnBluetooth.style.display = (mode==='bluetooth')? 'inline-block' : 'none';

  if(mode==='broadcast'){
    try{
      bc = new BroadcastChannel('mqm_channel_'+roomName);
      bc.onmessage = ev=>{ handleRemoteMessage(ev.data); };
    }catch(e){ console.warn('BroadcastChannel unavailable', e); }
  } else if(mode==='websocket'){
    const url = (wsUrlInput && wsUrlInput.value) || '';
    if(!url) { console.warn('WebSocket URL not set'); return; }
    try{
      ws = new WebSocket(url);
      ws.addEventListener('open', ()=>{ console.log('WS open'); });
      ws.addEventListener('message', ev=>{ try{ const data = JSON.parse(ev.data); handleRemoteMessage(data);}catch(e){} });
      ws.addEventListener('close', ()=>{ console.log('WS closed'); });
    }catch(e){ console.warn('WS failed', e); }
  } else if(mode==='bluetooth'){
    // Bluetooth requires an external peripheral; provide a basic connect attempt UI
    if(btnBluetooth){ btnBluetooth.onclick = async ()=>{
      try{
        const device = await navigator.bluetooth.requestDevice({acceptAllDevices:true});
        alert('Bluetooth device selected: '+device.name+"\nNote: full browser-to-browser bluetooth relay needs a custom peripheral.");
      }catch(err){ alert('Bluetooth connect failed: '+err.message); }
    }; }
  }
}

function sendMsg(obj){
  try{
    if(!obj) return;
    if(bc){ try{ bc.postMessage(obj); }catch(e){} }
    if(ws && ws.readyState===WebSocket.OPEN){ try{ ws.send(JSON.stringify(obj)); }catch(e){} }
  }catch(e){}
}

function handleRemoteMessage(msg){
  if(!msg || msg.room!==roomName) return;
  if(msg.type==='start'){
    console.log('Remote start received');
  }
  if(msg.type==='matched' && Array.isArray(msg.group)){
    // apply matched group visually
    try{
      msg.group.forEach((id, idx)=>{
        const colIndex = idx; const selector = `#columns-wrapper .column:nth-child(${colIndex+1}) button[data-id='${id}']`;
        const b = qs(selector);
        if(b){ b.disabled=true; b.classList.add('paired'); b.classList.remove('selected'); }
      });
      // add to currentQuiz.matched if exists and not duplicate
      if(currentQuiz){ const exists = (currentQuiz.matched||[]).some(g=> JSON.stringify(g)===JSON.stringify(msg.group)); if(!exists) currentQuiz.matched.push(msg.group.slice()); }
    }catch(e){}
  }
  if(msg.type==='finish'){
    if(msg.percent!==undefined){ resultEl.textContent = `${msg.percent}% — ${msg.medal} (remote)`; }
  }
}

// UI: show/hide ws input when mode changes
if(multiplayerMode){ multiplayerMode.addEventListener('change', ()=>{ if(wsUrlInput) wsUrlInput.style.display = (multiplayerMode.value==='websocket')? 'inline-block':'none'; if(btnBluetooth) btnBluetooth.style.display = (multiplayerMode.value==='bluetooth')? 'inline-block':'none'; }); }

// Delegate clicks to play sound for interactive elements (buttons, anchors, inputs)
document.addEventListener('click', (e)=>{
  try{
    const t = e.target;
    if(!t) return;
    if(t.closest && t.closest('button, a, [role="button"], input[type="button"], input[type="submit"], input[type="checkbox"], input[type="radio"]')){
      // avoid playing when clicking the audio element itself
      if(t.tagName && t.tagName.toLowerCase()==='audio') return;
      playClick();
    }
  }catch(e){}
}, true);

// initial load
applyTheme(localStorage.getItem(THEME_KEY) || themes[0].id);
applyButtonLabels();
loadSets(); renderSavedSets(); renderColsInputs(); renderLeaderboardFromStorage(); switchMode('teacher'); hideEndScreen();
updateConnectionBadge();
window.addEventListener('online', updateConnectionBadge);
window.addEventListener('offline', updateConnectionBadge);
window.addEventListener('resize', updateBackgroundTileSize);
restoreBgImageFromCache();
restoreBgMusicFromCache();

async function readFileAsDataUrl(file){
  return new Promise((resolve, reject)=>{ try{ const reader = new FileReader(); reader.onload = ()=>resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }catch(err){ reject(err); } });
}

function applyExcitement(){
  if(bgImageDataUrl && columnsWrapper){
    columnsWrapper.style.backgroundImage = `url(${bgImageDataUrl})`;
    columnsWrapper.style.backgroundRepeat = 'repeat';
    columnsWrapper.style.backgroundPosition = 'center center';
    columnsWrapper.classList.add('bg-active');
    updateBackgroundTileSize();
    // keep a hidden <img> alive for GIFs so animation keeps looping
    if(bgGifKeepAlive){
      if(bgImageIsGif){
        bgGifKeepAlive.src = bgImageDataUrl;
        bgGifKeepAlive.style.display = 'block';
        bgGifKeepAlive.style.opacity = '0.001';
      }else{
        bgGifKeepAlive.removeAttribute('src');
        bgGifKeepAlive.style.display = 'none';
      }
    }
  } else {
    clearBackground();
  }
  if(bgMusicEl){ try{ bgMusicEl.currentTime = 0; bgMusicEl.play(); }catch(_){ } }
}

function stopExcitement(stopMusic=true, removeBg=true){
  if(stopMusic && bgMusicEl){ try{ bgMusicEl.pause(); bgMusicEl.currentTime = 0; }catch(_){ } }
  if(removeBg){ clearBackground(); }
}

function clearBackground(){
  if(columnsWrapper){
    columnsWrapper.style.backgroundImage='';
    columnsWrapper.style.backgroundRepeat='';
    columnsWrapper.style.backgroundSize='';
    columnsWrapper.style.backgroundPosition='';
    columnsWrapper.classList.remove('bg-active');
  }
  bgImageNatural = {w:0,h:0};
  if(bgGifKeepAlive){
    bgGifKeepAlive.removeAttribute('src');
    bgGifKeepAlive.style.display = 'none';
  }
}

function triggerWarningPhase(){
  if(warningTriggered) return;
  warningTriggered = true;
  stopExcitement(true,false);
  if(timerDisplay){ timerDisplay.classList.add('timer-flow'); }
  startWarningLoop();
}

function startWarningLoop(){
  stopWarningLoop();
  warningLoop = setInterval(()=>{ playWarningSound(); }, 1000);
}
function stopWarningLoop(){
  if(warningLoop){ clearInterval(warningLoop); warningLoop=null; }
  if(timerDisplay){ timerDisplay.classList.remove('timer-flow'); }
}

function playWarningSound(){
  try{
    if(!warningCtx){
      warningCtx = new (window.AudioContext||window.webkitAudioContext)();
    }
    const ctx = warningCtx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type='square';
    o.frequency.value = 920;
    g.gain.value = 0.18; // louder warning
    o.connect(g); g.connect(ctx.destination);
    const now = ctx.currentTime;
    o.start(now);
    o.stop(now + 0.24);
    setTimeout(()=>{ try{ g.disconnect(); o.disconnect(); }catch(_){ } }, 300);
  }catch(e){}
}

function calculateScore(){
  if(!currentQuiz) return {percent:0, medal:'Bronze', correct:0, total:0};
  const total = currentQuiz.rows.length;
  const matched = currentQuiz.matched || [];
  let correct = 0;
  matched.forEach(group=>{ if(group.every(v=>v===group[0])) correct++; });
  const percent = Math.round((correct/Math.max(1,total))*100);
  let medal = 'Bronze'; if(percent>=50 && percent<70) medal='Silver'; else if(percent>=70 && percent<85) medal='Gold'; else if(percent>=85) medal='Platinum';
  return {percent, medal, correct, total};
}

function endGame(reason){
  if(gameEnded) return;
  gameEnded = true;
  clearInterval(quizTimer); quizTimer=null;
  stopWarningLoop();
  stopExcitement(true,true);
  const {percent, medal, correct, total} = calculateScore();
  resultEl.textContent = `${percent}% — ${medal} (${correct} / ${total} groups)`;
  sendMsg({type:'finish', room: roomName, percent, medal, reason});
  showEndScreen(percent, medal, correct, total);
}

function showEndScreen(percent, medal, correct, total){
  if(!endScreen) return;
  const name = (playerNameInput && playerNameInput.value.trim()) || 'Player';
  if(endPlayerName) endPlayerName.textContent = name;
  if(endScore) endScore.textContent = `${percent}% • ${medal} • ${correct}/${total} correct`;
  updateLeaderboard(name, percent, medal);
  if(endScreen.classList) endScreen.classList.remove('hidden');
}

function hideEndScreen(){ if(endScreen && endScreen.classList) endScreen.classList.add('hidden'); }

function medalIcon(m){
  if(m==='Platinum') return '🌟';
  if(m==='Gold') return '🥇';
  if(m==='Silver') return '🥈';
  if(m==='Bronze') return '🥉';
  return '🏅';
}

function getLeaderboard(){
  try{ return JSON.parse(localStorage.getItem(LEADERBOARD_KEY) || '[]'); }
  catch(_){ return []; }
}

function saveLeaderboard(list){
  try{ localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(list)); }catch(_){}
}

function renderLeaderboard(list){
  const targets = [leaderboardListMain, leaderboardListEnd].filter(Boolean);
  targets.forEach(target=>{
    target.innerHTML = '';
    if(!list || list.length===0){
      const li = document.createElement('li');
      li.textContent = 'No scores yet';
      target.appendChild(li);
      return;
    }
    list.forEach(item=>{
      const li = document.createElement('li');
      li.textContent = `${medalIcon(item.medal)} ${item.name} — ${item.percent}% (${item.medal})`;
      target.appendChild(li);
    });
  });
}

function renderLeaderboardFromStorage(){ renderLeaderboard(getLeaderboard()); }

function updateLeaderboard(name, percent, medal){
  try{
    const list = getLeaderboard();
    list.push({name, percent, medal, ts: Date.now()});
    list.sort((a,b)=> b.percent - a.percent || b.ts - a.ts);
    const trimmed = list.slice(0,50);
    saveLeaderboard(trimmed);
    renderLeaderboard(trimmed);
  }catch(e){}
}
