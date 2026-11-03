// ================================================================
// التجهيز by hand — تجهيز قناني الرصيد لمريض/مستشفى بإدخال أرقام القناني يدوياً.
// اسم المريض والمستشفى ونوع التعويض مرة واحدة؛ كل صف = رقم قنينة + مكوّن موجود فعلاً بالرصيد.
// التجهيز يتم بعملية واحدة (RPC dispatch_bottles): إما تُجهَّز كل القناني أو لا شيء.
// ================================================================
const SH_LABEL = { 'دم كامل':'دم', 'دم مضغوط':'دم مضغوط', 'بلازما':'بلازما', 'صفائح دموية':'صفيحات دموية', 'بروتين بارد':'Cryo' };
const SH_ORDER = ['دم كامل','دم مضغوط','صفائح دموية','بلازما','بروتين بارد'];
let _shRows = [], _shSeq = 0, _shBusy = false;
const shEsc = s => (typeof esc==='function' ? esc(s) : String(s==null?'':s));

function shEnsureModal(){
  if(G('supplyHandModal')) return;
  const hosp = [...(G('rc-hosp')?.options||[])].filter(o=>o.value && o.value!=='أخرى').map(o=>o.value);
  const m = document.createElement('div');
  m.className='overlay'; m.id='supplyHandModal';
  m.innerHTML = `<div class="modal" style="width:min(900px,97vw);max-height:94vh">
    <div class="modal-title"><i class="ti ti-hand-grab"></i> تجهيز by hand</div>
    <div class="modal-body">
      <div class="fgrid" style="grid-template-columns:repeat(3,minmax(0,1fr))">
        <div class="fgrp"><label>اسم المريض *</label><input type="text" id="sh-pat" placeholder="اسم المريض"></div>
        <div class="fgrp"><label>المستشفى *</label>
          <select id="sh-hosp" onchange="G('sh-hosp-o').style.display=this.value==='أخرى'?'block':'none'"><option value="">— اختر —</option>${hosp.map(h=>`<option value="${shEsc(h)}">${shEsc(h)}</option>`).join('')}<option value="أخرى">أخرى</option></select>
          <input type="text" id="sh-hosp-o" placeholder="اكتب اسم المستشفى" style="display:none;margin-top:5px"></div>
        <div class="fgrp"><label>نوع التعويض *</label>
          <select id="sh-comp" onchange="G('sh-comp-o').style.display=this.value==='أخرى'?'block':'none'"><option value="">— اختر —</option><option value="عوض">عوض</option><option value="بثمن">بثمن</option><option value="مجاني (الإدارة)">مجاني (الإدارة)</option><option value="أخرى">أخرى</option></select>
          <input type="text" id="sh-comp-o" placeholder="اكتب نوع التعويض" style="display:none;margin-top:5px"></div>
      </div>
      <div id="sh-rows" style="margin-top:12px"></div>
      <button class="btn" onclick="shAddRow()" style="margin-top:6px"><i class="ti ti-plus"></i> إضافة تجهيز</button>
      <div id="sh-sum" style="margin-top:12px;padding:10px 12px;border:1px solid #BBF7D0;background:#F0FDF4;border-radius:10px;font-size:15px;line-height:1.9;display:none"></div>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="G('supplyHandModal').classList.remove('on')"><i class="ti ti-x"></i> إلغاء</button>
      <button class="btn btn-p" id="sh-go" onclick="shSubmit()"><i class="ti ti-check"></i> تجهيز</button>
    </div></div>`;
  document.body.appendChild(m);
}

function shOpen(){
  shEnsureModal();
  ['sh-pat','sh-hosp-o','sh-comp-o'].forEach(i=>G(i).value='');
  G('sh-hosp').value=''; G('sh-comp').value=''; G('sh-hosp-o').style.display='none'; G('sh-comp-o').style.display='none';
  _shRows=[]; G('sh-rows').innerHTML=''; shAddRow(true);
  shSummary();
  G('supplyHandModal').classList.add('on');
  setTimeout(()=>G('sh-pat').focus(),50);
}

