// ================================================================
// WORKFLOW — SEPARATION BOARD (الفصل) — 2-level drill-down: bottle type (مفلتر/رباعي/...) →
// list of that type's bottles. Going back a level is handled by the top "رجوع" button (goBack()).
// ================================================================
let _sepSelectedType = null, _sepLevel = 1;

function _sepShowLevel(n){
  _sepLevel = n;
  const g1=G('sepTypeGrid'), g3=G('sepBoardList');
  if(g1) g1.style.display = n===1 ? '' : 'none';
  if(g3) g3.style.display = n===2 ? '' : 'none';
  const g2=G('sepBulkBar'); if(g2 && n===1) g2.style.display='none'; // bulk bar only relevant inside a type's list
}

// Level 1 — one tile per separable bottle type, with a live count
async function loadSeparationBoard(){
  _sepSelectedType=null;
  load(true);
  const separableTypes=Object.keys(COMPONENT_RULES);
  // component_type='دم كامل' — same reasoning as loadSeparationList() below: a separated
  // bottle's resulting components share the same bottle_type as their parent, and must not be
  // counted here (they no longer belong in الفصل at all — this count has to match exactly
  // what loadSeparationList() will actually show when the tile is tapped).
  const{data}=await db.from('blood_donations')
    .select('bottle_type')
    .in('bottle_type', separableTypes).eq('component_type','دم كامل').eq('is_deleted',false)
    .in('status',['pending_lab','pending_release','in_stock']);
  load(false);
  const cnt={};
  (data||[]).forEach(r=>{ cnt[r.bottle_type]=(cnt[r.bottle_type]||0)+1; });
  const typeIcons={'مفلتر':BAG,'ريفيوس':BAG,'رباعي':BAG,'رباعي SAG':BAG,'ثنائي':BAG};
  G('sepTypeGrid').innerHTML=separableTypes.map(t=>`
    <div class="comp-stock-card ${(cnt[t]||0)===0?'empty-bt':''}" onclick="loadSeparationList('${t}')" style="cursor:pointer">
      <div class="comp-stock-icon">${typeIcons[t]||BAG}</div>
      <div class="comp-stock-name">${t}</div>
      <div class="comp-stock-count">${cnt[t]||0}</div>
    </div>`).join('');
  _sepShowLevel(1);
}

// Level 2 — the bottles of one selected type (previous flat-list logic, now filtered)
async function loadSeparationList(bottleType){
  _sepSelectedType=bottleType;
  load(true);
  // Only un-separated whole blood belongs here (tested or not — separation itself can happen
  // before or after testing). Once a bottle is separated, its resulting components move on to
  // المخزن المؤقت — they have nothing left to do in الفصل, so they no longer show up here at all
  // (previously they lingered in this list with no action available, just cluttering it).
  const{data}=await db.from('blood_donations')
    .select('id,bottle_number,bottle_type,blood_type,component_type,status,draw_date,campaign_name,donors(full_name)')
    .eq('bottle_type', bottleType).eq('component_type','دم كامل').eq('is_deleted',false)
    .in('status',['pending_lab','pending_release','in_stock'])
    .order('created_at',{ascending:true});
  load(false);
  const list=data||[];
  const titleBar=`<div style="font-size:18px;font-weight:700;color:#BE123C;margin-bottom:10px">${bottleType} — ${list.length} قنينة</div>`;
  if(!list.length){
    G('sepBoardList').innerHTML=titleBar+'<div class="empty"><i class="ti ti-dna"></i><p>لا توجد قناني من هذا النوع بمرحلة ما بعد السحب حالياً</p></div>';
    _sepShowLevel(2);
    return;
  }
  G('sepBoardList').innerHTML=titleBar+selAllRow('sep-chk','updateSepBulkBar')+list.map(r=>{
    const name=r.donors?.full_name?esc(r.donors.full_name):(r.campaign_name?'🚐 '+esc(r.campaign_name):'—');
    const tested=r.status==='in_stock'||r.status==='pending_release';
    return `<div class="flow-card">
      <input type="checkbox" class="sep-chk" value="${r.id}" data-bt="${r.bottle_type}" onclick="updateSepBulkBar()" style="width:18px;height:18px;flex-shrink:0">
      <div class="fc-av">${tested?'✅':'⏳'}</div>
      <div style="flex:1">
        <div class="fc-name">${name} — قنينة ${r.bottle_number||'—'}</div>
        <div class="fc-sub">${r.bottle_type} | ${r.component_type||'دم كامل'} | ${r.blood_type||'—'} | ${fd(r.draw_date)}</div>
        <div style="margin-top:4px">
          ${tested
            ? `<span class="pill pg">✅ سليمة — جاهزة للفصل</span>`
            : `<span class="pill py">⏳ لم تُفحص لحد الآن</span>`}
        </div>
      </div>
      <div class="fc-act" style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn btn-p" style="font-size:15px;padding:8px 10px" onclick="openSeparateModalBulk(['${r.id}'],'${r.bottle_type}','${r.bottle_number}')"><i class="ti ti-git-fork"></i> فصل</button>
        <button class="btn" style="font-size:15px;padding:8px 10px;border-color:#7F1D1D;color:#7F1D1D" onclick="openDamageModal(['${r.id}'])"><i class="ti ti-trash"></i> تلف</button>
      </div>
    </div>`;
  }).join('');
  updateSepBulkBar();
  _sepShowLevel(2);
}

