// ================================================================
// الرصيد الخارجي (أعداد فقط، بدون أرقام قناني وبدون صلاحية) — داخل التجهيز.
//  - الصلاحية: مدير أو صلاحية «التجهيز» (نفس من يصل لشاشة التجهيز): إضافة/تعديل الرصيد + التجهيز + الإتلاف.
//  - كل تعديل يُسجَّل بسجل التدقيق (القيمة القديمة والجديدة).
//  - ثلاثة أزرار: تجهيز مستشفى / باي هاند / إتلاف → دالة opening_dispatch_do تخصم وتسجّل بعملية واحدة (الكل أو لا شيء).
//  - الإحصائيات: المجهّز (مستشفى + باي هاند) يُحسب مع الصرف العادي بخانة «خرج»؛ الإتلاف يظهر بسطر منفصل.
// ================================================================
const OS_COMPS = ['دم كامل','دم مضغوط','دم مفلتر','بلازما','صفائح دموية','بروتين بارد'];
const OS_KIND = { hospital:'تجهيز مستشفى', hand:'تجهيز باي هاند', destroy:'إتلاف' };
const OS_HAND_TYPES = ['عوض','بثمن','مجاني (الإدارة)'];
const OS_DESTROY_REASONS = ['انتهاء الصلاحية','تلف','تسرّب','أخرى'];
let _osRows = {}, _osBusy = false, _osEdit = false, _oaKind = null, _oaRows = [], _oaSeq = 0;
const osEsc = s => (typeof esc==='function' ? esc(s) : String(s==null?'':s));
const osBts = ct => (bbNoSign(ct) ? PLASMA_ABO : ['A+','A-','B+','B-','O+','O-','AB+','AB-']);
const osToday = () => { const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
const osAudit = (rid,vals) => db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'UPDATE',table_name:'opening_stock',record_id:rid||null,new_values:vals}).then(()=>{},()=>{});
const osLeft = (c,b) => (_osRows[c+'|'+b]?.qty_left)||0;
const osCanUse = () => (UPROF?.role==='admin' || hasPermission('supply'));

// ───────────── الشاشة الرئيسية ─────────────
function osEnsureMain(){
  if(G('openingStockModal')) return;
  const m=document.createElement('div'); m.className='overlay'; m.id='openingStockModal';
  m.innerHTML=`<style>
    #openingStockModal .os-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;direction:rtl}
    #openingStockModal .os-cell{border:1.5px solid #E5E7EB;border-radius:12px;padding:8px 10px;background:#fff;text-align:center}
    #openingStockModal .os-cell.zero{opacity:.55}
    #openingStockModal .os-cell.chg{border-color:#F59E0B;background:#FFFBEB}
    #openingStockModal .os-bt{font-weight:800;color:#BE123C;font-size:17px}
    #openingStockModal .os-n{font-weight:800;font-size:24px;color:#1E293B;margin-top:2px}
    #openingStockModal .os-cell input{width:100%;box-sizing:border-box;text-align:center;font-size:18px;font-weight:700;margin-top:4px}
    #openingStockModal .os-chip{display:inline-block;background:#F1F5F9;border-radius:20px;padding:4px 11px;margin:2px;font-size:14px;font-weight:700;cursor:pointer;border:1.5px solid transparent}
    #openingStockModal .os-chip.on{background:#FFF1F2;border-color:#BE123C;color:#BE123C}
    #openingStockModal .os-log{font-size:14px;border-bottom:1px solid #F1F5F9;padding:6px 2px}
    #openingStockModal .os-act{flex:1 1 150px;font-weight:800;font-size:16px;padding:11px 12px}
    @media(max-width:560px){#openingStockModal .os-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  </style>
  <div class="modal" style="width:min(760px,97vw);max-height:94vh">
    <div class="modal-title"><i class="ti ti-packages"></i> الرصيد الخارجي</div>
    <div class="modal-body">
      <div id="os-total" style="font-weight:800;color:#92400E;background:#FFFBEB;border:1px solid #FCD34D;border-radius:10px;padding:9px 12px;margin-bottom:10px"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <button class="btn os-act" style="background:#DCFCE7;color:#166534;border:1.5px solid #86EFAC" onclick="osAct('hospital')"><i class="ti ti-building-hospital"></i> تجهيز مستشفى</button>
        <button class="btn os-act" style="background:#DCFCE7;color:#166534;border:1.5px solid #86EFAC" onclick="osAct('hand')"><i class="ti ti-hand-grab"></i> باي هاند</button>
        <button class="btn os-act" style="background:#FEE2E2;color:#991B1B;border:1.5px solid #FCA5A5" onclick="osAct('destroy')"><i class="ti ti-trash"></i> إتلاف</button>
      </div>
      <div id="os-chips" style="margin-bottom:8px"></div>
      <div id="os-grid" class="os-grid"></div>
      <div id="os-editnote" style="display:none;margin-top:8px;font-size:13.5px;color:#92400E">وضع التعديل: اكتب المتبقي الحالي لكل فصيلة. التغيير يُسجَّل بسجل التدقيق. لا تعدّل أثناء تجهيز موظف آخر.</div>
      <details style="margin-top:14px" ontoggle="if(this.open)osLoadLog()"><summary style="cursor:pointer;font-weight:700;color:#374151">سجل الصرف والإتلاف</summary><div id="os-log" style="margin-top:8px"></div></details>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="G('openingStockModal').classList.remove('on')"><i class="ti ti-x"></i> إغلاق</button>
      <button class="btn" id="os-editbtn" onclick="osToggleEdit()"><i class="ti ti-edit"></i> إضافة / تعديل الرصيد</button>
      <button class="btn btn-p" id="os-save" style="display:none" onclick="osSave()"><i class="ti ti-check"></i> حفظ</button>
    </div></div>`;
  document.body.appendChild(m);
}