function shAddRow(noFocus){
  const id=++_shSeq; _shRows.push({id, num:'', opts:[], pick:'', msg:''});
  const d=document.createElement('div'); d.id='shr-'+id;
  d.style.cssText='display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap;padding:8px;border:1px solid #E5E7EB;border-radius:10px;margin-bottom:8px;background:#fff';
  d.innerHTML=`<div class="fgrp" style="width:130px"><label>رقم القنينة</label><input type="text" inputmode="numeric" id="shn-${id}" placeholder="رقم" oninput="this.value=normDigits(this.value).replace(/[^0-9]/g,'')" onchange="shLookup(${id})" onkeydown="if(event.key==='Enter'){event.preventDefault();shLookup(${id},true)}"></div>
    <div class="fgrp" style="flex:1;min-width:150px"><label>النوع / الفصيلة</label><div id="shi-${id}" style="padding:9px 4px;font-weight:700;color:#374151">—</div></div>
    <div class="fgrp" style="width:200px"><label>نوع التجهيز</label><select id="shs-${id}" onchange="shPick(${id})" disabled><option value="">—</option></select></div>
    <button class="btn" title="حذف الصف" onclick="shDelRow(${id})" style="margin-top:22px;color:#B91C1C"><i class="ti ti-x"></i></button>
    <div id="shm-${id}" style="flex-basis:100%;font-size:14px;font-weight:600"></div>`;
  G('sh-rows').appendChild(d);
  if(!noFocus) G('shn-'+id).focus();
}
function shDelRow(id){
  if(_shRows.length<=1){ const r=_shRows[0]; G('shn-'+r.id).value=''; shLookup(r.id); return; }
  _shRows=_shRows.filter(r=>r.id!==id); G('shr-'+id)?.remove(); shSummary();
}

async function shLookup(id,enter){
  const r=_shRows.find(x=>x.id===id); if(!r) return;
  const num=parseInt(G('shn-'+id).value);
  if(num && num===r.looked){ if(enter){ if(r.pick) shAddRowIfLast(id); else G('shs-'+id)?.focus(); } return; }
  r.looked=num||0;
  r.num=num||''; r.opts=[]; r.pick='';
  const sel=G('shs-'+id), info=G('shi-'+id), msg=G('shm-'+id);
  sel.innerHTML='<option value="">—</option>'; sel.disabled=true; info.textContent='—'; msg.textContent=''; msg.style.color='';
  if(!num){ shSummary(); return; }
  const{data,error}=await db.from('blood_donations')
    .select('id,bottle_number,bottle_type,blood_type,component_type,status,expiry_date,is_deleted')
    .eq('bottle_number',num).eq('is_deleted',false);
  if(error){ msg.style.color='#B91C1C'; msg.textContent='تعذر البحث: '+error.message; return; }
  const today=new Date().toISOString().split('T')[0];
  const rows=data||[];
  if(!rows.length){ msg.style.color='#B91C1C'; msg.textContent='⛔ القنينة '+num+' غير موجودة'; shSummary(); return; }
  const ready=rows.filter(x=>x.status==='in_stock' && (!x.expiry_date || x.expiry_date>=today));
  if(!ready.length){
    const expired=rows.some(x=>x.status==='in_stock');
    const st=expired ? 'منتهية الصلاحية' : [...new Set(rows.map(x=>AUDIT_STATUS_LABELS[x.status]||x.status))].join('، ');
    msg.style.color='#B91C1C'; msg.textContent='⛔ القنينة '+num+' غير جاهزة للتجهيز — حالتها: '+st; shSummary(); return;
  }
  ready.sort((a,b)=>SH_ORDER.indexOf(a.component_type||'دم كامل')-SH_ORDER.indexOf(b.component_type||'دم كامل'));
  r.opts=ready;
  info.textContent=(ready[0].bottle_type||'—')+' — '+(bbBt(ready[0].blood_type,ready.every(x=>bbNoSign(x.component_type))?'بلازما':'')||'—');
  sel.innerHTML='<option value="">— اختر —</option>'+ready.map(x=>`<option value="${x.id}">${shEsc(SH_LABEL[x.component_type||'دم كامل']||x.component_type)}</option>`).join('');
  sel.disabled=false;
  shRefreshOptions();
  if(ready.length===1){ const free=[...sel.options].find(o=>o.value && !o.disabled); if(free){ sel.value=free.value; shPick(id); } }
  if(enter){ if(!sel.value) sel.focus(); else shAddRowIfLast(id); }
  shSummary();
}
function shAddRowIfLast(id){ if(_shRows[_shRows.length-1].id===id){ shAddRow(); } else { const i=_shRows.findIndex(x=>x.id===id); G('shn-'+_shRows[i+1].id)?.focus(); } }