function sepBulkDamage(){
  const checked=[...document.querySelectorAll('.sep-chk:checked')].map(c=>c.value);
  if(!checked.length){ toast('يرجى تحديد قنينة واحدة على الأقل','error'); return; }
  openDamageModal(checked);
}

function updateSepBulkBar(){
  syncSelAll('sep-chk');
  const n=document.querySelectorAll('.sep-chk:checked').length;
  const bar=G('sepBulkBar'); if(!bar) return;
  bar.style.display=n?'flex':'none';
  if(n) G('sepBulkCount').textContent=n+' محدد';
}
function sepBulkSeparate(){
  const checked=[...document.querySelectorAll('.sep-chk:checked')];
  if(!checked.length){ toast('يرجى تحديد قنينة واحدة على الأقل','error'); return; }
  const types=new Set(checked.map(c=>c.dataset.bt));
  if(types.size>1){ toast('يرجى تحديد قناني من نفس النوع بس للفصل الجماعي','error'); return; }
  const bt=[...types][0];
  openSeparateModalBulk(checked.map(c=>c.value), bt);
}

// ================================================================
// المخزن المؤقت (pending_release) — 2-level drill-down: component category (دم كامل / دم
// مضغوط / بلازما / صفائح دموية / بروتين بارد / ⛔ مصابة) → list of bottles in that category.
// Separable bottles land here once lab is fully complete (tracked before that via شاشة الفصل).
// Non-separable bottles (e.g. أحادي) come here IMMEDIATELY after draw — before blood type or
// serology are even known — and update live in place as each result comes in ("غير
// مفحوصة"/"الفصيلة غير محددة" → the actual result), so staff can watch them progress. Positive/
// infected bottles also surface here (already auto-flagged 'rejected_positive' and added to the
// rejected list for donor-safety) so staff can formally mark them 'تالفة'.
// ================================================================
const PR_CATEGORIES=['دم كامل','دم مضغوط','بلازما','صفائح دموية','بروتين بارد'];
let _prAllRows=[], _prSelectedCat=null, _prLevel=1;

function _prShowLevel(n){
  _prLevel=n;
  const g1=G('prTypeGrid'), g2=G('prList'), g3=G('prBulkBar');
  if(g1) g1.style.display = n===1 ? '' : 'none';
  if(g2) g2.style.display = n===2 ? '' : 'none';
  if(g3 && n===1) g3.style.display='none';
}

