// ================================================================
// المخزن — مواد المصرف (ككل): الاسم، العدد، الإكسباير. إضافة مواد، سحب مواد، وأرشيف بفترة محددة.
//  • كل إضافة = «دفعة» لها إكسباير يُدخَل يدوياً (اختياري). السحب يأخذ من أقرب إكسباير أولاً (ولا يأخذ المنتهي تلقائياً).
//  • من نافذة «الدفعات» يمكن السحب من دفعة محددة (مثلاً لإتلاف دفعة منتهية).
// الجداول: store_items, store_lots, store_moves — والدوال: store_add / store_withdraw (SQL المخزن).
// ================================================================
let _stTab='items', _stGrp='material', _stItems=[], _stLots=[], _stQ='';
let _stArcKind='material', _stKind='month', _stAnchor=null, _stFrom='', _stTo='', _stItemF='', _stArc=null;
const _ST_KINDS=[['day','يومي'],['week','أسبوعي'],['month','شهري'],['half','نصف سنوي'],['year','سنوي'],['custom','مخصص']];

function stCan(){ return UPROF?.role==='admin' || (typeof hasPermission==='function' && hasPermission('store')); }
function _stYmd(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function _stParse(s){ const [y,m,d]=String(s).split('-').map(Number); return new Date(y,(m||1)-1,d||1); }
function stRange(kind,anchor){
  const a=_stParse(anchor), y=a.getFullYear(), m=a.getMonth(), d=a.getDate(); let f,t;
  if(kind==='day'){ f=new Date(y,m,d); t=f; }
  else if(kind==='week'){ const b=(a.getDay()+1)%7; f=new Date(y,m,d-b); t=new Date(y,m,d-b+6); }
  else if(kind==='month'){ f=new Date(y,m,1); t=new Date(y,m+1,0); }
  else if(kind==='half'){ const h=m<6?0:6; f=new Date(y,h,1); t=new Date(y,h+6,0); }
  else { f=new Date(y,0,1); t=new Date(y,11,31); }
  return {from:_stYmd(f), to:_stYmd(t)};
}
function stShift(kind,anchor,dir){
  const a=_stParse(anchor), y=a.getFullYear(), m=a.getMonth(), d=a.getDate();
  if(kind==='day') return _stYmd(new Date(y,m,d+dir));
  if(kind==='week') return _stYmd(new Date(y,m,d+7*dir));
  if(kind==='month') return _stYmd(new Date(y,m+dir,1));
  if(kind==='half') return _stYmd(new Date(y,m+6*dir,1));
  return _stYmd(new Date(y+dir,m,1));
}
const _stToday=()=>_stYmd(new Date());
const _stN=id=>{ const v=parseInt(normDigits(G(id).value).replace(/[^0-9]/g,'')); return Number.isInteger(v)?v:NaN; };
function _stExpTag(ymd){
  if(!ymd) return '<span style="color:#9CA3AF">—</span>';
  const t=new Date(); t.setHours(0,0,0,0); const days=Math.round((_stParse(ymd)-t)/86400000);
  const c = days<0?'#B91C1C':days<=30?'#B45309':'#166534';
  return `<span style="color:${c};font-weight:700">${fd(ymd)}</span><div style="font-size:12.5px;color:${c}">${days<0?'منتهي':days===0?'ينتهي اليوم':'بعد '+days+' يوم'}</div>`;
}

async function loadStore(){
  if(!stCan()){ G('storeBody').innerHTML='<div class="empty"><p>⛔ هذا القسم لمن لديه صلاحية المخزن</p></div>'; return; }
  return stTab(_stTab);
}
function stTab(t){
  if(t==='archive'&&_stTab!=='archive') _stArcKind=_stGrp==='device'?'device':'material';
  _stTab=t; if(t==='items') _stGrp='material'; else if(t==='devices') _stGrp='device';
  document.querySelectorAll('#stTabs .tab').forEach(x=>x.classList.toggle('on',x.dataset.t===t));
  _stQ='';
  return t==='archive' ? stRenderArchive() : stRenderItems();
}
async function stLoad(){
  const it=await db.from('store_items').select('id,name,kind').order('name'); if(it.error) throw it.error;
  const lt=await bbFetchAll(()=>db.from('store_lots').select('id,item_id,qty_left,expiry_date,received_date,qty_in,note').gt('qty_left',0));
  _stItems=it.data||[]; _stLots=lt||[];
}
function _stSummary(){
  return _stItems.filter(i=>(i.kind||'material')===_stGrp).map(i=>{
    const lots=_stLots.filter(l=>l.item_id===i.id);
    const qty=lots.reduce((s,l)=>s+l.qty_left,0);
    const exps=lots.map(l=>l.expiry_date).filter(Boolean).sort();
    return {...i,qty,lots,exp:exps[0]||null};
  });
}
async function stRenderItems(){
  const B=G('storeBody'); B.innerHTML='<div class="empty"><p>جاري التحميل...</p></div>';
  try{ await stLoad(); }catch(e){ B.innerHTML='<div style="color:#B91C1C;font-weight:700">تعذّر التحميل: '+esc(e.message||e)+'<br><small>تأكد من تشغيل SQL المخزن في Supabase</small></div>'; return; }
  stDrawItems();
}
function stDrawItems(){
  const B=G('storeBody'); const q=_stQ.trim().toLowerCase();
  const rows=_stSummary().filter(r=>!q||r.name.toLowerCase().includes(q));
  B.innerHTML=`<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
      <button class="btn btn-p" onclick="stAddOpen()"><i class="ti ti-plus"></i> ${_stGrp==='device'?'إضافة أجهزة':'إضافة مواد'}</button>
      <button class="btn" style="border-color:#7F1D1D;color:#7F1D1D" onclick="stOutOpen()"><i class="ti ti-minus"></i> ${_stGrp==='device'?'سحب أجهزة':'سحب مواد'}</button>
      ${_stGrp==='device'?`<button class="btn" style="border-color:#92400E;color:#92400E" onclick="stOutOpen(null,null,'scrap')"><i class="ti ti-trash"></i> إتلاف أجهزة</button>`:''}
      <input id="stSearch" placeholder="🔍 ${_stGrp==='device'?'بحث باسم الجهاز':'بحث باسم المادة'}" value="${esc(_stQ)}" oninput="_stQ=this.value;stDrawItems();setTimeout(()=>{const i=G('stSearch');if(i){i.focus();i.setSelectionRange(99,99)}},0)" style="flex:1;min-width:160px;padding:9px;border:1.5px solid #E5E7EB;border-radius:10px;font-size:16px"></div>`
   +(rows.length?`<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:16px"><thead><tr style="background:#F3F4F6"><th style="padding:8px;text-align:right">${_stGrp==='device'?'الجهاز':'المادة'}</th><th>العدد</th>${_stGrp==='device'?'':'<th>أقرب إكسباير</th>'}<th></th></tr></thead><tbody>`
    +rows.map(r=>`<tr style="border-top:1px solid #F1F5F9;text-align:center"><td style="padding:8px;text-align:right;font-weight:800">${esc(r.name)}</td><td style="font-size:20px;font-weight:900;color:${r.qty>0?'#166534':'#B91C1C'}">${fnum(r.qty)}</td>${_stGrp==='device'?'':`<td>${_stExpTag(r.exp)}</td>`}
      <td style="white-space:nowrap"><button class="btn" style="padding:6px 9px" onclick="stAddOpen('${r.id}')" title="إضافة"><i class="ti ti-plus"></i></button>
      <button class="btn" style="padding:6px 9px;color:#7F1D1D;border-color:#7F1D1D" onclick="stOutOpen('${r.id}')" title="سحب"><i class="ti ti-minus"></i></button>
      ${_stGrp==='device'?`<button class="btn" style="padding:6px 9px;color:#92400E;border-color:#92400E" onclick="stOutOpen('${r.id}',null,'scrap')" title="إتلاف"><i class="ti ti-trash"></i></button>`:`<button class="btn" style="padding:6px 9px" onclick="stLots('${r.id}')" title="الدفعات"><i class="ti ti-list-details"></i></button>`}</td></tr>`).join('')+'</tbody></table></div>'
    :'<div class="empty"><i class="ti ti-building-warehouse"></i><p>'+(q?'لا نتائج':(_stGrp==='device'?'لا توجد أجهزة بعد — اضغط «إضافة أجهزة»':'لا توجد مواد بعد — اضغط «إضافة مواد»'))+'</p></div>');
}
function stForm(title,inner,okFn,okLabel){
  let f=G('stFormOv'); if(f) f.remove();
  f=document.createElement('div'); f.className='overlay on'; f.id='stFormOv'; f.style.zIndex=9000;
  f.innerHTML=`<div class="modal" style="width:min(460px,96vw)"><div class="modal-title">${title}</div><div class="modal-body">${inner}</div><div class="modal-foot"><button class="btn" onclick="G('stFormOv').remove()">إلغاء</button><button class="btn btn-p" onclick="${okFn}"><i class="ti ti-device-floppy"></i> ${okLabel||'حفظ'}</button></div></div>`;
  document.body.appendChild(f); const i=f.querySelector('input,select'); if(i&&i.tagName==='INPUT'&&!i.readOnly) setTimeout(()=>i.focus(),60);
}
const _stNumIn=(id,label)=>`<div class="fgrp"><label>${label}</label><input type="text" inputmode="numeric" id="${id}" oninput="this.value=normDigits(this.value).replace(/[^0-9]/g,'')"></div>`;
const _stByName=()=>UPROF?.full_name||'';

function stAddOpen(itemId){
  const it=_stItems.find(x=>x.id===itemId), dev=_stGrp==='device';
  stForm('<i class="ti ti-plus"></i> '+(dev?'إضافة أجهزة':'إضافة مواد'),
    `<div class="fgrp"><label>${dev?'اسم الجهاز *':'اسم المادة *'}</label><input type="text" id="st-name" list="st-names" value="${esc(it?.name||'')}" ${it?'readonly':''} autocomplete="off" placeholder="${dev?'اختر جهازاً موجوداً أو اكتب اسم جهاز جديد':'اختر مادة موجودة أو اكتب اسم مادة جديدة'}"><datalist id="st-names">${_stItems.filter(i=>(i.kind||'material')===_stGrp).map(i=>`<option value="${esc(i.name)}">`).join('')}</datalist></div>`
    +_stNumIn('st-qty','العدد المضاف *')
    +`${dev?'':'<div class="fgrp"><label>الإكسباير (إن وُجد)</label><input type="date" id="st-exp"></div>'}
      <div class="fgrp"><label>تاريخ الإضافة</label><input type="date" id="st-date" value="${_stToday()}"></div>
      <div class="fgrp"><label>ملاحظة (اختياري)</label><input type="text" id="st-note" placeholder="${dev?'مثلاً: رقم تسلسلي أو مصدر الجهاز':'مثلاً: وصلت من المخزن المركزي'}"></div>`,'stAddSave()');
}
async function stAddSave(){
  if(!stCan()) return; if(!IS_ONLINE){ toast('يحتاج اتصالاً بالإنترنت','warning'); return; }
  const name=(G('st-name').value||'').trim().replace(/\s+/g,' '), qty=_stN('st-qty'), exp=G('st-exp')?.value||null, date=G('st-date').value||_stToday(), note=(G('st-note').value||'').trim()||null;
  if(!name){ toast('اكتب اسم المادة','error'); return; }
  if(!Number.isInteger(qty)||qty<1){ toast('اكتب عدداً صحيحاً أكبر من صفر','error'); return; }
  load(true);
  try{
    let item=_stItems.find(i=>i.name.toLowerCase()===name.toLowerCase()&&(i.kind||'material')===_stGrp);
    if(!item){
      const r=await db.from('store_items').insert({name,kind:_stGrp}).select('id,name,kind').single();
      if(r.error) throw r.error; item=r.data;
    }
    const r=await db.rpc('store_add',{p_item:item.id,p_qty:qty,p_expiry:exp,p_date:date,p_note:note,p_by:_stByName()});
    if(r.error) throw r.error;
    G('stFormOv')?.remove(); toast('✅ أُضيف '+fnum(qty)+' من «'+name+'»','success',3500);
    await stRenderItems();
  }catch(e){ toast(/duplicate|unique/i.test(e.message||'')?'⛔ هذا الاسم موجود مسبقاً (ربما بقسم المواد أو الأجهزة الآخر)':('خطأ: '+(e.message||e)),'error',8000); }
  finally{ load(false); }
}

let _stOutMode='out';
function stOutOpen(itemId,lotId,mode){
  _stOutMode = mode==='scrap' ? 'scrap' : 'out';
  const dev=_stGrp==='device', scrap=_stOutMode==='scrap', rows=_stSummary().filter(r=>r.qty>0);
  if(!rows.length){ toast(dev?'لا توجد أجهزة بالمخزن':'لا توجد مواد بالمخزن','warning'); return; }
  const lot=lotId?_stLots.find(l=>l.id===lotId):null;
  const sel=itemId||(lot&&lot.item_id)||'';
  stForm(scrap?'<i class="ti ti-trash"></i> إتلاف أجهزة':'<i class="ti ti-minus"></i> '+(dev?'سحب أجهزة':'سحب مواد'),
    `<div class="fgrp"><label>${dev?'الجهاز *':'المادة *'}</label><select id="st-item" ${lot?'disabled':''} onchange="stOutInfo()">${rows.map(r=>`<option value="${r.id}" ${r.id===sel?'selected':''}>${esc(r.name)} — المتوفر ${fnum(r.qty)}</option>`).join('')}</select></div>
     ${lot?`<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:10px;padding:8px;margin-bottom:8px;font-size:14.5px">السحب من دفعة محددة: المتبقي <b>${fnum(lot.qty_left)}</b> — إكسباير ${lot.expiry_date?fd(lot.expiry_date):'—'}<input type="hidden" id="st-lot" value="${lot.id}"></div>`:'<div id="st-info" style="font-size:14px;color:#6B7280;margin-bottom:8px"></div>'}`
    +_stNumIn('st-qty',scrap?'العدد المُتلَف *':'العدد المسحوب *')
    +`<div class="fgrp"><label>${scrap?'تاريخ الإتلاف':'تاريخ السحب'}</label><input type="date" id="st-date" value="${_stToday()}"></div>
      <div class="fgrp"><label>${scrap?'سبب الإتلاف *':'ملاحظة (لمن / السبب)'}</label><input type="text" id="st-note" placeholder="${dev?'مثلاً: إلى قسم الفحص / للصيانة':'مثلاً: لوحدة الفيروسات'}"></div>`,'stOutSave()',scrap?'إتلاف':'سحب');
  stOutInfo();
}
function stOutInfo(){
  const el=G('st-info'); if(!el) return; const r=_stSummary().find(x=>x.id===G('st-item').value);
  el.innerHTML = r ? (_stGrp==='device'?'':'يُسحب من أقرب إكسباير أولاً (المنتهي لا يُسحب تلقائياً). أقرب إكسباير: '+(r.exp?fd(r.exp):'—')) : '';
}
async function stOutSave(){
  if(!stCan()) return; if(!IS_ONLINE){ toast('يحتاج اتصالاً بالإنترنت','warning'); return; }
  const scrap=_stOutMode==='scrap';
  const item=G('st-item').value, qty=_stN('st-qty'), date=G('st-date').value||_stToday(), note=(G('st-note').value||'').trim()||null, lot=G('st-lot')?.value||null;
  if(!Number.isInteger(qty)||qty<1){ toast('اكتب عدداً صحيحاً أكبر من صفر','error'); return; }
  if(scrap && !note){ toast('اكتب سبب الإتلاف','error'); return; }
  load(true);
  try{
    const r=await db.rpc('store_withdraw',{p_item:item,p_qty:qty,p_date:date,p_note:note,p_by:_stByName(),p_lot:lot,p_reason:scrap?'scrap':null});
    if(r.error) throw r.error;
    G('stFormOv')?.remove(); G('stLotsOv')?.remove(); toast(scrap?'✅ تم إتلاف '+fnum(qty):'✅ تم سحب '+fnum(qty),'success',3500);
    await stRenderItems();
  }catch(e){ toast(/INSUFFICIENT/i.test(e.message||'')?'⛔ الرصيد غير كافٍ (المنتهي الصلاحية لا يُسحب تلقائياً — اسحب منه من «الدفعات»)':('خطأ: '+(e.message||e)),'error',8000); }
  finally{ load(false); }
}
function stLots(itemId){
  const r=_stSummary().find(x=>x.id===itemId); if(!r) return;
  let o=G('stLotsOv'); if(o) o.remove();
  o=document.createElement('div'); o.className='overlay on'; o.id='stLotsOv'; o.style.zIndex=8900;
  const lots=r.lots.slice().sort((a,b)=>String(a.expiry_date||'9999').localeCompare(String(b.expiry_date||'9999')));
  o.innerHTML=`<div class="modal" style="width:min(560px,97vw);max-height:90vh;display:flex;flex-direction:column"><div class="modal-title">${esc(r.name)} — الدفعات (${fnum(r.qty)})</div><div class="modal-body" style="overflow:auto;flex:1">
    ${lots.length?`<table style="width:100%;border-collapse:collapse;font-size:15px"><thead><tr style="background:#F3F4F6"><th style="padding:6px">المتبقي</th><th>الإكسباير</th><th>تاريخ الإضافة</th><th>ملاحظة</th><th></th></tr></thead><tbody>`
     +lots.map(l=>`<tr style="border-top:1px solid #F1F5F9;text-align:center"><td style="padding:6px;font-weight:800">${fnum(l.qty_left)}<div style="font-size:12px;color:#6B7280;font-weight:500">من ${fnum(l.qty_in)}</div></td><td>${_stExpTag(l.expiry_date)}</td><td>${fd(l.received_date)}</td><td style="font-size:13px;color:#475569">${esc(l.note||'')}</td><td><button class="btn" style="padding:5px 8px;color:#7F1D1D;border-color:#7F1D1D" onclick="G('stLotsOv').remove();stOutOpen('${r.id}','${l.id}')"><i class="ti ti-minus"></i> سحب</button></td></tr>`).join('')+'</tbody></table>':'<div class="empty"><p>لا توجد دفعات</p></div>'}
  </div><div class="modal-foot"><button class="btn" onclick="G('stLotsOv').remove()">إغلاق</button></div></div>`;
  document.body.appendChild(o);
}

// ── الأرشيف: كم أضفت وكم سحبت بفترة تحددها ───────────────────────────────────────────────
function stRangeNow(){
  if(_stKind==='custom') return {from:_stFrom,to:_stTo,open:!(_stFrom&&_stTo)};
  if(!_stAnchor) _stAnchor=_stToday();
  return stRange(_stKind,_stAnchor);
}
async function stRenderArchive(){
  const B=G('storeBody'); const r=stRangeNow();
  const chips=_ST_KINDS.map(([k,l])=>`<div class="ss-k ${k===_stKind?'on':''}" style="padding:6px 12px;border-radius:20px;background:${k===_stKind?'#FCE7F3':'#F3F4F6'};color:${k===_stKind?'#9D174D':'inherit'};cursor:pointer;font-weight:700;font-size:14px" onclick="_stKind='${k}';_stAnchor=_stToday();stRenderArchive()">${l}</div>`).join('');
  const nav=_stKind==='custom'
    ?`<div class="fgrp" style="margin:0"><label>من</label><input type="date" id="st-from" value="${_stFrom}" onchange="stCustom()"></div><div class="fgrp" style="margin:0"><label>إلى</label><input type="date" id="st-to" value="${_stTo}" onchange="stCustom()"></div>`
    :`<button class="btn" onclick="_stAnchor=stShift(_stKind,_stAnchor,-1);stRenderArchive()">›</button><b style="min-width:170px;text-align:center">${r.from===r.to?fd(r.from):fd(r.from)+' ← '+fd(r.to)}</b><button class="btn" onclick="_stAnchor=stShift(_stKind,_stAnchor,1);stRenderArchive()">‹</button>`;
  B.innerHTML=`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">${chips}</div><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">${nav}</div><div id="stArcBody"></div>`;
  if(r.open){ G('stArcBody').innerHTML='<div class="empty"><i class="ti ti-calendar"></i><p>اختر تاريخ البداية والنهاية</p></div>'; return; }
  G('stArcBody').innerHTML='<div class="empty"><p>جاري التحميل...</p></div>';
  try{
    const mv=await bbFetchAll(()=>db.from('store_moves').select('id,item_id,kind,reason,qty,move_date,expiry_date,note,created_by_name,created_at,store_items(name,kind)').gte('move_date',r.from).lte('move_date',r.to));
    _stArc={rows:mv,range:r}; stDrawArchive();
  }catch(e){ G('stArcBody').innerHTML='<div style="color:#B91C1C;font-weight:700">تعذّر التحميل: '+esc(e.message||e)+'</div>'; }
}
function stCustom(){ _stFrom=G('st-from').value; _stTo=G('st-to').value; if(_stFrom&&_stTo&&_stFrom>_stTo){ toast('تاريخ «من» أكبر من «إلى»','error'); return; } if(_stFrom&&_stTo) stRenderArchive(); }
function _stArcData(){
  const all=_stArc.rows.filter(m=>!_stArcKind||((m.store_items?.kind||'material')===_stArcKind)), names=[...new Set(all.map(m=>m.store_items?.name||''))].sort();
  const rows=all.filter(m=>!_stItemF||(m.store_items?.name===_stItemF)).sort((a,b)=>String(b.move_date).localeCompare(String(a.move_date))||String(b.created_at).localeCompare(String(a.created_at)));
  rows.forEach(m=>{ m._k = m.kind==='out'&&m.reason==='scrap' ? 'scrap' : m.kind; });
  const sum={}; rows.forEach(m=>{ const n=m.store_items?.name||'—'; (sum[n]=sum[n]||{in:0,out:0,scrap:0})[m._k]+=m.qty; });
  return {names,rows,sum};
}
function stDrawArchive(){
  const {names,rows,sum}=_stArcData();
  const tin=rows.filter(m=>m._k==='in').reduce((s,m)=>s+m.qty,0), tout=rows.filter(m=>m._k==='out').reduce((s,m)=>s+m.qty,0), tscr=rows.filter(m=>m._k==='scrap').reduce((s,m)=>s+m.qty,0);
  G('stArcBody').innerHTML=`<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
 <div style="display:flex;gap:6px"><button class="btn${_stArcKind==='material'?' btn-p':''}" onclick="_stArcKind='material';_stItemF='';stDrawArchive()">📦 أرشيف المواد</button><button class="btn${_stArcKind==='device'?' btn-p':''}" onclick="_stArcKind='device';_stItemF='';stDrawArchive()">🩺 أرشيف الأجهزة</button></div>
      <select onchange="_stItemF=this.value;stDrawArchive()" style="padding:8px;border:1.5px solid #E5E7EB;border-radius:10px;font-size:15px"><option value="">${_stArcKind==='device'?'كل الأجهزة':'كل المواد'}</option>${names.map(n=>`<option ${n===_stItemF?'selected':''}>${esc(n)}</option>`).join('')}</select>
      <button class="btn" onclick="stExport('xls')"><i class="ti ti-file-spreadsheet"></i> Excel</button><button class="btn" onclick="stExport('pdf')"><i class="ti ti-file-type-pdf"></i> PDF</button></div>
    <div style="display:flex;gap:10px;margin-bottom:12px"><div style="flex:1;text-align:center;border:1.5px solid #BBF7D0;background:#F0FDF4;border-radius:12px;padding:10px"><div style="font-size:26px;font-weight:900;color:#166534">${fnum(tin)}</div><div style="color:#166534;font-weight:700">إجمالي المُضاف</div></div>
      <div style="flex:1;text-align:center;border:1.5px solid #FECACA;background:#FEF2F2;border-radius:12px;padding:10px"><div style="font-size:26px;font-weight:900;color:#B91C1C">${fnum(tout)}</div><div style="color:#B91C1C;font-weight:700">إجمالي المسحوب</div></div>
      ${_stArcKind==='device'?`<div style="flex:1;text-align:center;border:1.5px solid #FDE68A;background:#FFFBEB;border-radius:12px;padding:10px"><div style="font-size:26px;font-weight:900;color:#92400E">${fnum(tscr)}</div><div style="color:#92400E;font-weight:700">إجمالي المُتلَف</div></div>`:''}</div>`
   +(rows.length?`<div style="font-weight:800;margin:6px 0">ملخص كل مادة</div><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:15px"><thead><tr style="background:#F3F4F6"><th style="padding:6px;text-align:right">المادة</th><th>المُضاف</th><th>المسحوب</th>${_stArcKind==='device'?'<th>المُتلَف</th>':''}</tr></thead><tbody>`
     +Object.entries(sum).sort((a,b)=>a[0].localeCompare(b[0])).map(([n,v])=>`<tr style="border-top:1px solid #F1F5F9;text-align:center"><td style="padding:6px;text-align:right;font-weight:700">${esc(n)}</td><td style="color:#166534;font-weight:800">${fnum(v.in)}</td><td style="color:#B91C1C;font-weight:800">${fnum(v.out)}</td>${_stArcKind==='device'?`<td style="color:#92400E;font-weight:800">${fnum(v.scrap)}</td>`:''}</tr>`).join('')+'</tbody></table></div>'
     +`<div style="font-weight:800;margin:14px 0 6px">الحركات (${fnum(rows.length)})</div><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:14.5px"><thead><tr style="background:#F3F4F6"><th style="padding:6px">التاريخ</th><th>المادة</th><th>الحركة</th><th>العدد</th><th>الإكسباير</th><th>ملاحظة</th><th>بواسطة</th></tr></thead><tbody>`
     +rows.map(m=>`<tr style="border-top:1px solid #F1F5F9;text-align:center"><td style="padding:6px">${fd(m.move_date)}</td><td style="font-weight:700">${esc(m.store_items?.name||'')}</td><td style="color:${m._k==='in'?'#166534':m._k==='scrap'?'#92400E':'#B91C1C'};font-weight:800">${m._k==='in'?'إضافة':m._k==='scrap'?'إتلاف':'سحب'}</td><td style="font-weight:800">${fnum(m.qty)}</td><td>${m.expiry_date?fd(m.expiry_date):'—'}</td><td style="font-size:13px;color:#475569">${esc(m.note||'')}</td><td style="font-size:13px">${esc(m.created_by_name||'')}</td></tr>`).join('')+'</tbody></table></div>'
    :'<div class="empty"><p>لا توجد حركات بهذه الفترة</p></div>');
}
function stExport(fmt){
  if(!_stArc) return; const {rows,sum}=_stArcData(), r=_stArc.range, period=fd(r.from)+(r.from===r.to?'':' ← '+fd(r.to));
  const E=x=>esc(x==null?'':String(x));
  const sumRows=Object.entries(sum).sort((a,b)=>a[0].localeCompare(b[0])).map(([n,v])=>[n,v.in,v.out,v.scrap]);
  const mvRows=rows.map(m=>[fd(m.move_date),m.store_items?.name||'',m._k==='in'?'إضافة':m._k==='scrap'?'إتلاف':'سحب',m.qty,m.expiry_date?fd(m.expiry_date):'—',m.note||'',m.created_by_name||'']);
  const tbl=(h,rs)=>`<table border="1" style="border-collapse:collapse;margin-bottom:14px"><tr style="background:#BE123C;color:#fff;font-weight:bold">${h.map(x=>`<th>${E(x)}</th>`).join('')}</tr>${rs.map(rw=>'<tr>'+rw.map(c=>`<td>${E(c)}</td>`).join('')+'</tr>').join('')}</table>`;
  const body=`<h2>مصرف الدم — واسط</h2><h3>${_stArcKind==='device'?'أرشيف الأجهزة':'أرشيف المواد'}</h3><p>الفترة: ${E(period)}</p><h3>ملخص المواد</h3>${tbl(_stArcKind==='device'?['الجهاز','المُضاف','المسحوب','المُتلَف']:['المادة','المُضاف','المسحوب'],_stArcKind==='device'?sumRows:sumRows.map(x=>x.slice(0,3)))}<h3>الحركات</h3>${tbl(['التاريخ','المادة','الحركة','العدد','الإكسباير','ملاحظة','بواسطة'],mvRows)}`;
  if(fmt==='xls'){
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob(['﻿<html dir="rtl"><head><meta charset="UTF-8"></head><body>'+body+'</body></html>'],{type:'application/vnd.ms-excel;charset=utf-8'}));
    a.download='أرشيف_المخزن_'+_stToday()+'.xls'; a.click(); toast('✅ تم تصدير Excel','success',3000); return;
  }
  printHtmlDocument(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>أرشيف المخزن</title><style>@page{size:A4 portrait;margin:12mm}body{font-family:Arial,Tahoma,sans-serif;font-size:12px}table{width:100%;border-collapse:collapse;margin-bottom:10px}th,td{border:1px solid #cfcfcf;padding:5px;text-align:center}th{background:#BE123C;color:#fff}h2,h3{color:#BE123C}</style></head><body>${body.replace(/<table border="1"[^>]*>/g,'<table>')}<script>setTimeout(function(){window.print()},500)<\/script></body></html>`);
}
