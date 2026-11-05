// ================================================================
// WORKFLOW — SEPARATION BOARD (الفصل) — 2-level drill-down: bottle type (مفلتر/رباعي/...) →
// list of that type's bottles. Going back a level is handled by the top "رجوع" button (goBack()).
// ================================================================
let _sepSelectedType = null, _sepLevel = 1;

function _sepShowLevel(n){
  _sepLevel = n;
  const g1=G('sepTypeGrid'), g3=G('sepBoardList'), g4=G('sepStatsPane'), gb=G('sepStatsBtn');
  if(g1) g1.style.display = 'none';
  if(g3) g3.style.display = (n===1||n===2) ? '' : 'none';
  if(g4) g4.style.display = n===3 ? '' : 'none';
  if(gb) gb.style.display = n===1 ? '' : 'none';      // the statistics button lives on the first level only
  const g2=G('sepBulkBar'); if(g2 && n!==2) g2.style.display='none'; // bulk bar only relevant inside a type's list
}

// الفصل الآن يعرض الاستمارات (راجع forms-view.js) بدل شبكة أنواع القناني؛ الإحصائيات تبقى بزرها
const SEP_FV = {
  unit:'sep', host:'sepBoardList', groups:['R','B'], chk:'sep-chk', onSel:'updateSepBulkBar', bigBottle:true,
  // الفصل للدم الكامل فقط (ناتج الفصل لا يدخل هنا)
  filter:m=> (m.component_type||'دم كامل')==='دم كامل' && !!COMPONENT_RULES[m.bottle_type] || m.status==='pending_draw' || m.exit_reason==='medical_reject',
  stateOf(m){
    const note=(m.bottle_note||'').replace(/^رفض طبي:\s*/,'');
    if(m.exit_reason==='medical_reject') return {k:'excl',t:'⛔ مرفوض طبياً'+(note?': '+note:'')};
    if(m.status==='pending_draw') return {k:'notready',t:'بانتظار السحب'};
    if(m.status==='damaged') return {k:'excl',t:'⛔ تالف'+(note?': '+note:'')};
    if(m.status==='rejected_positive') return {k:'excl',t:'🦠 إصابة: '+(m.serology_type||'')};
    if(m.not_separated && m.status!=='separated') return {k:'done',ns:true,t:'🩸 لم تُفصل — دم طبيعي (تُحفظ كدم كامل)'};
    if(m.status==='pending_lab') return {k:'ready',t:'⏳ لم تُفحص لحد الآن'};
    if(m.status==='pending_release'||m.status==='in_stock') return {k:'ready',t:'✅ سليمة — جاهزة للفصل'};
    if(m.status==='separated') return {k:'done',t:'✓ تم الفصل'};
    return {k:'done',t:'—'};
  },
  sub:m=>(m.bottle_type||'')+' | '+(m.blood_type||'—'),
  bulkBar:()=>`<div id="sepBulkBar" style="display:none;position:sticky;top:0;z-index:5;background:#1a1a1a;color:#fff;padding:10px 14px;border-radius:12px;margin-bottom:10px;align-items:center;justify-content:space-between;gap:8px">
    <span id="sepBulkCount">0 محدد</span>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <button class="btn" style="background:#0369A1;color:#fff;border:none" onclick="sepBulkSeparate()"><i class="ti ti-git-fork"></i> فصل المحدد</button>
      <button class="btn" style="background:#0F766E;color:#fff;border:none" onclick="sepBulkNotSeparated()"><i class="ti ti-droplet"></i> لم تُفصل</button>
      <button class="btn" style="background:#7F1D1D;color:#fff;border:none" onclick="sepBulkDamage()"><i class="ti ti-trash"></i> تلف المحدد</button>
      <button class="btn" style="background:#374151;color:#fff;border:none" onclick="document.querySelectorAll('.sep-chk').forEach(c=>c.checked=false);updateSepBulkBar()">إلغاء التحديد</button>
    </div></div>`,
  actions(m,st){
    if(st.ns) return `<button class="btn" style="font-size:15px;padding:8px 10px" onclick="openSeparateModalBulk(['${m.id}'],'${m.bottle_type}','${m.bottle_number}')"><i class="ti ti-git-fork"></i> فصل</button>
      <button class="btn" style="font-size:15px;padding:8px 10px" onclick="undoNotSeparated('${m.id}')"><i class="ti ti-arrow-back-up"></i> تراجع</button>`;
    if(st.k!=='ready') return '';
    return `<button class="btn btn-p" style="font-size:15px;padding:8px 10px" onclick="openSeparateModalBulk(['${m.id}'],'${m.bottle_type}','${m.bottle_number}')"><i class="ti ti-git-fork"></i> فصل</button>
      <button class="btn" style="font-size:15px;padding:8px 10px;border-color:#0F766E;color:#0F766E" onclick="markNotSeparated(['${m.id}'])"><i class="ti ti-droplet"></i> لم تُفصل</button>
      <button class="btn" style="font-size:15px;padding:8px 10px;border-color:#7F1D1D;color:#7F1D1D" onclick="openDamageModal(['${m.id}'])"><i class="ti ti-trash"></i> تلف</button>`;
  },
  async legacy(){
    const{data}=await db.from('blood_donations')
      .select('id,bottle_number,bottle_type,blood_type,status,campaign_name,donors(full_name)')
      .in('bottle_type',Object.keys(COMPONENT_RULES)).eq('component_type','دم كامل').eq('is_deleted',false).is('collection_form_id',null)
      .in('status',['pending_lab','pending_release','in_stock']).order('created_at',{ascending:true});
    const rows=data||[]; if(!rows.length) return '';
    const row=r=>`<div class="flow-card">
      <input type="checkbox" class="sep-chk" value="${r.id}" data-bt="${r.bottle_type}" onclick="updateSepBulkBar()" style="width:18px;height:18px;flex-shrink:0">
      <div class="fc-av">${BAG}</div>
      <div style="flex:1"><div class="fc-name fc-bn">${r.bottle_number||'—'}</div><div class="fc-sub fc-dn">${esc(r.donors?.full_name||'—')} | ${r.bottle_type} | ${r.blood_type||'—'}</div></div>
      <div class="fc-act"><button class="btn btn-p" onclick="openSeparateModalBulk(['${r.id}'],'${r.bottle_type}','${r.bottle_number}')"><i class="ti ti-git-fork"></i> فصل</button>
      <button class="btn" style="border-color:#7F1D1D;color:#7F1D1D" onclick="openDamageModal(['${r.id}'])"><i class="ti ti-trash"></i> تلف</button></div></div>`;
    const camp=rows.filter(r=>r.campaign_name&&!r.donors), old=rows.filter(r=>!(r.campaign_name&&!r.donors));
    return FV.folders(camp,{chk:'sep-chk',onSel:'updateSepBulkBar',bulkFn:'sepBulkSeparate()',bulkLabel:'فصل المحدد',row})
      + (old.length?'<div style="margin:14px 0 6px;font-weight:700;color:#6B7280">بدون استمارة (سجلات قديمة)</div>'+old.map(row).join(''):'');
  }
};
async function loadSeparationBoard(){ _sepSelectedType=null; _sepShowLevel(1); if(typeof autoMarkExpiredDamaged==='function'){ try{ await autoMarkExpiredDamaged(); }catch(e){} } refreshPltBox(); await FV.show(SEP_FV); }
// بعد فصل/إتلاف: تحديث العرض الحالي مع البقاء داخل نفس الاستمارة
async function loadSeparationList(){ _sepShowLevel(1); refreshPltBox(); await FV.refresh('sep'); }