// Fetches every row that belongs in this screen (unchanged query logic) and shows level 1 —
// one tile per category, each with a live count.
async function loadPendingRelease(){
  load(true);
  const nonSeparableTypes=Object.keys(WHOLE_BLOOD_DAYS).filter(t=>!COMPONENT_RULES[t]);
  const sel='id,bottle_number,bottle_type,blood_type,component_type,status,draw_date,serology_result,serology_type,bottle_note,donors(full_name)';
  // (1) fully complete — either outcome, any type/component
  const{data:d1}=await db.from('blood_donations').select(sel)
    .in('status',['pending_release','rejected_positive']).eq('is_deleted',false);
  // (2) non-separable whole blood, still mid-lab — visible from the moment of draw
  const{data:d2}=await db.from('blood_donations').select(sel)
    .eq('status','pending_lab').in('bottle_type',nonSeparableTypes).eq('is_deleted',false);
  // (3) already-separated components, still mid-lab — visible from the moment of separation
  // (a separable type's un-separated دم كامل row stays out of here; it's tracked in شاشة الفصل)
  const{data:d3}=await db.from('blood_donations').select(sel)
    .eq('status','pending_lab').neq('component_type','دم كامل').eq('is_deleted',false);
  load(false);
  _prAllRows=[...(d1||[]),...(d2||[]),...(d3||[])].sort((a,b)=>(a.bottle_number||0)-(b.bottle_number||0));

  const counts={}; PR_CATEGORIES.forEach(c=>counts[c]=0); let infectedCount=0;
  _prAllRows.forEach(r=>{
    if(r.status==='rejected_positive'){ infectedCount++; return; }
    const ct=r.component_type||'دم كامل';
    counts[ct]=(counts[ct]||0)+1;
  });
  const catIcons={'دم كامل':BAG,'دم مضغوط':BAG,'بلازما':'💛','صفائح دموية':'🟡','بروتين بارد':'🧊'};
  const tiles = PR_CATEGORIES.map(c=>`
    <div class="comp-stock-card ${counts[c]===0?'empty-bt':''}" onclick="loadPendingReleaseList('${c}')" style="cursor:pointer">
      <div class="comp-stock-icon">${catIcons[c]}</div>
      <div class="comp-stock-name">${c}</div>
      <div class="comp-stock-count">${counts[c]}</div>
    </div>`).join('') + `
    <div class="comp-stock-card ${infectedCount===0?'empty-bt':''}" onclick="loadPendingReleaseList('__infected')" style="cursor:pointer;border-color:${infectedCount>0?'#FECDD3':'#EEF2F6'}">
      <div class="comp-stock-icon">⛔</div>
      <div class="comp-stock-name" style="color:#BE123C">مصابة</div>
      <div class="comp-stock-count" style="color:#BE123C">${infectedCount}</div>
    </div>`;
  G('prTypeGrid').innerHTML=tiles;
  _prShowLevel(1);
}

