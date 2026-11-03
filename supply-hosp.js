// ================================================================
// تجهيز مستشفيات — نافذة: (المستشفى + عدد القناني + رقم الكتاب + تاريخ الكتاب) ثم تتولّد أسطر بعدد القناني.
// كل سطر: رقم القنينة (يدوي) → تُملأ الفصيلة ونوع القنينة تلقائياً → تختار نوع التجهيز (دم / دم مضغوط / بلازما / بروتين بارد).
// الإصدار الحالي: تصميم + بحث + تحقق فقط. زر «تجهيز» غير مربوط بالحفظ بعد (ينتظر اعتماد التصميم).
// ================================================================
const SHP_COMPS = [ ['دم كامل','دم'], ['دم مضغوط','دم مضغوط'], ['بلازما','بلازما'], ['بروتين بارد','بروتين بارد'] ];
const SHP_EXTRA = { 'صفائح دموية':'صفيحات دموية' };          // يظهر فقط إذا كانت القنينة المدخلة فيها صفيحات جاهزة
const SHP_MAX = 200;
let _shpRows = [], _shpSeq = 0;
const shpEsc = s => (typeof esc==='function' ? esc(s) : String(s==null?'':s));

function shpEnsureModal(){
  if(G('supplyHospModal')) return;
  const hosp = [...(G('rc-hosp')?.options||[])].filter(o=>o.value && o.value!=='أخرى').map(o=>o.value);
  const m = document.createElement('div');
  m.className='overlay'; m.id='supplyHospModal';
  m.innerHTML = `<style>
    #supplyHospModal .shp-head{display:grid;grid-template-columns:2fr 1fr 1.2fr 1.2fr;gap:10px;align-items:start}
    #supplyHospModal .shp-row{display:grid;grid-template-columns:34px 130px 1fr 190px 28px;gap:10px;align-items:center;padding:7px 10px;border:1px solid #E5E7EB;border-radius:10px;margin-bottom:7px;background:#fff}
    #supplyHospModal .shp-row.ok{border-color:#86EFAC;background:#F0FDF4}
    #supplyHospModal .shp-row.bad{border-color:#FECACA;background:#FEF2F2}
    #supplyHospModal .shp-n{font-weight:800;color:#9CA3AF;text-align:center}
    #supplyHospModal .shp-info{font-weight:700;color:#374151;min-height:22px}
    #supplyHospModal .shp-msg{grid-column:2 / -1;font-size:13.5px;font-weight:600;margin-top:-2px}
    #supplyHospModal .shp-hint{border:1.5px dashed #D1D5DB;border-radius:12px;padding:26px 12px;text-align:center;color:#6B7280;font-size:15px}
    @media(max-width:700px){ #supplyHospModal .shp-head{grid-template-columns:1fr 1fr} #supplyHospModal .shp-row{grid-template-columns:28px 100px 1fr;} #supplyHospModal .shp-row select{grid-column:2 / -1} }
  </style>
  <div class="modal" style="width:min(980px,97vw);max-height:94vh">
    <div class="modal-title"><i class="ti ti-building-hospital"></i> تجهيز مستشفيات</div>
    <div class="modal-body">
      <div class="shp-head">
        <div class="fgrp"><label>اسم المستشفى *</label>
          <select id="shp-hosp" onchange="G('shp-hosp-o').style.display=this.value==='أخرى'?'block':'none';shpBuild()"><option value="">— اختر —</option>${hosp.map(h=>`<option value="${shpEsc(h)}">${shpEsc(h)}</option>`).join('')}<option value="أخرى">أخرى</option></select>
          <input type="text" id="shp-hosp-o" placeholder="اكتب اسم المستشفى" oninput="shpBuild()" style="display:none;margin-top:5px"></div>
        <div class="fgrp"><label>عدد القناني *</label>
          <input type="text" inputmode="numeric" id="shp-cnt" placeholder="مثال: 10" oninput="this.value=normDigits(this.value).replace(/[^0-9]/g,'');shpBuild()"></div>
        <div class="fgrp"><label>رقم الكتاب *</label>
          <input type="text" id="shp-book" placeholder="رقم الكتاب" oninput="shpBuild()"></div>
        <div class="fgrp"><label>تاريخ الكتاب *</label>
          <input type="date" id="shp-bdate" onchange="shpBuild()"></div>
      </div>
      <div id="shp-prog" style="margin:12px 0 8px;font-size:14.5px;font-weight:700;color:#374151"></div>
      <div id="shp-rows"></div>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="G('supplyHospModal').classList.remove('on')"><i class="ti ti-x"></i> إلغاء</button>
      <button class="btn btn-p" id="shp-go" onclick="shpSubmit()" disabled><i class="ti ti-check"></i> تجهيز</button>
    </div></div>`;
  document.body.appendChild(m);
}