function sepBulkNotSeparated(){
  const ids=[...document.querySelectorAll('.sep-chk:checked')].map(c=>c.value);
  if(!ids.length){ toast('يرجى تحديد قنينة واحدة على الأقل','error'); return; }
  markNotSeparated(ids);
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
const PR_CATEGORIES=['دم كامل','دم مضغوط','دم مفلتر','بلازما','صفائح دموية','بروتين بارد'];
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
  const sel='id,bottle_number,bottle_type,blood_type,component_type,status,draw_date,serology_result,serology_type,bottle_note,pool_numbers,donors(full_name)';
  // (1) fully complete — either outcome, any type/component
  const d1=await bbFetchAll(()=>db.from('blood_donations').select('id,'+sel)
    .in('status',['pending_release','rejected_positive']).eq('is_deleted',false));
  // (2) non-separable whole blood, still mid-lab — visible from the moment of draw
  const d2=await bbFetchAll(()=>db.from('blood_donations').select('id,'+sel)
    .eq('status','pending_lab').in('bottle_type',nonSeparableTypes).eq('is_deleted',false));
  // (3) already-separated components, still mid-lab — visible from the moment of separation
  // (a separable type's un-separated دم كامل row stays out of here; it's tracked in شاشة الفصل)
  const d3=await bbFetchAll(()=>db.from('blood_donations').select('id,'+sel)
    .eq('status','pending_lab').neq('component_type','دم كامل').eq('is_deleted',false));
  // (4) دم كامل لنوع قابل للفصل اختير له «لم تُفصل» — يكمل مساره كدم طبيعي حتى قبل اكتمال الفحص
  let d4=[]; try{ d4=await bbFetchAll(()=>db.from('blood_donations').select('id,'+sel)
    .eq('status','pending_lab').eq('not_separated',true).eq('component_type','دم كامل').eq('is_deleted',false)); }catch(e){ d4=[]; }
  load(false);
  _prAllRows=[...(d1||[]),...(d2||[]),...(d3||[]),...d4].sort((a,b)=>(a.bottle_number||0)-(b.bottle_number||0));

  const counts={}; PR_CATEGORIES.forEach(c=>counts[c]=0); let infectedCount=0;
  _prAllRows.forEach(r=>{
    if(r.status==='rejected_positive'){ infectedCount++; return; }
    const ct=r.component_type||'دم كامل';
    counts[ct]=(counts[ct]||0)+1;
  });
  const catIcons={'دم كامل':BAG,'دم مضغوط':BAG,'دم مفلتر':BAG,'بلازما':'💛','صفائح دموية':'🟡','بروتين بارد':'🧊'};
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
        <div class="fc-name fc-bn">${bbBnLabel(r)}</div>
        <div class="fc-sub fc-dn">${r.pool_numbers?'القناني: '+esc(r.pool_numbers)+' | ':name+' | '+(r.bottle_type||'—')+' | '}${r.component_type||'دم كامل'} | ${btTag} | ${fd(r.draw_date)}</div>
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
          : complete ? `<button class="btn" style="font-size:15px;padding:8px 10px;border-color:#7F1D1D;color:#7F1D1D" onclick="openDamageModal(['${r.id}'])"><i class="ti ti-trash"></i> تلف</button><button class="btn btn-p" style="font-size:15px;padding:8px 10px" onclick="confirmRelease('${r.id}')"><i class="ti ti-check"></i> تأكيد</button>` : ''}
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
  const pb=G('prPoolBtn'); if(pb) pb.style.display = (_prSelectedCat==='صفائح دموية') ? '' : 'none';
}
function prBulkDamage(){
  const ids=[...document.querySelectorAll('.pr-chk:checked')].map(c=>c.value);
  if(!ids.length){ toast('يرجى تحديد قنينة واحدة على الأقل','error'); return; }
  openDamageModal(ids);
}