// Level 2 — the bottles of one selected category, rendered from the already-fetched _prAllRows
// (no extra query needed — everything for this screen was already pulled in loadPendingRelease).
function loadPendingReleaseList(cat){
  _prSelectedCat=cat;
  const list = cat==='__infected'
    ? _prAllRows.filter(r=>r.status==='rejected_positive')
    : _prAllRows.filter(r=>r.status!=='rejected_positive' && (r.component_type||'دم كامل')===cat);

  const titleBar=`<div style="font-size:19px;font-weight:700;color:#BE123C;margin-bottom:10px">${cat==='__infected'?'⛔ مصابة':cat} — ${list.length} قنينة</div>`;

  if(!list.length){
    G('prList').innerHTML=titleBar+'<div class="empty"><i class="ti ti-clock-hour-4"></i><p>لا توجد قناني بهذه الفئة حالياً</p></div>';
    _prShowLevel(2);
    return;
  }

  G('prList').innerHTML=titleBar+selAllRow('pr-chk','updatePrBulkBar',list.some(r=>r.status==='pending_release'))+list.map(r=>{
    const name=r.donors?.full_name?esc(r.donors.full_name):'—';
    const infected=r.status==='rejected_positive';
    const complete=r.status==='pending_release'||infected; // both blood type + serology known
    const canSeparate=!infected && (r.component_type==='دم كامل'||!r.component_type) && !!COMPONENT_RULES[r.bottle_type];
    // Live sub-status tags for a still-incomplete (pending_lab) bottle
    const btTag = r.blood_type ? r.blood_type : '<span style="color:#B45309">الفصيلة غير محددة</span>';
    const serTag = infected ? '<span style="color:#BE123C">⛔ مصابة</span>'
      : r.serology_result==='Positive' ? '<span style="color:#BE123C">⛔ مصابة</span>'
      : r.serology_result ? '<span style="color:#166534">✅ سليمة</span>'
      : '<span style="color:#B45309">⏳ غير مفحوصة</span>';
    return `<div class="flow-card">
      ${(infected||!complete)?'<span style="width:18px"></span>':`<input type="checkbox" class="pr-chk" value="${r.id}" onclick="updatePrBulkBar()" style="width:18px;height:18px;flex-shrink:0">`}
      <div class="fc-av">${infected?'⛔':complete?'⏳':'🕓'}</div>
      <div style="flex:1">
        <div class="fc-name">${name} — قنينة ${r.bottle_number||'—'}</div>
        <div class="fc-sub">${r.bottle_type||'—'} | ${r.component_type||'دم كامل'} | ${btTag} | ${fd(r.draw_date)}</div>
        <div style="margin-top:4px;display:flex;gap:6px;flex-wrap:wrap">
          ${!complete ? `<span class="pill py">${serTag}</span>` : ''}
          ${complete && !infected ? `<span class="pill py">⏳ بانتظار التأكيد</span>` : ''}
          ${infected ? `<span class="pill pr">⛔ مصابة${r.serology_type?' — '+esc(r.serology_type):''}</span>` : ''}
        </div>
        ${infected && r.bottle_note?`<div style="font-size:14px;color:#92400E;background:#FFFBEB;border-radius:8px;padding:6px 8px;margin-top:6px">📝 ${esc(r.bottle_note)}</div>`:''}
      </div>
      <div class="fc-act" style="display:flex;gap:6px;flex-wrap:wrap">
        ${canSeparate?`<button class="btn" style="font-size:15px;padding:8px 10px;border-color:#0369A1;color:#0369A1" onclick="openSeparateModalBulk(['${r.id}'],'${r.bottle_type}','${r.bottle_number}')"><i class="ti ti-git-fork"></i> فصل</button>`:''}
        ${infected
          ? `<button class="btn" style="font-size:15px;padding:8px 10px;border-color:#7F1D1D;color:#7F1D1D" onclick="openDamageModal(['${r.id}'])"><i class="ti ti-trash"></i> تلف</button>`
          : complete ? `<button class="btn btn-p" style="font-size:15px;padding:8px 10px" onclick="confirmRelease('${r.id}')"><i class="ti ti-check"></i> تأكيد</button>` : ''}
      </div>
    </div>`;
  }).join('');
  updatePrBulkBar();
  _prShowLevel(2);
}

// Refreshes whichever level the person is currently on, instead of always resetting to the
// category grid — so confirming/separating/damaging a bottle from deep in a category's list
// doesn't bounce them back out to level 1.
async function _prRefreshCurrentLevel(){
  if(_prLevel===2 && _prSelectedCat){ await loadPendingRelease(); loadPendingReleaseList(_prSelectedCat); }
  else await loadPendingRelease();
}

function updatePrBulkBar(){
  syncSelAll('pr-chk');
  const n=document.querySelectorAll('.pr-chk:checked').length;
  const bar=G('prBulkBar'); if(!bar) return;
  bar.style.display=n?'flex':'none';
  if(n) G('prBulkCount').textContent=n+' محدد';
}

