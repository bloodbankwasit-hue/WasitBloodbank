// قياس الأداء — للمدير. يعرض: زمن الاتصال بالخادم، أبطأ الطلبات منذ فتح التطبيق، وتجمّد الواجهة.
function _pfMed(a){ a=a.slice().sort((x,y)=>x-y); return a.length?a[Math.floor(a.length/2)]:0; }
function _pfName(u){
  try{ const x=new URL(u); let p=x.pathname.replace('/rest/v1/',''); if(p.indexOf('rpc/')===0) return 'rpc: '+p.slice(4);
    if(p.indexOf('/auth/')>=0||x.pathname.indexOf('/auth/')>=0) return 'auth'; return p||x.pathname; }catch(e){ return u.slice(0,40); }
}
function _pfStats(){
  const r=(window.__perf&&window.__perf.reqs)||[], by={};
  r.forEach(q=>{ const k=_pfName(q.u); (by[k]=by[k]||[]).push(q.ms); });
  const rows=Object.keys(by).map(k=>({k,n:by[k].length,avg:Math.round(by[k].reduce((a,b)=>a+b,0)/by[k].length),max:Math.max(...by[k]),sum:by[k].reduce((a,b)=>a+b,0)})).sort((a,b)=>b.sum-a.sum);
  return{n:r.length,tot:r.reduce((a,b)=>a+b.ms,0),med:_pfMed(r.map(q=>q.ms)),rows,slow:r.slice().sort((a,b)=>b.ms-a.ms).slice(0,8)};
}
function perfOpen(){
  let ov=G('pfOv'); if(ov) ov.remove();
  ov=document.createElement('div'); ov.className='overlay on'; ov.id='pfOv'; ov.style.zIndex=9000;
  ov.innerHTML='<div class="modal" style="width:min(620px,96vw);max-height:92vh"><div class="modal-title"><i class="ti ti-gauge"></i> قياس الأداء</div><div class="modal-body" id="pfBody" style="overflow:auto"></div><div class="modal-foot"><button class="btn" onclick="G(\'pfOv\').remove()">إغلاق</button><button class="btn" onclick="perfRender()"><i class="ti ti-refresh"></i> تحديث</button><button class="btn btn-p" id="pfTest" onclick="perfTest()"><i class="ti ti-bolt"></i> اختبار السرعة الآن</button></div></div>';
  document.body.appendChild(ov); perfRender();
}
function perfRender(extra){
  const s=_pfStats(), L=(window.__perf&&window.__perf.long)||[], lsum=L.reduce((a,b)=>a+b,0);
  const col=ms=>ms>600?'#B91C1C':ms>250?'#B45309':'#166534';
  const box=(v,l,c)=>'<div style="flex:1;min-width:110px;text-align:center;border:1.5px solid #E5E7EB;border-radius:12px;padding:8px"><div style="font-size:22px;font-weight:900;color:'+c+'">'+v+'</div><div style="font-size:13px;font-weight:700;color:#475569">'+l+'</div></div>';
  G('pfBody').innerHTML=(extra||'')+'<div style="font-weight:800;margin:6px 0">منذ فتح التطبيق على هذا الجهاز</div>'
   +'<div style="display:flex;gap:8px;flex-wrap:wrap">'+box(s.n,'طلب لقاعدة البيانات','#1D4ED8')+box(s.med+' ms','وسيط زمن الطلب',col(s.med))+box((s.tot/1000).toFixed(1)+' ث','مجموع وقت الانتظار',col(s.tot/Math.max(1,s.n)))+box(L.length+' / '+(lsum/1000).toFixed(1)+' ث','تجمّد الواجهة (مرات / مجموع)',lsum>1500?'#B91C1C':'#166534')+'</div>'
   +'<div style="font-weight:800;margin:12px 0 4px">أكثر ما استهلك وقتاً (حسب الجدول)</div>'
   +s.rows.slice(0,10).map(r=>'<div style="border-bottom:1px solid #EEF2F6;padding:6px 0;direction:ltr;text-align:left"><div style="font-weight:800;font-size:14px;word-break:break-all">'+esc(r.k.slice(0,50))+'</div><div style="font-size:13px;color:#475569">× '+r.n+' &nbsp;|&nbsp; avg <b style="color:'+col(r.avg)+'">'+r.avg+'</b> &nbsp;|&nbsp; max '+r.max+' &nbsp;|&nbsp; sum '+r.sum+' ms</div></div>').join('')
   +'<div style="font-size:13px;color:#6B7280;margin-top:8px">الأرقام بالملّي ثانية. استعمل التطبيق (افتح الأقسام التي تبدو بطيئة) ثم اضغط «تحديث» وصوّر الشاشة وأرسلها لي.</div>';
}
async function perfTest(){
  const btn=G('pfTest'); btn.disabled=true; btn.textContent='جاري القياس…';
  const out={};
  const time=async f=>{ const t=performance.now(); try{ await f(); }catch(e){} return Math.round(performance.now()-t); };
  try{
    const pings=[]; for(let i=0;i<5;i++) pings.push(await time(()=>fetch(SURL+'/rest/v1/',{headers:{apikey:SKEY}})));
    out.ping=_pfMed(pings); out.pmin=Math.min(...pings);
    out.one=await time(()=>db.from('donors').select('id').limit(1));
    out.cnt=await time(()=>db.from('donors').select('id',{count:'exact',head:true}).eq('is_deleted',false));
    out.srch=await time(()=>db.from('donors').select('id,full_name').ilike('full_name','%محمد%').limit(50));
    out.bd=await time(()=>db.from('blood_donations').select('id',{count:'exact',head:true}).eq('is_deleted',false));
    out.cdn=await time(()=>fetch('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.39.0/dist/umd/supabase.js',{cache:'no-store'}));
  }catch(e){}
  const v=out.one, verdict=v<120?'ممتاز':v<300?'متوسط':'بطيء — التأخير في قاعدة البيانات نفسها';
  const row=(l,ms)=>'<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid #F3E8B8;font-size:14px"><span>'+l+'</span><b style="color:'+(ms>600?'#B91C1C':ms>250?'#B45309':'#166534')+';white-space:nowrap">'+ms+' ms</b></div>';
  const html='<div style="border:2px solid #FDE68A;background:#FFFBEB;border-radius:12px;padding:10px;margin-bottom:10px"><div style="font-weight:900">نتيجة الاختبار: قراءة صف واحد '+out.one+' ms ('+verdict+') — اتصال فارغ '+out.ping+' ms'+'</div>'
    +row('اتصال فارغ بالخادم (الوسيط)',out.ping,'')
    +row('قراءة صف واحد من donors',out.one,'')
    +row('عدّ المتبرعين',out.cnt,'')
    +row('بحث اسم «محمد»',out.srch,'')
    +row('عدّ قناني الدم',out.bd,'')
    +row('تحميل مكتبة Supabase (CDN)',out.cdn,'')
    +'</div>';
  btn.disabled=false; btn.innerHTML='<i class="ti ti-bolt"></i> اختبار السرعة الآن'; perfRender(html);
}
