// ================================================================
// إحصائيات الأقسام — لكل قسم إحصائيات عمله فقط (استقبال، سحب، تريما، تصنيف، فيروسات، فصل، تجهيز، مخزن التالفة).
// تستعمل نفس محرّك الرئيسية (home-stats.js) لكن بفترة حرة (يومي/أسبوعي/شهري/نصف سنوي/سنوي/مخصص) وتصدير PDF/Excel.
// كل حساب يرى الأقسام التي لديه صلاحيتها فقط، والمدير يرى الكل.
// ================================================================
let _ssKey=null, _ssKind='month', _ssAnchor=null, _ssFrom='', _ssTo='', _ssRes=null, _ssBlock=null, _ssTok=0;
const _SS_KINDS=[['day','يومي'],['week','أسبوعي'],['month','شهري'],['half','نصف سنوي'],['year','سنوي'],['custom','مخصص']];

function ssEnsure(){
  if(G('secStatsModal')) return;
  const m=document.createElement('div'); m.className='overlay'; m.id='secStatsModal';
  m.innerHTML=`<style>
    #secStatsModal .ss-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
    #secStatsModal .ss-tab{padding:8px 14px;border:1.5px solid #E5E7EB;border-radius:10px;background:#fff;font-weight:800;cursor:pointer;font-size:15px}
    #secStatsModal .ss-tab.on{background:#BE123C;color:#fff;border-color:#BE123C}
    #secStatsModal .ss-kinds{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
    #secStatsModal .ss-k{padding:6px 12px;border-radius:20px;background:#F3F4F6;cursor:pointer;font-weight:700;font-size:14px}
    #secStatsModal .ss-k.on{background:#FCE7F3;color:#9D174D}
  </style>
  <div class="modal" style="width:min(900px,97vw);max-height:94vh">
    <div class="modal-title"><i class="ti ti-chart-bar"></i> إحصائيات الأقسام</div>
    <div class="modal-body" style="min-width:0">
      <div class="ss-tabs" id="ss-tabs"></div>
      <div class="ss-kinds" id="ss-kinds"></div>
      <div id="ss-nav" style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap"></div>
      <div id="ss-body"></div>
    </div>
    <div class="modal-foot">
      <button class="btn" onclick="ssExport('pdf')"><i class="ti ti-file-type-pdf"></i> PDF</button>
      <button class="btn" onclick="ssExport('xls')"><i class="ti ti-file-spreadsheet"></i> Excel</button>
      <button class="btn" onclick="G('secStatsModal').classList.remove('on')"><i class="ti ti-x"></i> إغلاق</button>
    </div></div>`;
  document.body.appendChild(m);
}
async function ssOpen(key){
  try{ await loadOneScript('home-stats.js'); }catch(e){ toast('تعذر تحميل الإحصائيات','error'); return; }
  ssEnsure();
  const blocks=hsVisibleBlocks();
  if(!blocks.length){ toast('ما عندك صلاحية على أي قسم لعرض إحصائياته','error'); return; }
  _ssKey = blocks.some(b=>b.perm===key) ? key : blocks[0].perm;
  if(!_ssAnchor) _ssAnchor=_hsYmd(new Date());
  G('secStatsModal').classList.add('on');
  ssRender();
}
function ssPickSection(k){ _ssKey=k; ssRender(); }
function ssKind(k){ _ssKind=k; _ssAnchor=_hsYmd(new Date()); ssRender(); }
function ssMove(d){ _ssAnchor=hsShift(_ssKind,_ssAnchor,d); ssRender(); }
function ssRange(){
  if(_ssKind==='custom'){ return {from:_ssFrom||'2000-01-01', to:_ssTo||_hsYmd(new Date()), open:!(_ssFrom&&_ssTo)}; }
  return hsRange(_ssKind,_ssAnchor);
}
function ssCustom(){ _ssFrom=G('ss-from').value; _ssTo=G('ss-to').value; if(_ssFrom&&_ssTo&&_ssFrom>_ssTo){ toast('تاريخ «من» أكبر من «إلى»','error'); return; } if(_ssFrom&&_ssTo) ssRender(); }