function shpOpen(){
  shpEnsureModal();
  ['shp-hosp-o','shp-cnt','shp-book','shp-bdate'].forEach(i=>G(i).value='');
  G('shp-hosp').value=''; G('shp-hosp-o').style.display='none';
  _shpRows=[]; G('shp-rows').innerHTML='';
  shpBuild();
  G('supplyHospModal').classList.add('on');
  setTimeout(()=>G('shp-hosp').focus(),50);
}

function shpHeader(){
  let hosp=G('shp-hosp').value; if(hosp==='أخرى') hosp=G('shp-hosp-o').value.trim();
  const cnt=parseInt(G('shp-cnt').value)||0, book=G('shp-book').value.trim(), bdate=G('shp-bdate').value;
  return { hosp, cnt, book, bdate, ok: !!(hosp && cnt>0 && cnt<=SHP_MAX && book && bdate) };
}

// (re)generate the rows to match the count — rows already filled are never thrown away by accident
function shpBuild(){
  const h=shpHeader(), box=G('shp-rows');
  if(!h.ok){
    const why = h.cnt>SHP_MAX ? 'الحد الأقصى '+SHP_MAX+' قنينة بالكتاب الواحد' : 'أكمل الحقول الأربعة (المستشفى، العدد، رقم الكتاب، تاريخه) لتظهر أسطر القناني';
    if(!_shpRows.length) box.innerHTML='<div class="shp-hint"><i class="ti ti-list-numbers" style="font-size:26px;display:block;margin-bottom:6px"></i>'+why+'</div>';
    else { const hint=G('shp-hint2'); if(!hint){ const d=document.createElement('div'); d.id='shp-hint2'; d.style.cssText='color:#B45309;font-size:13.5px;font-weight:700;margin-bottom:6px'; box.prepend(d); } G('shp-hint2').textContent='⚠️ '+why; }
    shpProgress(); return;
  }
  G('shp-hint2')?.remove();
  if(!_shpRows.length) box.innerHTML='';
  while(_shpRows.length<h.cnt) shpAddRow();
  while(_shpRows.length>h.cnt){
    const last=_shpRows[_shpRows.length-1];
    if(last.num){ toast('⚠️ لا يمكن تقليل العدد: السطر '+_shpRows.length+' فيه قنينة مُدخلة — احذفها أولاً','warning',4500); G('shp-cnt').value=String(_shpRows.length); break; }
    G('shpr-'+last.id)?.remove(); _shpRows.pop();
  }
  shpRenumber(); shpProgress();
}
function shpRenumber(){ _shpRows.forEach((r,i)=>{ const n=G('shpN-'+r.id); if(n) n.textContent=i+1; }); }

function shpAddRow(){
  const id=++_shpSeq; _shpRows.push({id, num:'', opts:[], pick:'', looked:0, state:''});
  const d=document.createElement('div'); d.className='shp-row'; d.id='shpr-'+id;
  d.innerHTML=`<div class="shp-n" id="shpN-${id}"></div>
    <input type="text" inputmode="numeric" id="shpn-${id}" placeholder="رقم القنينة" oninput="this.value=normDigits(this.value).replace(/[^0-9]/g,'')" onchange="shpLookup(${id})" onkeydown="if(event.key==='Enter'){event.preventDefault();shpLookup(${id},true)}">
    <div class="shp-info" id="shpi-${id}">—</div>
    <select id="shps-${id}" onchange="shpPick(${id})" disabled>${shpCompOptions([])}</select>
    <button class="btn" title="مسح السطر" onclick="shpClear(${id})" style="padding:3px 6px;color:#B91C1C"><i class="ti ti-eraser"></i></button>
    <div class="shp-msg" id="shpm-${id}"></div>`;
  G('shp-rows').appendChild(d);
}
function shpCompOptions(avail){
  // الأنواع الأربعة دائماً ظاهرة؛ غير المتوفر للقنينة المُدخلة يكون معطّلاً. الصفيحات تظهر فقط عند وجودها.
  const has=new Map(avail.map(x=>[x.component_type||'دم كامل', x]));
  let h='<option value="">— نوع التجهيز —</option>';
  SHP_COMPS.forEach(([k,l])=>{ const x=has.get(k); h+=`<option value="${x?x.id:''}" ${x?'':'disabled'}>${shpEsc(l)}${x?'':' (غير متوفر)'}</option>`; });
  Object.entries(SHP_EXTRA).forEach(([k,l])=>{ const x=has.get(k); if(x) h+=`<option value="${x.id}">${shpEsc(l)}</option>`; });
  return h;
}