// دمج صفيحات (Bolling): عدة أكياس صفيحات من الفصل تُجمع بقنينة واحدة تُجهَّز كقنينة واحدة.
// الشروط: صفيحات سليمة بالمخزن المؤقت، من غير التريما، بنفس الفصيلة (A/B/AB/O). الإكسباير = أقرب إكسباير بين المجمّعة.
// المجمَّعة الأصلية تصير «separated» (خرجت من الرصيد) وتبقى مربوطة بالقنينة الجديدة (pooled_into).
async function prBulkPool(){
  const ids=[...document.querySelectorAll('.pr-chk:checked')].map(c=>c.value);
  if(ids.length<2){ toast('اختر قنينتين صفيحات على الأقل للدمج','error'); return; }
  if(!IS_ONLINE){ toast('الدمج يحتاج اتصالاً بالإنترنت','warning'); return; }
  const rows=_prAllRows.filter(r=>ids.includes(r.id));
  if(rows.length!==ids.length){ toast('تعذّر قراءة المحدد، حدّث الصفحة','error'); return; }
  if(rows.some(r=>r.component_type!=='صفائح دموية'||r.status!=='pending_release'||r.bottle_type==='تريما'||r.pool_numbers)){ toast('الدمج لصفيحات سليمة بالمخزن المؤقت فقط (غير التريما وغير المدموجة سابقاً)','error',6000); return; }
  const abo=x=>String(x||'').replace(/[+-]/g,'');
  if(rows.some(r=>!r.blood_type)){ toast('بعض الصفيحات بلا فصيلة','error'); return; }
  if(new Set(rows.map(r=>abo(r.blood_type))).size>1){ toast('⛔ لازم تكون كل الصفيحات من نفس الفصيلة (A / B / AB / O)','error',6000); return; }
  const nums=rows.map(r=>r.bottle_number).sort((a,b)=>a-b);
  if(!(await bbConfirm('دمج '+rows.length+' صفيحات ('+nums.join('، ')+') بقنينة واحدة باسم '+POOL_NAME+'؟ لا يمكن التراجع من التطبيق.'))) return;
  load(true);
  let poolId=null;
  try{
    const{data:full,error:fe}=await db.from('blood_donations').select('id,bottle_number,bottle_type,blood_type,donation_type,draw_date,expiry_date').in('id',ids);
    if(fe) throw fe;
    const bts=new Set(full.map(r=>r.blood_type)); const bt = bts.size===1 ? [...bts][0] : abo(full[0].blood_type);
    const draws=full.map(r=>r.draw_date).filter(Boolean).sort(), exps=full.map(r=>r.expiry_date).filter(Boolean).sort();
    const first=full.slice().sort((a,b)=>a.bottle_number-b.bottle_number)[0];
    const row={donor_id:null,bottle_number:first.bottle_number,bottle_type:first.bottle_type,blood_type:bt,donation_type:first.donation_type,component_type:'صفائح دموية',
      draw_date:draws[0]||null,donation_date:draws[0]||null,expiry_date:exps[0]||null,serology_result:'Negative',serology_type:null,status:'pending_release',
      pool_numbers:nums.join('، '),created_by:SES?.user?.id};
    const ins=await db.from('blood_donations').insert(row).select('id').single();
    if(ins.error) throw ins.error;
    poolId=ins.data.id;
    const up=await db.from('blood_donations').update({status:'separated',pooled_into:poolId}).in('id',ids);
    if(up.error){ await db.from('blood_donations').update({is_deleted:true}).eq('id',poolId); throw up.error; }
    await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'INSERT',table_name:'blood_donations',record_id:poolId,new_values:{pool:POOL_NAME,members:nums,blood_type:bt,expiry:row.expiry_date}});
    toast('✅ تم الدمج: '+POOL_NAME+' ('+nums.join('، ')+') — بانتظار التأكيد','success',5000);
    await withScrollPreserved(_prRefreshCurrentLevel);
  }catch(e){ toast('خطأ: '+(e.message||e)+(/pool_numbers|pooled_into|column/i.test(e.message||'')?' — شغّل SQL الدمج في Supabase':''),'error',9000); }
  finally{ load(false); }
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
  G('camp-tot-from').value=''; G('camp-tot-to').value='';
  addCampReserveRow();
  campPreviewReset();
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

const CAMP_DMG_REASON='تلف أثناء الحملة';
let _campPlan=null;
function campPreviewReset(){
  _campPlan=null;
  const p=G('campPreview'); if(p) p.style.display='none';
  const sb=G('campSaveBtn'); if(sb) sb.style.display='none';
  // live totals: sum of the type ranges against the total range
  const t=G('campTotals'); if(!t) return;
  const tf=campNum(G('camp-tot-from').value), tt=campNum(G('camp-tot-to').value);
  const total=(Number.isInteger(tf)&&Number.isInteger(tt)&&tt>=tf)?tt-tf+1:0;
  let sum=0;
  document.querySelectorAll('.camp-reserve-row').forEach(r=>{
    const f=campNum(r.querySelector('.crr-from').value), x=campNum(r.querySelector('.crr-to').value);
    if(Number.isInteger(f)&&Number.isInteger(x)&&x>=f) sum+=x-f+1;
  });
  if(!total && !sum){ t.textContent=''; return; }
  const ok = total && sum===total;
  t.style.color = ok?'#166534':'#B45309';
  t.textContent = 'المدى الكلي: '+total+' — مجموع الأنواع: '+sum+(ok?' ✅':(total?' ⚠ (الفرق '+Math.abs(total-sum)+')':''));
}

