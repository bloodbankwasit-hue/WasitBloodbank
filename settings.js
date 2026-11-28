// ================================================================
// SETTINGS (misc)
// ================================================================
function showAbout(){
  toast('نظام مصرف الدم — واسط | الإصدار 2.0.0 | Powered by Supabase + GitHub Pages','info',6000);
}

const WIPE_SCOPES = {
  donations:{t:'المتبرعون والتبرعات',d:'كل التبرعات (حسب تاريخ التبرع) + المتبرعون الذين لم يبقَ لهم تبرع. حذف ناعم (يمكن استرجاعه من قاعدة البيانات).'},
  dispatch:{t:'التجهيز',d:'تجهيز الرصيد الخارجي + «تجهيز بكتاب» + القناني المجهّزة (حسب تاريخ التبرع). الأولان حذف دائم.'},
  opening:{t:'الرصيد الخارجي',d:'كل أعداد الرصيد الخارجي (تصفير). دائم. لا يخضع للتاريخ.'},
  rare:{t:'الفصائل النادرة',d:'تبرعات الفصائل النادرة (A- B- O- AB- A+ AB+) حسب التاريخ. حذف ناعم.'},
  rejected:{t:'المصابون والمرفوضون',d:'سجل المرفوضين (حسب تاريخ الرفض). دائم.'},
  audit:{t:'سجل التتبع',d:'سجل العمليات (حسب التاريخ). دائم.'}
};
function dangerZone(){
  if(UPROF?.role!=='admin'){toast('هذا الإجراء متاح للمدير فقط','error'); return;}
  let m=document.getElementById('wipeModal'); if(m) m.remove();
  m=document.createElement('div'); m.id='wipeModal';
  m.style.cssText='position:fixed;inset:0;z-index:99980;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:14px';
  m.innerHTML='<div style="background:#fff;border-radius:14px;padding:20px;max-width:520px;width:100%;max-height:92vh;overflow:auto;box-shadow:0 10px 40px rgba(0,0,0,.35);direction:rtl">'
   +'<div style="font-size:18px;font-weight:800;color:#BE123C;margin-bottom:4px">⚠️ حذف / تصفير بيانات</div>'
   +'<div style="font-size:13.5px;color:#6B7280;margin-bottom:12px">يُحمَّل نسخة احتياطية تلقائياً قبل التنفيذ. اترك التاريخ فارغاً لحذف القسم كاملاً.</div>'
   +'<label style="font-weight:700;font-size:14px">القسم</label><select id="wp-scope" style="width:100%;padding:9px;margin:4px 0 6px" onchange="wipeScopeChange()">'+Object.entries(WIPE_SCOPES).map(([k,v])=>'<option value="'+k+'">'+v.t+'</option>').join('')+'</select>'
   +'<div id="wp-desc" style="font-size:13px;color:#374151;margin-bottom:10px"></div>'
   +'<div id="wp-dates" style="display:flex;gap:8px;margin-bottom:10px"><div style="flex:1"><label style="font-size:13px">من تاريخ</label><input type="date" id="wp-from" style="width:100%;padding:8px" onchange="wipeClearPrev()"></div><div style="flex:1"><label style="font-size:13px">إلى تاريخ</label><input type="date" id="wp-to" style="width:100%;padding:8px" onchange="wipeClearPrev()"></div></div>'
   +'<div id="wp-prev" style="padding:10px;border:1px solid #E5E7EB;border-radius:10px;margin-bottom:10px;font-weight:700;min-height:20px">اضغط «معاينة العدد» أولاً</div>'
   +'<div id="wp-conf" style="display:none;margin-bottom:10px"><label style="font-size:13px">اكتب كلمة <b>حذف</b> للتأكيد</label><input type="text" id="wp-word" style="width:100%;padding:9px;margin-top:4px" autocomplete="off"></div>'
   +'<div style="display:flex;gap:8px"><button class="btn" onclick="wipePreview()" style="flex:1;justify-content:center">معاينة العدد</button><button class="btn btn-p" id="wp-go" onclick="wipeRun()" style="flex:1;justify-content:center;background:#BE123C" disabled>حذف</button><button class="btn" onclick="document.getElementById(\'wipeModal\').remove()" style="flex:1;justify-content:center">إلغاء</button></div></div>';
  document.body.appendChild(m); wipeScopeChange();
}
function wipeScopeChange(){ const k=document.getElementById('wp-scope').value; document.getElementById('wp-desc').textContent=WIPE_SCOPES[k].d; document.getElementById('wp-dates').style.display=(k==='opening')?'none':'flex'; wipeClearPrev(); }
function wipeClearPrev(){ document.getElementById('wp-prev').textContent='اضغط «معاينة العدد» أولاً'; document.getElementById('wp-conf').style.display='none'; document.getElementById('wp-go').disabled=true; window._wipeN=null; }
function _wipeArgs(){ const k=document.getElementById('wp-scope').value; return {p_scope:k,p_from:(k==='opening'?null:document.getElementById('wp-from').value)||null,p_to:(k==='opening'?null:document.getElementById('wp-to').value)||null}; }
async function wipePreview(){
  if(!IS_ONLINE){ toast('يحتاج اتصالاً بالإنترنت','warning'); return; }
  load(true);
  try{
    const r=await db.rpc('admin_wipe',Object.assign(_wipeArgs(),{p_dry:true}));
    if(r.error) throw r.error;
    window._wipeN=r.data||0;
    const box=document.getElementById('wp-prev');
    box.innerHTML='سيُحذف: <span style="color:#BE123C;font-size:18px">'+window._wipeN+'</span> سجل';
    document.getElementById('wp-conf').style.display=window._wipeN>0?'block':'none';
    document.getElementById('wp-go').disabled=!(window._wipeN>0);
  }catch(e){ toast(/Could not find the function|schema cache|does not exist/i.test(e.message||'')?'شغّل ملف admin_wipe.sql في Supabase أولاً':'خطأ: '+(e.message||e),'error',7000); }
  finally{ load(false); }
}
async function wipeRun(){
  if(UPROF?.role!=='admin') return;
  if((document.getElementById('wp-word').value||'').trim()!=='حذف'){ toast('اكتب كلمة حذف للتأكيد','error'); return; }
  const a=_wipeArgs();
  load(true);
  try{
    // نسخة احتياطية إلزامية قبل الحذف: إن فشلت لا يُحذف شيء
    try{ if(typeof exportFullBackup!=='function') await loadSectionScript('backup'); if(!(await exportFullBackup())) throw new Error('أُلغيت أو فشلت'); }catch(e){ throw new Error('فشلت النسخة الاحتياطية قبل الحذف — لم يُحذف شيء ('+(e.message||e)+')'); }
    const r=await db.rpc('admin_wipe',Object.assign({},a,{p_dry:false}));
    if(r.error) throw r.error;
    try{ await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'DELETE',table_name:'admin_wipe',record_id:null,new_values:{scope:WIPE_SCOPES[a.p_scope].t,from:a.p_from,to:a.p_to,count:r.data}}); }catch(e){}
    document.getElementById('wipeModal')?.remove();
    toast('✅ تم حذف '+r.data+' سجل من «'+WIPE_SCOPES[a.p_scope].t+'»','success',7000);
  }catch(e){ toast('⛔ '+(e.message||e),'error',9000); }
  finally{ load(false); }
}
