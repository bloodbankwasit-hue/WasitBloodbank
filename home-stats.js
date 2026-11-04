// ================================================================
// الرئيسية الخاصة بكل قسم — كل حساب يشوف إحصائيات الأقسام اللي عنده صلاحية عليها فقط
// (الحساب بأكثر من قسم يشوفها كلها، والأدمن يشوف كل شي). الفترة: يومي/أسبوعي/شهري/نصف سنوي/سنوي.
// كل وحدة تُحسب على تاريخ عملها الفعلي: الفحص (serology_date) والتصنيف (blood_type_date).
// ================================================================
let _hsKind='day', _hsAnchor=null, _hsToken=0;
const _HS_KINDS=[['day','يومي'],['week','أسبوعي'],['month','شهري'],['half','نصف سنوي'],['year','سنوي']];

function _hsYmd(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
function _hsParse(s){ const [y,m,d]=String(s).split('-').map(Number); return new Date(y,(m||1)-1,d||1); }
// Pure: [from,to] (YMD strings) of the period containing anchor. Week = Saturday → Friday.
function hsRange(kind, anchor){
  const a=_hsParse(anchor), y=a.getFullYear(), m=a.getMonth(), d=a.getDate();
  let f,t;
  if(kind==='day'){ f=new Date(y,m,d); t=f; }
  else if(kind==='week'){ const back=(a.getDay()+1)%7; f=new Date(y,m,d-back); t=new Date(y,m,d-back+6); }
  else if(kind==='month'){ f=new Date(y,m,1); t=new Date(y,m+1,0); }
  else if(kind==='half'){ const h=m<6?0:6; f=new Date(y,h,1); t=new Date(y,h+6,0); }
  else { f=new Date(y,0,1); t=new Date(y,11,31); }
  return {from:_hsYmd(f), to:_hsYmd(t)};
}
function hsShift(kind, anchor, dir){
  const a=_hsParse(anchor), y=a.getFullYear(), m=a.getMonth(), d=a.getDate();
  if(kind==='day') return _hsYmd(new Date(y,m,d+dir));
  if(kind==='week') return _hsYmd(new Date(y,m,d+7*dir));
  if(kind==='month') return _hsYmd(new Date(y,m+dir,1));
  if(kind==='half') return _hsYmd(new Date(y,m+6*dir,1));
  return _hsYmd(new Date(y+dir,m,1));
}
// Pure: count rows by a key → [[key,n],...] sorted desc.
function hsCount(rows, keyFn){
  const o={}; rows.forEach(r=>{ const k=keyFn(r); if(k==null||k==='') return; o[k]=(o[k]||0)+1; });
  return Object.entries(o).sort((a,b)=>b[1]-a[1]);
}
// Pure: one row per physical draw (a Trima draw or a separated bottle can have several rows
// sharing donor + bottle number).
function hsDistinctDraws(rows){
  const seen=new Set(), out=[];
  rows.forEach(r=>{ const k=(r.donor_id||'')+'|'+(r.bottle_number||'')+'|'+(r.draw_date||''); if(r.donor_id&&r.bottle_number){ if(seen.has(k)) return; seen.add(k); } out.push(r); });
  return out;
}

async function _hsFetchAll(build){
  let all=[], from=0; const size=1000;
  while(true){
    const{data,error}=await build().order('id',{ascending:true}).range(from,from+size-1);
    if(error) throw error;
    all=all.concat(data||[]);
    if(!data||data.length<size) break;
    from+=size;
  }
  return all;
}
async function _hsCount(q){ const{count,error}=await q; if(error) throw error; return count||0; }
const _hsBD=()=>db.from('blood_donations');
// Withdrawn / medically-rejected donations are soft-deleted rows, which the table's read policy hides —
// so they are counted by a database function (donation_exit_counts). Missing function → 0.
async function _hsExitCount(r, reason, trima){
  try{
    const{data,error}=await db.rpc('donation_exit_counts',{p_from:r.from,p_to:r.to});
    if(error) throw error;
    return (data||[]).filter(x=>x.exit_reason===reason && ((x.bottle_type==='تريما')===trima)).reduce((s,x)=>s+Number(x.n||0),0);
  }catch(e){ console.log('exit counts unavailable:',e.message||e); return 0; }
}

// Each block: perm key, title, icon, loader → {tiles:[[label,value,tone?]], groups:[[title,pairs]], names?:[...]}
const HS_BLOCKS=[
 {perm:'reception', icon:'➕', title:'الاستقبال', load: async (r)=>{
   const rows=await _hsFetchAll(()=>_hsBD().select('id,donation_type,blood_type,bottle_type,collection_form_id,parent_donation_id,donors(full_name,gender)')
     .gte('donation_date',r.from).lte('donation_date',r.to).eq('component_type','دم كامل').eq('is_deleted',false));
   const rej=await _hsFetchAll(()=>db.from('rejected_donors').select('id,rejection_type').gte('rejection_date',r.from).lte('rejection_date',r.to));
   const rare=rows.filter(x=>x.blood_type==='O-'||x.blood_type==='AB-');
   return {tiles:[['المتبرعون',rows.length],['المرفوضون',rej.length,'warn'],['فصائل نادرة',rare.length,'rare']],
     groups:[['نوع التبرع',hsCount(rows,x=>x.donation_type)],['الجنس',hsCount(rows,x=>x.donors?.gender)],['نوع الرفض',hsCount(rej,x=>x.rejection_type)],
             ['الفصائل النادرة',hsCount(rare,x=>x.blood_type)]],
     src:rows};
 }},
 {perm:'draw', icon:'💉', title:'السحب', load: async (r)=>{
   const ok=await _hsFetchAll(()=>_hsBD().select('id,bottle_type,collection_form_id,parent_donation_id').gte('draw_date',r.from).lte('draw_date',r.to)
     .eq('component_type','دم كامل').eq('is_deleted',false).neq('bottle_type','تريما').not('status','in','(damaged,pending_draw)'));
   const dmg=await _hsFetchAll(()=>_hsBD().select('id,bottle_type,damage_reason').gte('draw_date',r.from).lte('draw_date',r.to).eq('status','damaged').neq('bottle_type','تريما'));
   const med=await _hsExitCount(r,'medical_reject',false), wdr=await _hsExitCount(r,'withdrawn',false);
   const wait=await _hsCount(_hsBD().select('id',{count:'exact',head:true}).eq('status','pending_draw').eq('is_deleted',false).neq('bottle_type','تريما'));
   return {tiles:[['قناني مسحوبة',ok.length],['تالفة',dmg.length,'bad'],['انسحبوا (لم يتم السحب)',wdr,'warn'],['رفض طبي',med,'warn'],['بانتظار الآن',wait]],
     groups:[['حسب نوع القنينة',hsCount(ok,x=>x.bottle_type)],['سبب التلف',hsCount(dmg,x=>x.damage_reason)],['التالفة حسب النوع',hsCount(dmg,x=>x.bottle_type)]], src:ok};
 }},
 {perm:'trima', icon:'🩸', title:'التريما', load: async (r)=>{
   const comps=await _hsFetchAll(()=>_hsBD().select('id,donor_id,bottle_number,draw_date,component_type,collection_form_id,parent_donation_id').eq('bottle_type','تريما')
     .gte('draw_date',r.from).lte('draw_date',r.to).in('component_type',['دم مضغوط','صفائح دموية']).eq('is_deleted',false));
   const dmg=await _hsFetchAll(()=>_hsBD().select('id,damage_reason').gte('draw_date',r.from).lte('draw_date',r.to).eq('status','damaged').eq('bottle_type','تريما'));
   const med=await _hsExitCount(r,'medical_reject',true), wdr=await _hsExitCount(r,'withdrawn',true);
   const wait=await _hsCount(_hsBD().select('id',{count:'exact',head:true}).eq('status','pending_draw').eq('is_deleted',false).eq('bottle_type','تريما'));
   return {tiles:[['سحوبات تريما',hsDistinctDraws(comps).length],['تالفة',dmg.length,'bad'],['انسحبوا (لم يتم السحب)',wdr,'warn'],['رفض طبي',med,'warn'],['بانتظار الآن',wait]],
     groups:[['الناتج',hsCount(comps,x=>x.component_type)],['سبب التلف',hsCount(dmg,x=>x.damage_reason)]], src:hsDistinctDraws(comps)};
 }},
 {perm:'virology', icon:'🧪', title:'وحدة الفيروسات', load: async (r)=>{
   const rows=hsDistinctDraws(await _hsFetchAll(()=>_hsBD().select('id,donor_id,bottle_number,draw_date,serology_result,serology_type,collection_form_id,parent_donation_id')
     .gte('serology_date',r.from).lte('serology_date',r.to).not('serology_result','is',null).eq('is_deleted',false)));
   const wait=hsDistinctDraws(await _hsFetchAll(()=>_hsBD().select('id,donor_id,bottle_number,draw_date').eq('status','pending_lab').is('serology_result',null).eq('is_deleted',false))).length;
   const pos=rows.filter(x=>x.serology_result==='Positive');
   return {tiles:[['تم فحصها',rows.length],['سالبة (غير مصابة)',rows.length-pos.length],['موجبة (مصابة)',pos.length,'bad'],['نسبة الإصابة %',rows.length?(Math.round(pos.length*1000/rows.length)/10):0,'warn'],['بانتظار الآن',wait]],
     groups:[['نوع الإصابة',hsCount(pos,x=>x.serology_type)]], src:rows};
 }},
 {perm:'classification', icon:'🅰️', title:'وحدة التصنيف', load: async (r)=>{
   const rows=hsDistinctDraws(await _hsFetchAll(()=>_hsBD().select('id,donor_id,bottle_number,draw_date,blood_type,collection_form_id,parent_donation_id')
     .gte('blood_type_date',r.from).lte('blood_type_date',r.to).not('blood_type','is',null).eq('is_deleted',false)));
   const wait=hsDistinctDraws(await _hsFetchAll(()=>_hsBD().select('id,donor_id,bottle_number,draw_date').eq('status','pending_lab').is('blood_type',null).eq('is_deleted',false))).length;
   return {tiles:[['تم تصنيفها',rows.length],['بانتظار الآن',wait]], groups:[['حسب الفصيلة',hsCount(rows,x=>x.blood_type)]], src:rows};
 }},
 {perm:'separation', icon:'🧬', title:'الفصل', load: async (r)=>{
   const t0=new Date(_hsParse(r.from)).toISOString(), t1=new Date(_hsParse(hsShift('day',r.to,1))).toISOString();
   const rows=await _hsFetchAll(()=>_hsBD().select('id,component_type,collection_form_id,parent_donation_id').not('parent_donation_id','is',null).neq('bottle_type','تريما')
     .gte('created_at',t0).lt('created_at',t1).eq('is_deleted',false));
   const wait=await _hsCount(_hsBD().select('id',{count:'exact',head:true}).eq('status','pending_release').eq('is_deleted',false));
   return {tiles:[['مكوّنات ناتجة',rows.length],['بالمخزن المؤقت الآن',wait]], groups:[['حسب المكوّن',hsCount(rows,x=>x.component_type)]], src:rows};
 }},
 {perm:'supply', icon:'📦', title:'التجهيز', load: async (r)=>{
   const rows=await _hsFetchAll(()=>_hsBD().select('id,component_type,hospital_name,collection_form_id,parent_donation_id').gte('dispatch_date',r.from).lte('dispatch_date',r.to));
   const stock=await _hsCount(_hsBD().select('id',{count:'exact',head:true}).eq('status','in_stock').eq('is_deleted',false));
   return {tiles:[['وحدات مصروفة',rows.length],['رصيد الخزين الآن',stock]],
     groups:[['حسب المكوّن',hsCount(rows,x=>x.component_type||'دم كامل')],['حسب الجهة',hsCount(rows,x=>x.hospital_name).slice(0,8)]], src:rows};
 }},
 {perm:'damaged_store', icon:'🗑️', title:'مخزن القناني التالفة', load: async (r)=>{
   const got=await _hsFetchAll(()=>_hsBD().select('id,damage_reason,collection_form_id,parent_donation_id').gte('damaged_date',r.from).lte('damaged_date',r.to).eq('status','damaged'));
   const reps=await _hsFetchAll(()=>db.from('destruction_reports').select('id,bottle_count').gte('report_date',r.from).lte('report_date',r.to));
   const wait=await _hsCount(_hsBD().select('id',{count:'exact',head:true}).eq('status','damaged').eq('is_deleted',false).is('destruction_report_id',null));
   return {tiles:[['وصلت تالفة',got.length,'bad'],['أُتلفت',reps.reduce((s,x)=>s+(x.bottle_count||0),0)],['بانتظار الإتلاف الآن',wait,'warn']],
     groups:[['سبب التلف',hsCount(got,x=>x.damage_reason)]], src:got};
 }}
];

function hsVisibleBlocks(){
  const admin=UPROF?.role==='admin';
  return HS_BLOCKS.filter(b=> admin || hasPermission(b.perm));
}

function _hsTone(t){ return t==='bad'?'#B91C1C':t==='warn'?'#B45309':t==='rare'?'#7C3AED':'#BE123C'; }
function _hsBlockHtml(b,res,err){
  if(err) return `<div class="hs-card"><div class="hs-h">${b.icon} ${b.title}</div><div style="color:#B91C1C;font-size:14px">تعذّر التحميل: ${esc(err)}</div></div>`;
  const tiles=res.tiles.map(([l,v,t])=>`<div class="hs-tile"><div class="hs-v" style="color:${_hsTone(t)}">${fnum(v)}</div><div class="hs-l">${l}</div></div>`).join('');
  const groups=res.groups.filter(g=>g[1].length).map(([t,p])=>`<div class="hs-g"><span class="hs-gt">${t}:</span> ${p.map(([k,v])=>`<span class="pill py" style="margin:2px">${esc(k)}: ${fnum(v)}</span>`).join('')}</div>`).join('');
  let names='';
  if(res.src&&res.src.length){ const i=window._hsSrc.push(res.src)-1; names=`<button class="btn hs-namesbtn" onclick="hsOpenForms(${i},'${b.title}')"><i class="ti ti-clipboard-list"></i> الاستمارات والأسماء (${fnum(res.src.length)})</button>`; }
  return `<div class="hs-card"><div class="hs-h">${b.icon} ${b.title}</div><div class="hs-tiles">${tiles}</div>${groups}${names}</div>`;
}

function hsSetKind(k){ _hsKind=k; _hsAnchor=_hsYmd(new Date()); loadRoleHome(); }
function hsMove(dir){ _hsAnchor=hsShift(_hsKind,_hsAnchor,dir); loadRoleHome(); }

async function loadRoleHome(){
  const box=G('roleHome'); if(!box) return;
  window._hsSrc=[];
  const blocks=hsVisibleBlocks();
  if(!blocks.length){ box.innerHTML=''; return; }
  if(!_hsAnchor) _hsAnchor=_hsYmd(new Date());
  const r=hsRange(_hsKind,_hsAnchor), token=++_hsToken;
  const bar=`<div class="hs-bar">
    <div class="tabs">${_HS_KINDS.map(([k,l])=>`<div class="tab ${k===_hsKind?'on':''}" onclick="hsSetKind('${k}')">${l}</div>`).join('')}</div>
    <div class="hs-nav"><button class="btn" onclick="hsMove(-1)">›</button>
      <span class="hs-range">${r.from===r.to?fd(r.from):fd(r.from)+' ← '+fd(r.to)}</span>
      <button class="btn" onclick="hsMove(1)">‹</button></div></div>`;
  box.innerHTML=bar+'<div id="hsBody"><div class="empty"><i class="ti ti-loader"></i><p>جاري التحميل...</p></div></div>';
  const out=await Promise.all(blocks.map(async b=>{ try{ return _hsBlockHtml(b,await b.load(r)); }catch(e){ return _hsBlockHtml(b,null,e.message||String(e)); } }));
  if(token!==_hsToken) return;
  const body=G('hsBody'); if(body) body.innerHTML=out.join('');
}


// ================================================================
// «الاستمارات والأسماء»: من أي بطاقة بالرئيسية تفتح استمارات الفترة ← الاستمارة ← الأسماء ← بيانات الاسم
// ================================================================
window._hsSrc=window._hsSrc||[];
const _HS_GN={T:'تريما',R:'ريفيوس',B:'بقية الأنواع',A:'قديمة'};
function _hsOv(){
  let o=G('hsFormsOv'); if(o) o.remove();
  o=document.createElement('div'); o.className='overlay on'; o.id='hsFormsOv'; o.style.zIndex=7600;
  o.innerHTML='<div class="modal" style="width:min(640px,96vw);max-height:92vh;display:flex;flex-direction:column"><div class="modal-title" id="hsFormsT"></div><div class="modal-body" id="hsFormsB" style="overflow:auto;flex:1"></div><div class="modal-foot"><button class="btn" id="hsFormsBack" style="display:none"><i class="ti ti-arrow-right"></i> رجوع</button><button class="btn" onclick="G(\'hsFormsOv\').remove()">إغلاق</button></div></div>';
  document.body.appendChild(o); return o;
}
async function hsOpenForms(i,title){
  const src=(window._hsSrc||[])[i]||[]; if(!src.length) return;
  _hsOv(); G('hsFormsT').innerHTML='<i class="ti ti-clipboard-list"></i> '+esc(title)+' — الاستمارات';
  G('hsFormsB').innerHTML='<div class="empty"><p>جاري التحميل...</p></div>';
  try{
    // كل سجل → استمارته (المكوّنات الناتجة من فصل تتبع استمارة القنينة الأصلية)
    const formOf=new Map(); const needParent=[];
    src.forEach(r=>{ if(r.collection_form_id) formOf.set(r.id,r.collection_form_id); else if(r.parent_donation_id) needParent.push(r); });
    const pids=[...new Set(needParent.map(r=>r.parent_donation_id))], pf=new Map();
    for(let k=0;k<pids.length;k+=150){
      const{data}=await _hsBD().select('id,collection_form_id').in('id',pids.slice(k,k+150));
      (data||[]).forEach(x=>{ if(x.collection_form_id) pf.set(x.id,x.collection_form_id); });
    }
    needParent.forEach(r=>{ if(pf.has(r.parent_donation_id)) formOf.set(r.id,pf.get(r.parent_donation_id)); });
    const cnt={}; let none=0;
    src.forEach(r=>{ const f=formOf.get(r.id); if(f) cnt[f]=(cnt[f]||0)+1; else none++; });
    const ids=Object.keys(cnt);
    const{data:forms,error}=await db.rpc('forms_recent',{p_groups:['T','R','B','A'],p_limit:5000}); if(error) throw error;
    const byId=new Map((forms||[]).map(f=>[f.id,f]));
    const list=ids.map(id=>byId.get(id)).filter(Boolean).sort((a,b)=>b.form_no-a.form_no);
    window._hsPeriodIds=new Set(src.map(r=>r.id));
    window._hsPeriodForms=formOf;
    G('hsFormsB').innerHTML=(list.length?list.map(f=>`<div class="fv-card" style="cursor:pointer;display:flex;align-items:center;gap:10px;border:1px solid #EEF2F6;border-radius:12px;padding:10px;margin-bottom:8px" onclick="hsOpenForm('${f.id}',${f.form_no},'${f.form_group}')">
        <div style="font-size:22px;font-weight:800;color:#BE123C;min-width:56px">#${f.form_no}</div>
        <div style="flex:1"><b>استمارة ${_HS_GN[f.form_group]||''}</b><div style="font-size:13.5px;color:#757575">${typeof bbDmy==='function'?bbDmy(f.last_name_at):''}</div></div>
        <span class="pill py">${fnum(cnt[f.id])} بهذه الفترة</span></div>`).join(''):'<div class="empty"><p>لا توجد استمارات لهذه الفترة</p></div>')
      +(none?`<div style="margin-top:6px;color:#6B7280;font-size:14px">${fnum(none)} سجل بدون استمارة (سجلات قديمة أو حملات)</div>`:'');
    G('hsFormsBack').style.display='none';
    window._hsListHtml=G('hsFormsB').innerHTML; window._hsListTitle=G('hsFormsT').innerHTML;
  }catch(e){ G('hsFormsB').innerHTML='<div style="color:#B91C1C">تعذّر التحميل: '+esc(e.message||String(e))+'</div>'; }
}
async function hsOpenForm(formId,no,grp){
  G('hsFormsT').innerHTML='<i class="ti ti-clipboard-list"></i> استمارة #'+no+' — '+(_HS_GN[grp]||'');
  G('hsFormsB').innerHTML='<div class="empty"><p>جاري التحميل...</p></div>';
  G('hsFormsBack').style.display=''; G('hsFormsBack').onclick=()=>{ G('hsFormsT').innerHTML=window._hsListTitle||''; G('hsFormsB').innerHTML=window._hsListHtml||''; G('hsFormsBack').style.display='none'; };
  try{
    const{data,error}=await db.rpc('form_members',{p_forms:[formId]}); if(error) throw error;
    const ms=(data||[]).filter(m=>m.exit_reason!=='withdrawn');
    const inP=window._hsPeriodIds||new Set();
    G('hsFormsB').innerHTML=ms.length?ms.map(m=>`<div onclick="hsOpenName('${m.id}')" style="cursor:pointer;display:flex;align-items:center;gap:10px;border:1px solid #EEF2F6;border-radius:12px;padding:10px;margin-bottom:8px;${inP.has(m.id)?'background:#FFF7F8':''}">
        <div style="font-size:20px;font-weight:800;color:#BE123C;min-width:62px">${esc(String(m.bottle_number||'—'))}</div>
        <div style="flex:1"><b>${esc(m.full_name||'—')}</b><div style="font-size:13.5px;color:#757575">${esc(m.bottle_type||'')} ${m.blood_type?'— <bdi dir="ltr">'+esc(m.blood_type)+'</bdi>':''} ${m.exit_reason==='medical_reject'?'— ⛔ رفض طبي':''}</div></div>
        <i class="ti ti-chevron-left" style="color:#9CA3AF"></i></div>`).join(''):'<div class="empty"><p>لا توجد أسماء بهذه الاستمارة</p></div>';
  }catch(e){ G('hsFormsB').innerHTML='<div style="color:#B91C1C">تعذّر التحميل: '+esc(e.message||String(e))+'</div>'; }
}
async function hsOpenName(id){
  try{ await loadSectionScript('donors'); await editDonorRow(id); }catch(e){ toast('تعذر فتح الاسم: '+(e.message||e),'error'); }
}