// Validates the whole form and shows every bottle as a tappable chip (tap = damaged). Nothing is saved yet.
async function campPreviewBuild(){
  const name=G('camp-name').value.trim(), date=G('camp-date').value;
  if(!name||!date){ toast('يرجى تعبئة اسم الحملة وتاريخها','error'); return; }
  const tf=campNum(G('camp-tot-from').value), tt=campNum(G('camp-tot-to').value);
  if(!Number.isInteger(tf)||!Number.isInteger(tt)||tf<1||tt<tf){ toast('اكتب المدى الكلي (من — إلى) بشكل صحيح','error'); return; }
  if(tt-tf+1>5000){ toast('المدى الكلي كبير جداً (أكثر من 5000 رقم) — راجع الأرقام','error'); return; }
  const rows=[]; let n=0;
  for(const r of document.querySelectorAll('.camp-reserve-row')){
    n++;
    const f=r.querySelector('.crr-from').value.trim(), t=r.querySelector('.crr-to').value.trim();
    if(!f && !t) continue;
    rows.push({n, type:r.querySelector('.crr-type').value, from:campNum(f), to:campNum(t)});
  }
  if(!rows.length){ toast('اكتب نوع قنينة واحداً على الأقل (من — إلى)','error'); return; }
  const an=campAnalyzeRanges(rows);
  if(an.error){ toast(an.error,'error'); return; }
  for(const r of rows){ if(r.from<tf||r.to>tt){ toast('السطر '+r.n+': الأرقام خارج المدى الكلي ('+tf+'–'+tt+')','error',7000); return; } }
  for(let i=0;i<rows.length;i++) for(let j=i+1;j<rows.length;j++){
    const a=rows[i], b=rows[j];
    if(a.from<=b.to && b.from<=a.to){ toast('⛔ السطران '+a.n+' و'+b.n+' متداخلان ('+a.from+'–'+a.to+' مع '+b.from+'–'+b.to+'). كل رقم يجب أن يكون لنوع واحد فقط','error',9000); return; }
  }
  const sum=rows.reduce((t,r)=>t+(r.to-r.from+1),0), total=tt-tf+1;
  if(sum!==total){ toast('⛔ مجموع الأنواع ('+sum+') لا يساوي المدى الكلي ('+total+'). يجب أن يتطابقا تماماً','error',9000); return; }
  load(true);
  try{
    const sq=await db.from('bottle_sequences').select('start_number,end_number').eq('bottle_type','الحملات').eq('is_active',true);
    if(sq.data && sq.data.length && !sq.data.some(x=>tf>=x.start_number && tt<=x.end_number)){
      load(false); toast('⛔ المدى '+tf+'–'+tt+' خارج تسلسل «الحملات» المسجّل بالإعدادات ('+sq.data.map(x=>x.start_number+'–'+x.end_number).join('، ')+')','error',10000); return; }
    const msg=await bbRangeClash(tf,tt,{ignoreSeqs:true});
    if(msg){ load(false); toast('⛔ '+msg+'. ولا يمكن المتابعة','error',10000); return; }
  }catch(e){ load(false); toast('خطأ: '+e.message,'error'); return; }
  load(false);
  _campPlan={name,date,location:G('camp-location').value.trim(),tf,tt,rows};
  const sorted=rows.slice().sort((a,b)=>a.from-b.from);
  G('campPreviewBody').innerHTML=sorted.map(r=>{
    let chips=''; for(let k=r.from;k<=r.to;k++) chips+='<span class="camp-chip" data-t="'+esc(r.type)+'" data-n="'+k+'" onclick="campChipToggle(this)">'+k+'</span>';
    return '<div style="margin-bottom:12px"><div style="font-size:16px;font-weight:800;margin-bottom:4px">'+esc(r.type)+' <span class="pill pb">'+(r.to-r.from+1)+'</span> <span style="font-size:13.5px;color:#6B7280;font-weight:600">'+r.from+' ← '+r.to+'</span></div>'+chips+'</div>';
  }).join('');
  G('campPreview').style.display='block';
  G('campSaveBtn').style.display='';
  campChipCount();
}
function campChipToggle(el){ el.classList.toggle('dmg'); campChipCount(); }
function campChipCount(){
  const all=document.querySelectorAll('#campPreviewBody .camp-chip').length;
  const d=document.querySelectorAll('#campPreviewBody .camp-chip.dmg').length;
  G('campPreviewCount').innerHTML='الإجمالي: '+all+' — <span style="color:#991B1B">تالفة: '+d+'</span> — <span style="color:#166534">تُسجَّل مسحوبة: '+(all-d)+'</span>';
}