async function osLoadRows(){
  const{data,error}=await db.from('opening_stock').select('id,component_type,blood_type,qty_in,qty_left');
  if(error) throw error;
  _osRows={}; (data||[]).forEach(r=>{ _osRows[r.component_type+'|'+r.blood_type]=r; });
}
const osMissing = e => /opening_stock|opening_dispatch|42P01|does not exist|schema cache|PGRST202|42883/i.test((e.code||'')+' '+(e.message||''));

async function osOpen(){
  if(!osCanUse()){ toast('هذه الشاشة لحسابات التجهيز','error'); return; }
  osEnsureMain();
  load(true);
  try{ await osLoadRows(); }
  catch(e){ load(false); toast(osMissing(e) ? 'شغّل SQL الرصيد الخارجي أولاً' : 'تعذر التحميل: '+(e.message||e),'error',6000); return; }
  load(false);
  _osEdit=false; G('os-log').innerHTML=''; const dt=G('openingStockModal').querySelector('details'); if(dt) dt.open=false;
  osRender();
  G('openingStockModal').classList.add('on');
}

let _osComp = 'دم كامل';
function osCompTotals(){ const t={}; OS_COMPS.forEach(c=>t[c]=0); Object.values(_osRows).forEach(r=>{ t[r.component_type]=(t[r.component_type]||0)+(+r.qty_left||0); }); return t; }
function osRender(){
  const t=osCompTotals(), all=Object.values(t).reduce((a,b)=>a+b,0);
  G('os-total').textContent='إجمالي الرصيد الخارجي: '+all+' قنينة';
  G('os-chips').innerHTML=OS_COMPS.map(c=>`<span class="os-chip ${c===_osComp?'on':''}" onclick="osPick('${c}')">${c}: ${t[c]||0}</span>`).join('');
  G('os-grid').innerHTML=osBts(_osComp).map((bt,i)=>{
    const n=osLeft(_osComp,bt);
    return _osEdit
      ? `<div class="os-cell" id="os-c-${i}"><div class="os-bt">${osEsc(bt)}</div><input type="text" inputmode="numeric" id="os-i-${i}" value="${_osRows[_osComp+'|'+bt]?n:''}" placeholder="0" oninput="this.value=normDigits(this.value).replace(/[^0-9]/g,'');osMark()"></div>`
      : `<div class="os-cell ${n===0?'zero':''}"><div class="os-bt">${osEsc(bt)}</div><div class="os-n">${n}</div></div>`;
  }).join('');
  G('os-editnote').style.display=_osEdit?'block':'none';
  G('os-save').style.display=_osEdit?'':'none';
  G('os-editbtn').innerHTML=_osEdit?'<i class="ti ti-x"></i> إلغاء التعديل':'<i class="ti ti-edit"></i> إضافة / تعديل الرصيد';
}
function osPick(c){ _osComp=c; osRender(); }
function osToggleEdit(){ _osEdit=!_osEdit; osRender(); }
function osMark(){
  osBts(_osComp).forEach((bt,i)=>{
    const inp=G('os-i-'+i), c=G('os-c-'+i); if(!inp||!c) return;
    const r=_osRows[_osComp+'|'+bt], cur=r?r.qty_left:null, v=inp.value===''?null:parseInt(inp.value);
    c.classList.toggle('chg', v!==null && v!==cur);
  });
}