async function confirmRelease(id){
  load(true);
  const{error}=await db.from('blood_donations').update({status:'in_stock'}).eq('id',id);
  load(false);
  if(error){ toast('خطأ: '+error.message,'error'); return; }
  await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'UPDATE',table_name:'blood_donations',record_id:id,new_values:{status:'in_stock'}});
  toast('✅ تم تأكيد القنينة — أصبحت جاهزة بالتجهيز','success');
  await withScrollPreserved(_prRefreshCurrentLevel);
}

async function bulkConfirmRelease(){
  const ids=[...document.querySelectorAll('.pr-chk:checked')].map(c=>c.value);
  if(!ids.length){ toast('يرجى تحديد قنينة واحدة على الأقل','error'); return; }
  load(true);
  const{error}=await db.from('blood_donations').update({status:'in_stock'}).in('id',ids);
  load(false);
  if(error){ toast('خطأ: '+error.message,'error'); return; }
  for(const id of ids){
    await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'UPDATE',table_name:'blood_donations',record_id:id,new_values:{status:'in_stock'}});
  }
  toast('✅ تم تأكيد '+ids.length+' قنينة','success');
  await withScrollPreserved(_prRefreshCurrentLevel);
}

// ================================================================
// WORKFLOW — CAMPAIGNS (حملات التبرع)
// ================================================================
async function loadCampaigns(){
  load(true);
  const{data:camps}=await db.from('campaigns').select('*').order('campaign_date',{ascending:false});
  const{data:slots}=await db.from('campaign_slots').select('campaign_id,status');
  load(false);
  const counts={};
  (slots||[]).forEach(s=>{
    counts[s.campaign_id]=counts[s.campaign_id]||{reserved:0,drawn:0,damaged:0,returned:0};
    counts[s.campaign_id][s.status]=(counts[s.campaign_id][s.status]||0)+1;
  });
  const list=camps||[];
  if(!list.length){
    G('campArchiveList').innerHTML='<div class="empty"><i class="ti ti-bus"></i><p>لا توجد حملات مسجّلة بعد</p></div>';
    return;
  }
  G('campArchiveList').innerHTML=list.map(c=>{
    const cnt=counts[c.id]||{reserved:0,drawn:0,damaged:0,returned:0};
    const total=cnt.reserved+cnt.drawn+cnt.damaged+cnt.returned;
    return `<div class="flow-card" onclick="openCampaignTracking('${c.id}','${sq(c.name)}')" style="cursor:pointer">
      <div class="fc-av">🚐</div>
      <div style="flex:1">
        <div class="fc-name">${esc(c.name)}</div>
        <div class="fc-sub">${fd(c.campaign_date)} ${c.location?'| '+esc(c.location):''} | إجمالي: ${total} — بانتظار: ${cnt.reserved} — نجح: ${cnt.drawn} — تالف: ${cnt.damaged}${cnt.returned?' — مرجّع: '+cnt.returned:''}</div>
      </div>
    </div>`;
  }).join('');
}

function showAddCampaignForm(){
  G('camp-name').value=''; G('camp-location').value='';
  G('camp-date').value=new Date().toISOString().split('T')[0];
  G('campReserveRows').innerHTML='';
  addCampReserveRow();
  G('camp-archive-view').style.display='none';
  G('camp-add-view').style.display='block';
}