async function saveCampaign(){
  const P=_campPlan;
  if(!P){ toast('اضغط «عرض القناني» أولاً','error'); return; }
  const dmg=new Set([...document.querySelectorAll('#campPreviewBody .camp-chip.dmg')].map(e=>e.dataset.t+'|'+e.dataset.n));
  const items=[];
  P.rows.forEach(r=>{ for(let k=r.from;k<=r.to;k++) items.push({type:r.type,num:k,dmg:dmg.has(r.type+'|'+k)}); });
  const nd=items.filter(i=>i.dmg).length;
  if(!(await bbConfirm('حفظ الحملة «'+P.name+'»؟\n'+items.length+' قنينة: '+(items.length-nd)+' تُسجَّل مسحوبة وتكمل مسارها، و'+nd+' تالفة.'))) return;
  load(true);
  let camp=null;
  try{
    // الأرقام يجب أن تكون حرّة تماماً لحظة الحفظ (تحقق ثانٍ قبل الإدخال)
    { const msg=await bbRangeClash(P.tf,P.tt,{ignoreSeqs:true}); if(msg){ load(false); toast('⛔ '+msg+'. ولا يمكن المتابعة','error',10000); return; } }
    const ins=await db.from('campaigns').insert({name:P.name, campaign_date:P.date, location:P.location||null, created_by:SES?.user?.id}).select().single();
    if(ins.error) throw ins.error;
    camp=ins.data;
    // 1) every number is first recorded as a slot (so a failure half-way leaves them visible & finishable in the campaign page)
    const slots=[];
    for(let i=0;i<items.length;i+=500){
      const rows=items.slice(i,i+500).map(x=>({campaign_id:camp.id,bottle_type:x.type,bottle_number:x.num,status:x.dmg?'damaged':'reserved'}));
      const r=await db.from('campaign_slots').insert(rows).select('id,bottle_type,bottle_number,status');
      if(r.error) throw r.error;
      slots.push(...r.data);
    }
    // 2) every bottle becomes a real row: non-damaged → pending_lab (same as after a normal draw),
    //    damaged → status 'damaged' so it shows in the damaged store with a note that it came from a campaign
    let done=0, dmgDone=0;
    for(let i=0;i<slots.length;i+=200){
      const chunk=slots.slice(i,i+200);
      const dRows=chunk.map(s=>{
        const days=WHOLE_BLOOD_DAYS[s.bottle_type] ?? 45;
        const e=new Date(P.date); e.setDate(e.getDate()+days);
        const base={donor_id:null, bottle_type:s.bottle_type, bottle_number:s.bottle_number, donation_type:'طوعي',
          campaign_name:P.name, campaign_date:P.date, campaign_location:P.location||null, draw_date:P.date,
          donation_date:P.date, expiry_date:e.toISOString().split('T')[0], created_by:SES?.user?.id};
        return s.status==='damaged'
          ? {...base, status:'damaged', damage_reason:CAMP_DMG_REASON, damaged_date:P.date, bottle_note:'تالفة من الحملة «'+P.name+'»'}
          : {...base, status:'pending_lab'};
      });
      const dr=await db.from('blood_donations').insert(dRows).select('id,bottle_type,bottle_number');
      if(dr.error) throw new Error('تعذّر تسجيل القناني ('+dr.error.message+'). الحملة محفوظة وما تم تسجيله يظهر بصفحتها');
      const idBy={}; dr.data.forEach(d=>{ idBy[d.bottle_type+'|'+d.bottle_number]=d.id; });
      const up=chunk.map(s=>({id:s.id,campaign_id:camp.id,bottle_type:s.bottle_type,bottle_number:s.bottle_number,status:s.status==='damaged'?'damaged':'drawn',donation_id:idBy[s.bottle_type+'|'+s.bottle_number]}));
      const ur=await db.from('campaign_slots').upsert(up,{onConflict:'id'});
      if(ur.error) throw new Error('سُجّلت القناني لكن تعذّر تحديث حالة أرقام الحملة: '+ur.error.message);
      chunk.forEach(s=>{ if(s.status==='damaged') dmgDone++; else done++; });
    }
    await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'INSERT',table_name:'campaigns',record_id:camp.id,new_values:{name:P.name,range:P.tf+'-'+P.tt,total:items.length,drawn:done,damaged:nd}});
    toast('✅ تم إنشاء الحملة: '+done+' مسحوبة و'+nd+' تالفة','success',5000);
    _campPlan=null;
    G('camp-add-view').style.display='none';
    G('camp-archive-view').style.display='block';
    await loadCampaigns();
  }catch(e){
    toast('خطأ: '+e.message,'error',12000);
    if(camp){ G('camp-add-view').style.display='none'; G('camp-archive-view').style.display='block'; try{ await loadCampaigns(); }catch(x){} }
  }
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
  const doneHtml=campDoneHtml(list);
  if(!pending.length){
    G('campSlotsList').innerHTML='<div class="empty"><i class="ti ti-check"></i><p>لا توجد أرقام بانتظار إجراء</p></div>'+doneHtml;
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
  }).join('')+doneHtml;
  updateCampBulkBar();
}
// Already-resolved numbers of a campaign (drawn / damaged). A damaged one can be put back as a normal drawn bottle.
function campDoneHtml(list){
  const dm=list.filter(s=>s.status==='damaged'), dr=list.filter(s=>s.status==='drawn');
  let h='';
  if(dr.length){
    const types=[...new Set(dr.map(s=>s.bottle_type))];
    h+='<div style="margin-top:14px;font-size:16px;font-weight:800;color:#166534">✅ مسحوبة ('+dr.length+')</div>'+types.map(tp=>'<div style="margin:6px 0 2px;font-weight:700">'+esc(tp)+'</div>'+dr.filter(s=>s.bottle_type===tp).map(s=>'<span class="camp-chip">'+s.bottle_number+'</span>').join('')).join('');
  }
  if(dm.length){
    h+='<div style="margin-top:14px;font-size:16px;font-weight:800;color:#991B1B">🗑️ تالفة ('+dm.length+')</div>'+dm.map(s=>'<div class="flow-card"><div class="fc-av">'+BAG+'</div><div style="flex:1"><div class="fc-name">قنينة رقم '+s.bottle_number+'</div><div class="fc-sub">'+esc(s.bottle_type)+'</div></div><div class="fc-act"><button class="btn" style="font-size:14px;padding:6px 10px" onclick="resolveCampSlots([\''+s.id+'\'],\'drawn\')">سليمة — سجّلها مسحوبة</button></div></div>').join('');
  }
  return h;
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
  if(outcome==='damaged' && !(await bbConfirm('تأكيد: '+slotIds.length+' قنينة تلفت أثناء السحب؟'))) return;
  load(true);
  try{
    const{data:campaign}=await db.from('campaigns').select('name,campaign_date,location').eq('id',_currentCampaignId).single();
    const failed=[], blocked=[];
    const days=t=>WHOLE_BLOOD_DAYS[t] ?? 45;
    const expOf=t=>{ const e=new Date(campaign.campaign_date); e.setDate(e.getDate()+days(t)); return e.toISOString().split('T')[0]; };
    const base=slot=>({donor_id:null, bottle_type:slot.bottle_type, bottle_number:slot.bottle_number,
      donation_type:'طوعي', campaign_name:campaign.name, campaign_date:campaign.campaign_date,
      campaign_location:campaign.location, draw_date:campaign.campaign_date,
      donation_date:campaign.campaign_date, expiry_date:expOf(slot.bottle_type), created_by:SES?.user?.id});
    for(const id of slotIds){
      const{data:slot}=await db.from('campaign_slots').select('*').eq('id',id).single();
      if(!slot) continue;
      if(outcome==='drawn' && slot.status==='damaged' && slot.donation_id){
        // put a damaged bottle back: only if it is still sitting in the damaged store (not already in a destruction report)
        const{data:d0}=await db.from('blood_donations').select('id,status,destruction_report_id').eq('id',slot.donation_id).single();
        if(!d0 || d0.status!=='damaged' || d0.destruction_report_id){ blocked.push(slot.bottle_number); continue; }
        const{error:ue}=await db.from('blood_donations').update({status:'pending_lab',damage_reason:null,damaged_date:null,bottle_note:null}).eq('id',slot.donation_id);
        if(ue) throw ue;
        { const{error:se}=await db.from('campaign_slots').update({status:'drawn'}).eq('id',id); if(se) throw se; }
        continue;
      }
      if(slot.status!=='reserved' && !(outcome==='drawn' && slot.status==='damaged')) continue;
      if(outcome==='drawn'){
        const{data:don,error:de}=await db.from('blood_donations').insert({...base(slot), status:'pending_lab'}).select().single();
        if(de){
          if(/duplicate key|bottle_number/i.test(de.message||'')){ failed.push(slot.bottle_number); continue; }
          throw de;
        }
        { const{error:se2}=await db.from('campaign_slots').update({status:'drawn', donation_id:don.id}).eq('id',id);
          if(se2) throw new Error('سُجّلت القنينة '+slot.bottle_number+' لكن تعذّر تحديث حالة الرقم المحجوز: '+se2.message); }
      } else if(outcome==='damaged'){
        const{data:don,error:de}=await db.from('blood_donations').insert({...base(slot), status:'damaged', damage_reason:CAMP_DMG_REASON, damaged_date:campaign.campaign_date, bottle_note:'تالفة من الحملة «'+campaign.name+'»'}).select().single();
        if(de){
          if(/duplicate key|bottle_number/i.test(de.message||'')){ failed.push(slot.bottle_number); continue; }
          throw de;
        }
        { const{error:se3}=await db.from('campaign_slots').update({status:'damaged', donation_id:don.id}).eq('id',id); if(se3) throw se3; }
      }
    }
    await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'UPDATE',table_name:'campaign_slots',record_id:slotIds[0],new_values:{outcome,count:slotIds.length}});
    if(failed.length) toast('⛔ لم تُسجَّل '+failed.length+' قنينة لأن رقمها مستخدم مسبقاً بقنينة أخرى ('+failed.slice(0,6).join('، ')+')','error',9000);
    else if(blocked.length) toast('⛔ لا يمكن إرجاع القنينة '+blocked.slice(0,6).join('، ')+': لم تعد بمخزن التالفة (أُتلفت رسمياً أو تغيّرت حالتها)','error',9000);
    else toast('✅ تم تحديث '+slotIds.length+' رقم','success',3500);
    await refreshCampaignSlots();
  }catch(e){ toast('خطأ: '+e.message,'error'); }
  finally{ load(false); }
}