async function osSave(){
  if(_osBusy) return;
  if(!IS_ONLINE){ toast('الحفظ يحتاج اتصالاً بالإنترنت','error'); return; }
  const ct=_osComp, changes=[];
  osBts(ct).forEach((bt,i)=>{
    const raw=G('os-i-'+i)?.value; if(raw==null||raw==='') return;
    const v=parseInt(raw); if(isNaN(v)||v<0||v>100000) return;
    const r=_osRows[ct+'|'+bt], cur=r?r.qty_left:null;
    if(v!==cur && !(r==null && v===0)) changes.push({bt,v,r,cur});
  });
  if(!changes.length){ toast('لا يوجد تغيير للحفظ','info'); return; }
  const txt=changes.map(c=>c.bt+': '+(c.cur==null?'—':c.cur)+' ← '+c.v).join('\n');
  if(!(await bbConfirm('تأكيد حفظ الرصيد الخارجي ('+ct+'):\n'+txt+'\nسيُسجَّل التعديل بسجل التدقيق.'))) return;
  _osBusy=true; load(true);
  try{
    await Promise.all(changes.map(async c=>{
      if(c.r){
        const{error}=await db.from('opening_stock').update({qty_left:c.v,updated_at:new Date().toISOString()}).eq('id',c.r.id);
        if(error) throw error;
        await osAudit(c.r.id,{action:'تعديل رصيد خارجي',component:ct,blood_type:c.bt,old:c.cur,new:c.v});
      } else {
        const{data,error}=await db.from('opening_stock').insert({component_type:ct,blood_type:c.bt,qty_in:c.v,qty_left:c.v}).select('id').single();
        if(error) throw error;
        await osAudit(data?.id,{action:'إدخال رصيد خارجي',component:ct,blood_type:c.bt,old:null,new:c.v});
      }
    }));
    await osLoadRows(); _osEdit=false; osRender();
    toast('✅ تم حفظ الرصيد الخارجي ('+changes.length+' فصيلة)','success',4000);
  }catch(e){ toast('⛔ تعذر الحفظ: '+(e.message||e),'error',8000); }
  finally{ _osBusy=false; load(false); }
}

async function osLoadLog(){
  const box=G('os-log'); box.innerHTML='<div style="color:#6B7280">جاري التحميل...</div>';
  const{data,error}=await db.from('opening_dispatch').select('kind,component_type,blood_type,qty,hospital_name,patient,book_no,note,dispatch_date').order('created_at',{ascending:false}).limit(40);
  if(error){ box.innerHTML='<div style="color:#B91C1C">تعذر تحميل السجل</div>'; return; }
  box.innerHTML=(data||[]).length ? data.map(r=>`<div class="os-log">${bbDmy(r.dispatch_date)} — <b>${osEsc(OS_KIND[r.kind]||'تجهيز')}</b>: ${osEsc(r.component_type)} ${osEsc(r.blood_type)} × ${r.qty}${r.hospital_name?' ← '+osEsc(r.hospital_name):''}${r.patient?' (المريض: '+osEsc(r.patient)+')':''}${r.book_no?' كتاب '+osEsc(r.book_no):''}${r.note?' — '+osEsc(r.note):''}</div>`).join('') : '<div style="color:#6B7280">لا يوجد صرف بعد</div>';
}