function addCampReserveRow(){
  const div=document.createElement('div');
  div.className='camp-reserve-row';
  div.style.cssText='display:grid;grid-template-columns:1.5fr 1fr 1fr auto;gap:8px;margin-bottom:8px;align-items:center';
  const inp='padding:10px;border:1.5px solid #EEF2F6;border-radius:10px;font-family:inherit;min-width:0;text-align:center';
  div.innerHTML=`
    <select class="crr-type" style="padding:10px;border:1.5px solid #EEF2F6;border-radius:10px;font-family:inherit;background:#fff;min-width:0">
      <option value="مفلتر">مفلتر</option><option value="ريفيوس">ريفيوس</option>
      <option value="رباعي">رباعي</option><option value="رباعي SAG">رباعي SAG</option>
      <option value="ثنائي">ثنائي</option><option value="أحادي">أحادي</option>
    </select>
    <input type="text" inputmode="numeric" class="crr-from" placeholder="من" style="${inp}">
    <input type="text" inputmode="numeric" class="crr-to" placeholder="إلى" style="${inp}">
    <button class="ibtn" onclick="this.parentElement.remove()" style="color:#DC2626"><i class="ti ti-trash"></i></button>`;
  G('campReserveRows').appendChild(div);
}

// ── Campaign sequences are typed by hand (the numbers printed on the sheets taken to the field).
// They are completely separate from the reception sequences in Settings: nothing here reads or
// moves a bottle_sequences counter, and the reuse pool is not involved.
// Accepts Arabic-Indic digits too. Returns NaN for anything that is not a whole number.
function campNum(v){
  const s=String(v||'').trim().replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
  return /^\d+$/.test(s)?parseInt(s,10):NaN;
}
// Pure validation (no DOM). rows: [{n,type,from,to}] with from/to already parsed.
// Detects overlapping ranges of the SAME bottle type inside this one campaign only.
function campAnalyzeRanges(rows){
  const out={error:null, overlaps:[], big:[], tooBig:null};
  for(const r of rows){
    if(!Number.isInteger(r.from)||!Number.isInteger(r.to)||r.from<1||r.to<1){ out.error='السطر '+r.n+': اكتب رقمي "من" و"إلى" بشكل صحيح'; return out; }
    if(r.from>r.to){ out.error='السطر '+r.n+': رقم "من" أكبر من رقم "إلى"'; return out; }
    const len=r.to-r.from+1;
    if(len>50000){ out.tooBig=r; return out; }
    if(len>1000) out.big.push(r);
  }
  for(let i=0;i<rows.length;i++) for(let j=i+1;j<rows.length;j++){
    const a=rows[i], b=rows[j];
    if(a.type===b.type && a.from<=b.to && b.from<=a.to) out.overlaps.push({a,b});
  }
  return out;
}
// Every number once per bottle type (so an overlap the user chose to keep is not stored twice).
function campExpandRanges(rows){
  const by={};
  rows.forEach(r=>{ const s=by[r.type]||(by[r.type]=new Set()); for(let k=r.from;k<=r.to;k++) s.add(k); });
  return Object.entries(by).map(([type,s])=>({type, numbers:[...s].sort((x,y)=>x-y)}));
}