// a component picked in one row is unavailable in the others (same bottle can't be dispatched twice)
function shRefreshOptions(){
  const taken=new Set(_shRows.map(r=>r.pick).filter(Boolean));
  _shRows.forEach(r=>{ const sel=G('shs-'+r.id); if(!sel) return; [...sel.options].forEach(o=>{ if(o.value) o.disabled = taken.has(o.value) && o.value!==r.pick; }); });
}
function shPick(id){
  const r=_shRows.find(x=>x.id===id); r.pick=G('shs-'+id).value;
  shRefreshOptions(); shSummary();
}

function shSummary(){
  const box=G('sh-sum'); if(!box) return;
  const picked=_shRows.map(r=>r.opts.find(o=>o.id===r.pick)).filter(Boolean);
  if(!picked.length){ box.style.display='none'; return; }
  const by={}; picked.forEach(o=>{ const c=o.component_type||'دم كامل'; (by[c]=by[c]||{}); const k=bbBt(o.blood_type,c)||'—'; by[c][k]=(by[c][k]||0)+1; });
  box.style.display='block';
  box.innerHTML='<b>الملخص ('+picked.length+' قنينة):</b><br>'+SH_ORDER.filter(c=>by[c]).map(c=>
    '• '+shEsc(SH_LABEL[c])+': '+Object.entries(by[c]).map(([bt,n])=>shEsc(bt)+' ← '+n).join('، ')).join('<br>');
}

async function shSubmit(){
  if(_shBusy) return;
  const pat=G('sh-pat').value.trim();
  let hosp=G('sh-hosp').value; if(hosp==='أخرى') hosp=G('sh-hosp-o').value.trim();
  let comp=G('sh-comp').value, note='';
  if(comp==='أخرى'){ note=G('sh-comp-o').value.trim(); if(!note){ toast('اكتب نوع التعويض','error'); G('sh-comp-o').focus(); return; } }
  if(!pat){ toast('اكتب اسم المريض','error'); G('sh-pat').focus(); return; }
  if(!hosp){ toast('اختر المستشفى','error'); return; }
  if(!comp){ toast('اختر نوع التعويض','error'); return; }
  const empty=_shRows.find(r=>!r.pick && (r.num || _shRows.length===1));
  if(empty){ toast('أكمل الصف: '+(empty.num?'اختر نوع التجهيز للقنينة '+empty.num:'اكتب رقم القنينة'),'error'); return; }
  const ids=_shRows.map(r=>r.pick).filter(Boolean);
  if(!ids.length){ toast('أضف قنينة واحدة على الأقل','error'); return; }
  if(!IS_ONLINE){ toast('التجهيز يحتاج اتصالاً بالإنترنت','error'); return; }
  if(!confirm('تأكيد تجهيز '+ids.length+' قنينة للمريض «'+pat+'»؟ ستُسحب من الرصيد.')) return;
  _shBusy=true; load(true);
  try{
    const{data,error}=await db.rpc('dispatch_bottles',{p_ids:ids,p_patient:pat,p_hospital:hosp,p_comp:comp,p_note:note});
    if(error) throw error;
    try{ await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'UPDATE',table_name:'blood_donations',record_id:ids[0],new_values:{status:'dispatched',dispatch_count:ids.length,patient:pat,hospital:hosp,compensation:comp+(note?': '+note:'')}}); }catch(e){}
    toast('✅ تم تجهيز '+ids.length+' قنينة وسُحبت من الرصيد','success',5000);
    G('supplyHandModal').classList.remove('on');
    if(typeof _supplyRefreshCurrentLevel==='function') await _supplyRefreshCurrentLevel();
  }catch(e){ toast('⛔ '+(e.message||e),'error',8000); }
  finally{ _shBusy=false; load(false); }
}