// ================================================================
// إحصائيات الفصل — advanced search: weekly / monthly / half-yearly / yearly / custom range.
// A separation event = the component rows created from a whole-blood bottle (parent_donation_id
// set); their created_at is the moment of separation. The numbers come from those rows only, so
// they never depend on what happened to a component afterwards (a component damaged later still
// counts as produced). "Bottles separated" = distinct parent bottles.
// ================================================================
let _sstKind='month', _sstToken=0;
const _SST_KINDS={week:'أسبوعي',month:'شهري',half:'نصف سنوي',year:'سنوي',custom:'فترة مخصصة'};

function _ymd(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function _parseYmd(s){ const [y,m,d]=String(s).split('-').map(Number); return new Date(y,(m||1)-1,d||1); }

// Pure: the date range of the period that contains the anchor date. Week = Saturday → Friday.
function sepPeriodRange(kind, anchorStr){
  const a=_parseYmd(anchorStr), y=a.getFullYear(), m=a.getMonth(), d=a.getDate();
  let from, to;
  if(kind==='week'){ const back=(a.getDay()+1)%7; from=new Date(y,m,d-back); to=new Date(y,m,d-back+6); }
  else if(kind==='month'){ from=new Date(y,m,1); to=new Date(y,m+1,0); }
  else if(kind==='half'){ const h=m<6?0:6; from=new Date(y,h,1); to=new Date(y,h+6,0); }
  else { from=new Date(y,0,1); to=new Date(y,11,31); }
  return {from,to};
}
// Pure: move the anchor one period back (-1) or forward (+1).
function sepShiftAnchor(kind, anchorStr, dir){
  const a=_parseYmd(anchorStr), y=a.getFullYear(), m=a.getMonth(), d=a.getDate();
  if(kind==='week')  return _ymd(new Date(y,m,d+7*dir));
  if(kind==='month') return _ymd(new Date(y,m+dir,1));
  if(kind==='half')  return _ymd(new Date(y,m+6*dir,1));
  return _ymd(new Date(y+dir,m,1));
}
// Pure: turn component rows into the report numbers.
function sepAggregate(rows, from, to, kind){
  const days=Math.round((to-from)/86400000)+1;
  const mode=(kind==='half'||kind==='year'||(kind==='custom'&&days>92))?'month':'day';
  const key=d=>mode==='month'?_ymd(d).slice(0,7):_ymd(d);
  const buckets=new Map();
  if(mode==='day'){ for(let d=new Date(from); d<=to; d=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1)) buckets.set(key(d),{p:new Set(),c:0}); }
  else { for(let d=new Date(from.getFullYear(),from.getMonth(),1); d<=to; d=new Date(d.getFullYear(),d.getMonth()+1,1)) buckets.set(key(d),{p:new Set(),c:0}); }
  const parents=new Set(), byComp={}, byType={}, byBlood={};
  rows.forEach(r=>{
    const pid=r.parent_donation_id;
    parents.add(pid);
    byComp[r.component_type]=(byComp[r.component_type]||0)+1;
    const bt=r.bottle_type||'—', bl=r.blood_type||'غير محدد';
    (byType[bt]=byType[bt]||new Set()).add(pid);
    (byBlood[bl]=byBlood[bl]||new Set()).add(pid);
    const b=buckets.get(key(new Date(r.created_at)));
    if(b){ b.p.add(pid); b.c++; }
  });
  const cnt=o=>Object.fromEntries(Object.entries(o).map(([k,s])=>[k,s.size]));
  return { days, mode, bottles:parents.size, comps:rows.length, perDay:days?parents.size/days:0,
           byComp, byType:cnt(byType), byBlood:cnt(byBlood),
           timeline:[...buckets.entries()].map(([k,v])=>({key:k,bottles:v.p.size,comps:v.c})) };
}