async function saveCampaign(){
  const name=G('camp-name').value.trim();
  const date=G('camp-date').value;
  const location=G('camp-location').value.trim();
  if(!name||!date){ toast('يرجى تعبئة اسم الحملة وتاريخها','error'); return; }
  const rows=[]; let n=0;
  for(const r of document.querySelectorAll('.camp-reserve-row')){
    n++;
    const f=r.querySelector('.crr-from').value.trim(), t=r.querySelector('.crr-to').value.trim();
    if(!f && !t) continue;                       // empty optional row — ignore
    rows.push({n, type:r.querySelector('.crr-type').value, from:campNum(f), to:campNum(t)});
  }
  if(!rows.length){ toast('اكتب تسلسلاً واحداً على الأقل (من — إلى) مع نوع القنينة','error'); return; }
  const an=campAnalyzeRanges(rows);
  if(an.error){ toast(an.error,'error'); return; }
  if(an.tooBig){ toast('السطر '+an.tooBig.n+': المدى كبير جداً (أكثر من 50,000 رقم) — راجع الأرقام','error'); return; }
  if(an.overlaps.length){
    const lines=an.overlaps.map(o=>'• '+o.a.type+': السطر '+o.a.n+' ('+o.a.from+'–'+o.a.to+') مع السطر '+o.b.n+' ('+o.b.from+'–'+o.b.to+')').join('\n');
    if(!confirm('⚠️ التسلسل متداخل داخل هذه الحملة:\n'+lines+'\n\nالأرقام المتداخلة تُسجَّل مرة واحدة فقط.\nهل تريد الحفظ رغم ذلك؟')) return;
  }
  if(an.big.length){
    const lines=an.big.map(r=>'• السطر '+r.n+': '+(r.to-r.from+1).toLocaleString('en')+' رقم').join('\n');
    if(!confirm('المدى التالي كبير:\n'+lines+'\n\nهل الأرقام صحيحة؟')) return;
  }
  const groups=campExpandRanges(rows);
  load(true);
  try{
    const{data:camp,error:ce}=await db.from('campaigns').insert({
      name, campaign_date:date, location:location||null, created_by:SES?.user?.id
    }).select().single();
    if(ce) throw ce;
    let total=0;
    for(const g of groups){
      const slotRows=g.numbers.map(x=>({campaign_id:camp.id, bottle_type:g.type, bottle_number:x, status:'reserved'}));
      for(let i=0;i<slotRows.length;i+=500){
        const{error:se}=await db.from('campaign_slots').insert(slotRows.slice(i,i+500));
        if(se) throw se;
      }
      total+=g.numbers.length;
    }
    await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'INSERT',table_name:'campaigns',record_id:camp.id,new_values:{name,numbers:total}});
    toast('✅ تم إنشاء الحملة وتسجيل '+total+' رقم','success',4000);
    G('camp-add-view').style.display='none';
    G('camp-archive-view').style.display='block';
    await loadCampaigns();
  }catch(e){ toast('خطأ: '+e.message,'error'); }
  finally{ load(false); }
}

let _currentCampaignId=null;
async function openCampaignTracking(id, name){
  _currentCampaignId=id;
  G('campTrackTitle').textContent='متابعة: '+(name||'');
  G('camp-archive-view').style.display='none';
  G('camp-add-view').style.display='none';
  G('camp-track-view').style.display='block';
  await refreshCampaignSlots();
}

async function refreshCampaignSlots(){
  load(true);
  const{data}=await db.from('campaign_slots').select('*').eq('campaign_id',_currentCampaignId).order('bottle_number',{ascending:true});
  load(false);
  const list=data||[];
  const cnt={reserved:0,drawn:0,damaged:0,returned:0};
  list.forEach(s=>cnt[s.status]=(cnt[s.status]||0)+1);
  G('campTrackSummary').innerHTML=`<div style="display:flex;gap:8px;flex-wrap:wrap;font-size:15.5px">
    <span class="pill py">بانتظار: ${cnt.reserved}</span>
    <span class="pill pg">نجح: ${cnt.drawn}</span>
    <span class="pill pr">تالف: ${cnt.damaged}</span>
    ${cnt.returned?`<span class="pill pb">مرجّع: ${cnt.returned}</span>`:''}
  </div>`;
  const pending=list.filter(s=>s.status==='reserved');
  if(!pending.length){
    G('campSlotsList').innerHTML='<div class="empty"><i class="ti ti-check"></i><p>لا توجد أرقام بانتظار إجراء</p></div>';
    updateCampBulkBar();
    return;
  }
  // Grouped by bottle type: each type is its own block with its own count and select-all.
  const types=[...new Set(pending.map(s=>s.bottle_type))];
  const card=s=>`
    <div class="flow-card">
      <input type="checkbox" class="camp-chk" value="${s.id}" onclick="updateCampBulkBar()" style="width:18px;height:18px;flex-shrink:0">
      <div class="fc-av">${BAG}</div>
      <div style="flex:1">
        <div class="fc-name">قنينة رقم ${s.bottle_number}</div>
        <div class="fc-sub">${s.bottle_type}</div>
      </div>
      <div class="fc-act" style="display:flex;gap:4px">
        <button class="ibtn" style="color:#166534" onclick="resolveCampSlots(['${s.id}'],'drawn')" title="نجح السحب"><i class="ti ti-check"></i></button>
        <button class="ibtn" style="color:#7F1D1D" onclick="resolveCampSlots(['${s.id}'],'damaged')" title="تلفت"><i class="ti ti-trash"></i></button>
      </div>
    </div>`;
  G('campSlotsList').innerHTML=(types.length>1?selAllRow('camp-chk','updateCampBulkBar'):'')+types.map((tp,i)=>{
    const items=pending.filter(s=>s.bottle_type===tp);
    return `<div id="campGrp${i}" style="margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:8px;margin:6px 0 8px;font-size:17px;font-weight:800;color:#1F2937">${esc(tp)} <span class="pill pb">${items.length}</span></div>
      ${selAllRow('camp-chk','updateCampBulkBar',true,'campGrp'+i)}
      ${items.map(card).join('')}
    </div>`;
  }).join('');
  updateCampBulkBar();
}