// ───────────── نافذة العملية (تجهيز مستشفى / باي هاند / إتلاف) ─────────────
function osEnsureAct(){
  if(G('openingActModal')) return;
  const hosp=[...(G('rc-hosp')?.options||[])].filter(o=>o.value && o.value!=='أخرى').map(o=>o.value);
  const hospSel=(id)=>`<select id="${id}" onchange="G('${id}-o').style.display=this.value==='أخرى'?'block':'none'"><option value="">— اختر —</option>${hosp.map(h=>`<option value="${osEsc(h)}">${osEsc(h)}</option>`).join('')}<option value="أخرى">أخرى</option></select><input type="text" id="${id}-o" placeholder="اكتب اسم المستشفى" style="display:none;margin-top:5px">`;
  const m=document.createElement('div'); m.className='overlay'; m.id='openingActModal';
  m.innerHTML=`<style>
    #openingActModal .oa-row{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) 90px 34px;gap:8px;align-items:center;margin-bottom:8px;direction:rtl}
    #openingActModal .oa-row>*{min-width:0;width:100%;box-sizing:border-box}
    @media(max-width:560px){#openingActModal .oa-row{grid-template-columns:1fr 1fr}}
  </style>
  <div class="modal" style="width:min(720px,97vw);max-height:94vh">
    <div class="modal-title" id="oa-title"></div>
    <div class="modal-body">
      <div id="oa-head"></div>
      <div style="font-weight:700;margin:6px 0">القناني من الرصيد الخارجي</div>
      <div id="oa-rows"></div>
      <button class="btn" onclick="osAddRow()"><i class="ti ti-plus"></i> إضافة سطر</button>
      <div id="oa-sum" style="margin-top:10px;font-weight:700;color:#374151"></div>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="G('openingActModal').classList.remove('on')"><i class="ti ti-x"></i> إلغاء</button>
      <button class="btn btn-p" id="oa-go" onclick="osSubmit()"><i class="ti ti-check"></i> تنفيذ</button>
    </div></div>`;
  document.body.appendChild(m);
  window._osHospSel=hospSel;
}

function osAct(kind){
  osEnsureAct(); _oaKind=kind; _oaRows=[];
  const hs=window._osHospSel;
  G('oa-title').innerHTML={hospital:'<i class="ti ti-building-hospital"></i> تجهيز مستشفى — من الرصيد الخارجي',hand:'<i class="ti ti-hand-grab"></i> تجهيز باي هاند — من الرصيد الخارجي',destroy:'<i class="ti ti-trash"></i> إتلاف — من الرصيد الخارجي'}[kind];
  let head='';
  if(kind==='hospital') head=`<div class="fgrid" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div class="fgrp"><label>المستشفى *</label>${hs('oa-hosp')}</div><div class="fgrp"><label>رقم الكتاب *</label><input type="text" id="oa-book"></div><div class="fgrp"><label>تاريخ الكتاب *</label><input type="date" id="oa-bdate"></div></div>`;
  else if(kind==='hand') head=`<div class="fgrid" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div class="fgrp"><label>اسم المريض *</label><input type="text" id="oa-pat"></div><div class="fgrp"><label>المستشفى *</label>${hs('oa-hosp')}</div><div class="fgrp"><label>نوع التعويض *</label><select id="oa-hcomp">${'<option value="">— اختر —</option>'+OS_HAND_TYPES.map(x=>`<option value="${x}">${x}</option>`).join('')}</select></div></div>`;
  else head=`<div class="fgrid" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)"><div class="fgrp"><label>سبب الإتلاف *</label><select id="oa-reason" onchange="G('oa-reason-o').style.display=this.value==='أخرى'?'block':'none'"><option value="">— اختر —</option>${OS_DESTROY_REASONS.map(x=>`<option value="${x}">${x}</option>`).join('')}</select><input type="text" id="oa-reason-o" placeholder="اكتب السبب" style="display:none;margin-top:5px"></div></div>`;
  G('oa-head').innerHTML=head; G('oa-rows').innerHTML='';
  osAddRow(); osSum();
  G('openingActModal').classList.add('on');
}

function osAddRow(){
  const id=++_oaSeq, c0=_osComp; _oaRows.push({id,c:c0,b:'',n:''});
  const d=document.createElement('div'); d.className='oa-row'; d.id='oar-'+id;
  d.innerHTML=`<select id="oac-${id}" onchange="osRowComp(${id})">${OS_COMPS.map(c=>`<option value="${c}" ${c===c0?'selected':''}>${c}</option>`).join('')}</select>
    <select id="oab-${id}" onchange="osRowChg(${id})"></select>
    <input type="text" inputmode="numeric" id="oan-${id}" placeholder="العدد" oninput="this.value=normDigits(this.value).replace(/[^0-9]/g,'');osRowChg(${id})">
    <button class="btn" title="حذف" onclick="osDelRow(${id})" style="padding:3px 6px;color:#B91C1C"><i class="ti ti-trash"></i></button>`;
  G('oa-rows').appendChild(d); osRowComp(id);
}
function osDelRow(id){ if(_oaRows.length<=1) return; _oaRows=_oaRows.filter(r=>r.id!==id); G('oar-'+id)?.remove(); osSum(); }
function osRowComp(id){
  const c=G('oac-'+id).value, sel=G('oab-'+id);
  sel.innerHTML='<option value="">الفصيلة</option>'+osBts(c).map(b=>`<option value="${b}">${b} (${osLeft(c,b)})</option>`).join('');
  osRowChg(id);
}
function osRowChg(id){
  const r=_oaRows.find(x=>x.id===id); if(!r) return;
  r.c=G('oac-'+id).value; r.b=G('oab-'+id).value; r.n=parseInt(G('oan-'+id).value)||0; osSum();
}
function osSum(){
  const need={}; _oaRows.forEach(r=>{ if(r.b&&r.n>0) need[r.c+'|'+r.b]=(need[r.c+'|'+r.b]||0)+r.n; });
  const bad=Object.entries(need).filter(([k,n])=>n>(_osRows[k]?.qty_left||0));
  const tot=Object.values(need).reduce((a,b)=>a+b,0);
  G('oa-sum').innerHTML='المجموع: '+tot+' قنينة'+(bad.length?' <span style="color:#B91C1C">— العدد أكبر من المتبقي في: '+bad.map(([k])=>k.replace('|',' ')).join('، ')+'</span>':'');
}