function sepStatsOpen(){
  _sepSelectedType=null;
  const types=Object.keys(COMPONENT_RULES);
  const comps=[...new Set(Object.values(COMPONENT_RULES).flat().map(c=>c.type))];
  const bts=['A+','A-','B+','B-','O+','O-','AB+','AB-'];
  const opt=a=>a.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('');
  G('sepStatsPane').innerHTML=`
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
      <button class="btn" onclick="loadSeparationBoard()"><i class="ti ti-arrow-right"></i> رجوع</button>
      <div style="font-size:18px;font-weight:800;color:#BE123C">📊 إحصائيات الفصل</div>
    </div>
    <div class="tabs" id="sstKinds" style="flex-wrap:wrap">
      ${Object.entries(_SST_KINDS).map(([k,l])=>`<div class="tab" data-k="${k}" onclick="sepStatsKind('${k}')">${l}</div>`).join('')}
    </div>
    <div id="sstAnchorRow" style="display:flex;gap:6px;align-items:center;margin:10px 0">
      <button class="btn" onclick="sepStatsShift(-1)" title="الفترة السابقة"><i class="ti ti-chevron-right"></i></button>
      <input type="date" id="sstAnchor" class="sinp" style="flex:1" onchange="sepStatsRun()">
      <button class="btn" onclick="sepStatsShift(1)" title="الفترة التالية"><i class="ti ti-chevron-left"></i></button>
    </div>
    <div id="sstCustomRow" style="display:none;gap:6px;margin:10px 0">
      <input type="date" id="sstFrom" class="sinp" style="flex:1" onchange="sepStatsRun()">
      <input type="date" id="sstTo" class="sinp" style="flex:1" onchange="sepStatsRun()">
    </div>
    <div class="fgrid" style="margin-bottom:6px">
      <div class="fgrp"><label>نوع القنينة</label><select id="sstBt" onchange="sepStatsRun()"><option value="">الكل</option>${opt(types)}</select></div>
      <div class="fgrp"><label>المكوّن</label><select id="sstComp" onchange="sepStatsRun()"><option value="">الكل</option>${opt(comps)}</select></div>
      <div class="fgrp"><label>فصيلة الدم</label><select id="sstBl" onchange="sepStatsRun()"><option value="">الكل</option>${opt(bts)}</select></div>
    </div>
    <div id="sstRange" style="font-size:15px;color:#6B7280;margin-bottom:8px"></div>
    <div id="sstResult"></div>`;
  const today=_ymd(new Date());
  G('sstAnchor').value=today; G('sstFrom').value=_ymd(new Date(new Date().getFullYear(),new Date().getMonth(),1)); G('sstTo').value=today;
  _sepShowLevel(3);
  sepStatsKind('month');
}

function sepStatsKind(k){
  _sstKind=k;
  document.querySelectorAll('#sstKinds .tab').forEach(t=>t.classList.toggle('on', t.dataset.k===k));
  G('sstAnchorRow').style.display = k==='custom' ? 'none' : 'flex';
  G('sstCustomRow').style.display = k==='custom' ? 'flex' : 'none';
  sepStatsRun();
}
function sepStatsShift(dir){
  if(_sstKind==='custom') return;
  G('sstAnchor').value=sepShiftAnchor(_sstKind, G('sstAnchor').value||_ymd(new Date()), dir);
  sepStatsRun();
}

async function sepStatsRun(){
  const my=++_sstToken, kind=_sstKind;
  let from, to;
  if(kind==='custom'){
    const f=G('sstFrom').value, t=G('sstTo').value;
    if(!f||!t){ G('sstResult').innerHTML=''; return; }
    from=_parseYmd(f); to=_parseYmd(t);
    if(from>to){ [from,to]=[to,from]; }
  } else {
    const a=G('sstAnchor').value; if(!a){ G('sstResult').innerHTML=''; return; }
    ({from,to}=sepPeriodRange(kind,a));
  }
  const bt=G('sstBt').value, comp=G('sstComp').value, bl=G('sstBl').value;
  G('sstRange').textContent='من '+fd(_ymd(from))+' إلى '+fd(_ymd(to))+(kind==='week'?'  (السبت ← الجمعة)':'');
  G('sstResult').innerHTML='<div class="empty"><i class="ti ti-loader"></i><p>جاري التحميل...</p></div>';
  try{
    const fromIso=new Date(from.getFullYear(),from.getMonth(),from.getDate(),0,0,0,0).toISOString();
    const toIso=new Date(to.getFullYear(),to.getMonth(),to.getDate(),23,59,59,999).toISOString();
    let rows=[];
    for(let p=0;;p+=1000){
      let q=db.from('blood_donations').select('id,parent_donation_id,component_type,bottle_type,blood_type,created_at')
        .not('parent_donation_id','is',null).gte('created_at',fromIso).lte('created_at',toIso)
        .order('created_at').order('id');
      if(bt) q=q.eq('bottle_type',bt);
      if(comp) q=q.eq('component_type',comp);
      if(bl) q=q.eq('blood_type',bl);
      const{data,error}=await q.range(p,p+999);
      if(error) throw error;
      rows=rows.concat(data||[]);
      if((data||[]).length<1000) break;
    }
    if(my!==_sstToken) return;            // a newer selection superseded this one
    const agg=sepAggregate(rows,from,to,kind);
    window._SST_LAST={agg,kind,from:_ymd(from),to:_ymd(to),filters:[bt&&('نوع القنينة: '+bt),comp&&('المكوّن: '+comp),bl&&('الفصيلة: '+bl)].filter(Boolean)};
    G('sstResult').innerHTML=sepStatsHtml(window._SST_LAST);
  }catch(e){
    if(my===_sstToken) G('sstResult').innerHTML='<div class="empty"><i class="ti ti-alert-triangle"></i><p>تعذّر التحميل: '+esc(e.message||'')+'</p></div>';
  }
}