function updateCampBulkBar(){
  syncSelAll('camp-chk');
  const n=document.querySelectorAll('.camp-chk:checked').length;
  const bar=G('campBulkBar'); if(!bar) return;
  bar.style.display=n?'flex':'none';
  if(n) G('campBulkCount').textContent=n+' محدد';
}
function bulkCampAction(outcome){
  const ids=[...document.querySelectorAll('.camp-chk:checked')].map(c=>c.value);
  if(!ids.length){ toast('يرجى تحديد قنينة واحدة على الأقل','error'); return; }
  resolveCampSlots(ids, outcome);
}

// Single shared resolver for both the per-row buttons and the bulk bar.
// drawn    → creates the real blood_donations row (no donor — "متبرع حملة") and sends it to
//            the lab queue, exactly like a normal draw.
// damaged  → just recorded on the slot; no blood_donations row (nothing was actually usable).
async function resolveCampSlots(slotIds, outcome){
  if(outcome==='damaged' && !confirm('تأكيد: '+slotIds.length+' قنينة تلفت أثناء السحب؟')) return;
  load(true);
  try{
    const{data:campaign}=await db.from('campaigns').select('name,campaign_date,location').eq('id',_currentCampaignId).single();
    for(const id of slotIds){
      const{data:slot}=await db.from('campaign_slots').select('*').eq('id',id).single();
      if(!slot || slot.status!=='reserved') continue;
      if(outcome==='drawn'){
        const days=WHOLE_BLOOD_DAYS[slot.bottle_type] ?? 45;
        const e=new Date(campaign.campaign_date); e.setDate(e.getDate()+days);
        const{data:don,error:de}=await db.from('blood_donations').insert({
          donor_id:null, bottle_type:slot.bottle_type, bottle_number:slot.bottle_number,
          donation_type:'طوعي', campaign_name:campaign.name, campaign_date:campaign.campaign_date,
          campaign_location:campaign.location, draw_date:campaign.campaign_date,
          donation_date:campaign.campaign_date, expiry_date:e.toISOString().split('T')[0],
          status:'pending_lab', created_by:SES?.user?.id
        }).select().single();
        if(de) throw de;
        await db.from('campaign_slots').update({status:'drawn', donation_id:don.id}).eq('id',id);
      } else if(outcome==='damaged'){
        await db.from('campaign_slots').update({status:'damaged'}).eq('id',id);
      }
    }
    await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'UPDATE',table_name:'campaign_slots',record_id:slotIds[0],new_values:{outcome,count:slotIds.length}});
    toast('✅ تم تحديث '+slotIds.length+' رقم','success',3500);
    await refreshCampaignSlots();
  }catch(e){ toast('خطأ: '+e.message,'error'); }
  finally{ load(false); }
}