async function osSubmit(){
  if(_osBusy) return;
  const kind=_oaKind; let hosp=null, book=null, bdate=null, patient=null, note=null;
  const hv=()=>{ let h=G('oa-hosp').value; if(h==='أخرى') h=G('oa-hosp-o').value.trim(); return h; };
  if(kind==='hospital'){ hosp=hv(); book=G('oa-book').value.trim(); bdate=G('oa-bdate').value; if(!hosp||!book||!bdate){ toast('أكمل المستشفى ورقم الكتاب وتاريخه','error'); return; } }
  else if(kind==='hand'){ patient=G('oa-pat').value.trim(); hosp=hv(); note=G('oa-hcomp').value; if(!patient||!hosp||!note){ toast('أكمل اسم المريض والمستشفى ونوع التعويض','error'); return; } }
  else { note=G('oa-reason').value; if(note==='أخرى') note=G('oa-reason-o').value.trim(); if(!note){ toast('اختر سبب الإتلاف','error'); return; } }
  _oaRows.forEach(r=>osRowChg(r.id));
  const items=_oaRows.filter(r=>r.b&&r.n>0).map(r=>({c:r.c,b:r.b,n:r.n}));
  if(!items.length || _oaRows.some(r=>(r.b&&!(r.n>0))||(!r.b&&r.n>0))){ toast('أكمل كل الأسطر (المحتوى، الفصيلة، العدد)','error'); return; }
  const need={}; items.forEach(x=>{ need[x.c+'|'+x.b]=(need[x.c+'|'+x.b]||0)+x.n; });
  const over=Object.entries(need).find(([k,n])=>n>osLeft(...k.split('|')));
  if(over){ toast('العدد أكبر من المتبقي: '+over[0].replace('|',' '),'error'); return; }
  if(!IS_ONLINE){ toast('العملية تحتاج اتصالاً بالإنترنت','error'); return; }
  const tot=items.reduce((a,x)=>a+x.n,0);
  if(!(await bbConfirm('تأكيد '+OS_KIND[kind]+' ('+tot+' قنينة) من الرصيد الخارجي'+(hosp?' إلى «'+hosp+'»':'')+(book?'\nكتاب رقم '+book:'')+(kind==='destroy'?'\nالسبب: '+note:'')+'؟'))) return;
  _osBusy=true; load(true);
  try{
    const{error}=await db.rpc('opening_dispatch_do',{p_kind:kind,p_items:items,p_hosp:hosp,p_book:book,p_bdate:bdate||null,p_patient:patient,p_note:note,p_date:osToday()});
    if(error) throw error;
    try{ await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'UPDATE',table_name:'opening_stock',record_id:null,new_values:{action:OS_KIND[kind]+' من رصيد خارجي',items:items.map(x=>x.c+' '+x.b+'×'+x.n).join('، '),hospital:hosp,patient,book_no:book,note}}); }catch(e){}
    toast('✅ تم ('+OS_KIND[kind]+') '+tot+' قنينة من الرصيد الخارجي','success',5000);
    G('openingActModal').classList.remove('on');
    await osLoadRows(); osRender();
  }catch(e){ toast('⛔ '+(/غير كاف/.test(e.message||'')?'الرصيد الخارجي غير كاف (ربما تغيّر قبل قليل)':(osMissing(e)?'شغّل SQL الرصيد الخارجي المحدَّث أولاً':(e.message||e))),'error',8000); }
  finally{ _osBusy=false; load(false); }
}