function shpClear(id){
  const r=_shpRows.find(x=>x.id===id); if(!r) return;
  G('shpn-'+id).value=''; shpLookup(id);
}

async function shpLookup(id,enter){
  const r=_shpRows.find(x=>x.id===id); if(!r) return;
  const num=parseInt(G('shpn-'+id).value)||0;
  if(num && num===r.looked){ if(enter) shpNext(id); return; }
  r.looked=num; r.num=num||''; r.opts=[]; r.pick=''; r.state='';
  const sel=G('shps-'+id), info=G('shpi-'+id), msg=G('shpm-'+id), row=G('shpr-'+id);
  sel.innerHTML=shpCompOptions([]); sel.disabled=true; info.textContent='—'; msg.textContent=''; msg.style.color=''; row.className='shp-row';
  if(!num){ shpRefreshOptions(); shpProgress(); return; }
  const bad=(t)=>{ r.state='bad'; row.classList.add('bad'); msg.style.color='#B91C1C'; msg.textContent=t; shpProgress(); };
  try{
    const{data,error}=await db.from('blood_donations')
      .select('id,bottle_number,bottle_type,blood_type,component_type,status,expiry_date')
      .eq('bottle_number',num).eq('is_deleted',false);
    if(error) return bad('تعذر البحث: '+error.message);
    if(r.looked!==num) return;                                   // the user already typed another number
    const today=new Date().toISOString().split('T')[0], rows=data||[];
    if(!rows.length) return bad('⛔ القنينة '+num+' غير موجودة');
    const ready=rows.filter(x=>x.status==='in_stock' && (!x.expiry_date || x.expiry_date>=today));
    if(!ready.length){
      const expired=rows.some(x=>x.status==='in_stock');
      const st=expired ? 'منتهية الصلاحية' : [...new Set(rows.map(x=>(typeof AUDIT_STATUS_LABELS!=='undefined'&&AUDIT_STATUS_LABELS[x.status])||x.status))].join('، ');
      return bad('⛔ القنينة '+num+' غير جاهزة للتجهيز — حالتها: '+st);
    }
    r.opts=ready;
    info.textContent=(ready[0].blood_type||'—')+'  —  '+(ready[0].bottle_type||'—');   // الفصيلة + نوع القنينة تلقائياً
    sel.innerHTML=shpCompOptions(ready); sel.disabled=false;
    shpRefreshOptions();
    if(ready.length===1){ sel.value=ready[0].id; shpPick(id); }
    shpProgress();
    if(enter){ if(!r.pick) sel.focus(); else shpNext(id); }
  }catch(e){ bad('تعذر البحث: '+(e.message||e)); }
}
function shpNext(id){ const i=_shpRows.findIndex(x=>x.id===id); const nx=_shpRows[i+1]; if(nx) G('shpn-'+nx.id)?.focus(); }

// a component already chosen in another row can't be chosen twice (the same physical item)
function shpRefreshOptions(){
  const taken=new Set(_shpRows.map(r=>r.pick).filter(Boolean));
  _shpRows.forEach(r=>{ const sel=G('shps-'+r.id); if(!sel) return; [...sel.options].forEach(o=>{ if(o.value && taken.has(o.value) && o.value!==r.pick) o.disabled=true; else if(o.value && r.opts.some(x=>x.id===o.value)) o.disabled=false; }); });
}
function shpPick(id){
  const r=_shpRows.find(x=>x.id===id); if(!r) return;
  r.pick=G('shps-'+id).value;
  const row=G('shpr-'+id), msg=G('shpm-'+id);
  row.className='shp-row'+(r.pick?' ok':''); r.state=r.pick?'ok':''; msg.textContent='';
  shpRefreshOptions(); shpProgress();
  if(r.pick) shpNext(id);
}

function shpProgress(){
  const p=G('shp-prog'), go=G('shp-go'); if(!p) return;
  const h=shpHeader(), done=_shpRows.filter(r=>r.pick).length, total=_shpRows.length;
  p.innerHTML = total ? `مكتمل <span style="color:#166534">${done}</span> من ${total}` + (_shpRows.some(r=>r.state==='bad')?' <span style="color:#B91C1C">— فيه أسطر فيها خطأ</span>':'') : '';
  if(go) go.disabled = !(h.ok && total && done===total && !_shpRows.some(r=>r.state==='bad'));
}

function shpSubmit(){
  toast('تجهيز المستشفيات: التصميم قيد الاعتماد — الحفظ يُربط بعد موافقتك على الشكل','info',5000);
}