function _sstLabel(agg,key){
  if(agg.mode==='month'){ const [y,m]=key.split('-').map(Number); return new Date(y,m-1,1).toLocaleDateString('ar-IQ-u-nu-latn',{month:'long',year:'numeric'}); }
  return fd(key);
}
function sepStatsHtml(S){
  const a=S.agg;
  if(!a.comps) return '<div class="empty"><i class="ti ti-search-off"></i><p>لا توجد عمليات فصل ضمن هذه الفترة والفلاتر</p></div>';
  const rr=(l,v,st)=>`<div class="rr"${st?` style="${st}"`:''}><span>${esc(l)}</span><span class="rv">${v}</span></div>`;
  const sortRows=o=>Object.entries(o).sort((x,y)=>y[1]-x[1]);
  const max=Math.max(1,...a.timeline.map(t=>t.bottles));
  return `
  <div style="display:flex;gap:8px;margin-bottom:10px">
    <button class="btn" onclick="sepStatsPrint()"><i class="ti ti-printer"></i> طباعة</button>
    <button class="btn" onclick="sepStatsExcel()"><i class="ti ti-file-spreadsheet"></i> Excel</button>
  </div>
  <div class="rpt" id="sstRpt">
    <div class="rpt-hd" style="background:#BE123C;color:#fff;padding:14px 18px">
      <div class="rh-t" style="font-size:16px;font-weight:700">إحصائيات الفصل — ${_SST_KINDS[S.kind]}</div>
      <div class="rh-s" style="font-size:13px;opacity:.85;margin-top:2px">${fd(S.from)} إلى ${fd(S.to)}${S.filters.length?' — '+esc(S.filters.join(' | ')):''}</div>
    </div>
    <div class="rpt-body">
      <div class="rs"><div class="rs-t">الملخص</div>
        ${rr('قناني دم كامل مفصولة',fnum(a.bottles))}
        ${rr('مكوّنات ناتجة',fnum(a.comps))}
        ${rr('المعدل اليومي (قنينة/يوم)',a.perDay.toLocaleString('en',{maximumFractionDigits:1}))}
      </div>
      <div class="rs"><div class="rs-t">حسب المكوّن</div>${sortRows(a.byComp).map(([k,v])=>rr(k,fnum(v))).join('')}</div>
      <div class="rs"><div class="rs-t">حسب نوع القنينة (قناني مفصولة)</div>${sortRows(a.byType).map(([k,v])=>rr(k,fnum(v))).join('')}</div>
      <div class="rs"><div class="rs-t">حسب فصيلة الدم (قناني مفصولة)</div>${sortRows(a.byBlood).map(([k,v])=>rr(k,fnum(v))).join('')}</div>
      <div class="rs"><div class="rs-t">التوزيع الزمني — ${a.mode==='month'?'شهرياً':'يومياً'} (قناني / مكوّنات)</div>
        ${a.timeline.map(t=>`<div class="rr" style="align-items:center;gap:8px"><span style="min-width:110px">${esc(_sstLabel(a,t.key))}</span>
          <span style="flex:1;height:8px;background:#f1f1f1;border-radius:4px;overflow:hidden"><span style="display:block;height:100%;width:${(t.bottles/max*100).toFixed(0)}%;background:#BE123C"></span></span>
          <span class="rv" style="min-width:70px;text-align:left">${fnum(t.bottles)} / ${fnum(t.comps)}</span></div>`).join('')}
      </div>
    </div>
  </div>`;
}

function sepStatsPrint(){
  const el=G('sstRpt'); if(!el){ toast('لا يوجد تقرير للطباعة','warning'); return; }
  printHtmlDocument(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>إحصائيات الفصل</title>
  <style>body{font-family:'Segoe UI',Arial,sans-serif;direction:rtl;padding:20px;background:#fff;font-size:15px}
  .rpt{border:1px solid #ddd;border-radius:8px;overflow:hidden}.rpt-body{padding:14px}.rs{margin-bottom:12px}
  .rs-t{font-size:14px;font-weight:700;color:#757575;padding:4px 8px;background:#fafafa;border-radius:4px;margin-bottom:6px}
  .rr{display:flex;justify-content:space-between;padding:4px 8px;border-bottom:1px solid #f5f5f5;font-size:14px}.rv{font-weight:700;color:#BE123C}
  @media print{@page{margin:10mm}}</style></head><body>${el.outerHTML}</body></html>`);
}
function sepStatsExcel(){
  const S=window._SST_LAST; if(!S||!S.agg.comps){ toast('لا يوجد تقرير للتصدير','warning'); return; }
  const a=S.agg;
  const sec=(t,rows)=>`<tr><td colspan="3" style="background:#1E293B;color:#fff;font-weight:bold;padding:6px">${esc(t)}</td></tr>`+
    rows.map(r=>`<tr>${r.map(c=>`<td>${esc(String(c))}</td>`).join('')}</tr>`).join('')+`<tr><td>&nbsp;</td></tr>`;
  const cnt=o=>Object.entries(o).sort((x,y)=>y[1]-x[1]);
  const body=`<tr><td colspan="3" style="background:#BE123C;color:#fff;font-weight:bold;padding:8px">إحصائيات الفصل — ${_SST_KINDS[S.kind]} (${S.from} إلى ${S.to})${S.filters.length?' — '+esc(S.filters.join(' | ')):''}</td></tr><tr><td>&nbsp;</td></tr>`+
    sec('الملخص',[['قناني دم كامل مفصولة',a.bottles],['مكوّنات ناتجة',a.comps],['المعدل اليومي (قنينة/يوم)',a.perDay.toFixed(1)]])+
    sec('حسب المكوّن',cnt(a.byComp))+sec('حسب نوع القنينة (قناني مفصولة)',cnt(a.byType))+sec('حسب فصيلة الدم (قناني مفصولة)',cnt(a.byBlood))+
    sec('التوزيع الزمني ('+(a.mode==='month'?'شهرياً':'يومياً')+')',a.timeline.map(t=>[_sstLabel(a,t.key),t.bottles,t.comps]));
  const blob=new Blob(['\uFEFF<html dir="rtl"><head><meta charset="UTF-8"></head><body><table border="1">'+body+'</table></body></html>'],{type:'application/vnd.ms-excel;charset=utf-8'});
  const l=document.createElement('a'); l.href=URL.createObjectURL(blob); l.download='إحصائيات_الفصل_'+S.from+'_'+S.to+'.xls'; l.click();
  toast('✅ تم تصدير التقرير لإكسل','success',3500);
}