async function ssRender(){
  const blocks=hsVisibleBlocks();
  G('ss-tabs').innerHTML=blocks.map(b=>`<div class="ss-tab ${b.perm===_ssKey?'on':''}" onclick="ssPickSection('${b.perm}')">${b.icon} ${b.title}</div>`).join('');
  G('ss-kinds').innerHTML=_SS_KINDS.map(([k,l])=>`<div class="ss-k ${k===_ssKind?'on':''}" onclick="ssKind('${k}')">${l}</div>`).join('');
  const r=ssRange();
  G('ss-nav').innerHTML = _ssKind==='custom'
    ? `<div class="fgrp" style="margin:0"><label>من</label><input type="date" id="ss-from" value="${_ssFrom}" onchange="ssCustom()"></div><div class="fgrp" style="margin:0"><label>إلى</label><input type="date" id="ss-to" value="${_ssTo}" onchange="ssCustom()"></div>`
    : `<button class="btn" onclick="ssMove(-1)">›</button><b style="min-width:170px;text-align:center">${r.from===r.to?fd(r.from):fd(r.from)+' ← '+fd(r.to)}</b><button class="btn" onclick="ssMove(1)">‹</button>`;
  const b=blocks.find(x=>x.perm===_ssKey); _ssBlock=b; _ssRes=null;
  const body=G('ss-body');
  if(_ssKind==='custom' && r.open){ body.innerHTML='<div class="empty"><i class="ti ti-calendar"></i><p>اختر تاريخ البداية والنهاية</p></div>'; return; }
  body.innerHTML='<div class="empty"><i class="ti ti-loader"></i><p>جاري التحميل...</p></div>';
  const tok=++_ssTok;
  try{ const res=await b.load(r); if(tok!==_ssTok) return; _ssRes=res; _ssRng=r;
    body.innerHTML=_hsBlockHtml(b,res);
    const nm=body.querySelector('.hs-names'); if(nm) nm.open=false;
  }catch(e){ if(tok!==_ssTok) return; body.innerHTML=_hsBlockHtml(b,null,e.message||String(e)); }
}
let _ssRng=null;

function ssExport(fmt){
  if(!_ssRes||!_ssBlock){ toast('لا توجد بيانات للتصدير','error'); return; }
  const b=_ssBlock, res=_ssRes, r=_ssRng, period=fd(r.from)+(r.from===r.to?'':' ← '+fd(r.to));
  const sections=[{title:'الملخص',headers:res.tiles.map(t=>t[0]),rows:[res.tiles.map(t=>t[1])]}];
  res.groups.filter(g=>g[1].length).forEach(([t,p])=>sections.push({title:t,headers:['البند','العدد'],rows:p.map(([k,v])=>[k,v])}));
  if(res.names&&res.names.length) sections.push({title:'أسماء المتبرعين ('+res.names.length+')',headers:['#','الاسم'],rows:res.names.map((n,i)=>[i+1,n])});
  const title='إحصائيات '+b.title, now=bbDmyTime(new Date());
  const E=x=>esc(x==null?'':String(x));
  if(fmt==='xls'){
    const tbl=s=>`<table border="1" style="border-collapse:collapse;margin-bottom:14px"><tr><th colspan="${s.headers.length}" style="background:#F3F4F6">${E(s.title)}</th></tr><tr style="background:#BE123C;color:#fff;font-weight:bold">${s.headers.map(h=>`<th>${E(h)}</th>`).join('')}</tr>${s.rows.map(rw=>'<tr>'+rw.map(c=>`<td>${E(c)}</td>`).join('')+'</tr>').join('')}</table>`;
    const html=`<html dir="rtl"><head><meta charset="UTF-8"></head><body><h2>مصرف الدم — واسط</h2><h3>${E(title)}</h3><p>الفترة: ${E(period)} | ${now}</p>${sections.map(tbl).join('')}</body></html>`;
    const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob(['﻿'+html],{type:'application/vnd.ms-excel;charset=utf-8'}));
    a.download=title+'_'+new Date().toISOString().split('T')[0]+'.xls'; a.click(); toast('✅ تم تصدير Excel','success',3000); return;
  }
  const tbl=s=>`<h3>${E(s.title)}</h3><table><thead><tr>${s.headers.map(h=>`<th>${E(h)}</th>`).join('')}</tr></thead><tbody>${s.rows.map(rw=>'<tr>'+rw.map(c=>`<td>${E(c)}</td>`).join('')+'</tr>').join('')}</tbody></table>`;
  printHtmlDocument(`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${E(title)}</title><style>
    @page{size:A4 portrait;margin:12mm} *{box-sizing:border-box} body{font-family:Arial,Tahoma,sans-serif;color:#111;margin:0;font-size:12px}
    .hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #BE123C;padding-bottom:8px;margin-bottom:12px}
    .hd .o{font-size:13px;color:#555}.hd h1{margin:0;color:#BE123C;font-size:22px}.hd .m{font-size:12px;color:#555;text-align:left}
    h3{margin:14px 0 6px;font-size:14px;color:#BE123C;border-right:4px solid #BE123C;padding-right:8px;page-break-after:avoid}
    table{width:100%;border-collapse:collapse;margin-bottom:6px} tr{page-break-inside:avoid}
    th,td{unicode-bidi:plaintext;border:1px solid #cfcfcf;padding:5px 6px;text-align:center} th{background:#BE123C;color:#fff} tbody tr:nth-child(even){background:#f8f8f8}
    .ft{margin-top:14px;border-top:1px solid #ccc;padding-top:6px;color:#777;font-size:11px;display:flex;justify-content:space-between}
  </style></head><body>
    <div class="hd"><div><div class="o">مصرف الدم الرئيسي — واسط</div><h1>${E(title)}</h1></div><div class="m">الفترة: ${E(period)}<br>تاريخ الطباعة: ${now}</div></div>
    ${sections.map(tbl).join('')}
    <div class="ft"><span>تطبيق كرار</span><span>${E(UPROF?.full_name||'')}</span></div>
    <script>setTimeout(function(){window.print()},500)<\/script></body></html>`);
}
