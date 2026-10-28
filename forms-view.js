// ================================================================
// FORMS VIEW — عرض الاستمارات المشترك لوحدات العمل (السحب، ثم التصنيف والفيروسات والفصل)
// الاستمارة = مجموعة حتى 10 أسماء (نفس استمارة السحب A4). كل وحدة تعرض الاستمارة وأسماءها بألوان:
//   أخضر = جاهز لعملي  |  إطار أحمر = غير جاهز بعد  |  رمادي ✓ = أنجزته هذه الوحدة  |  أحمر مظلل = خرج (تالف/مرفوض...) مع السبب
// عند انتهاء كل أسماء الاستمارة من عمل الوحدة تنتقل لأرشيفها، ويمكن التعديل من الأرشيف خلال نفس يوم العمل فقط.
// كل وحدة تمرّر إعدادات cfg: { unit, host, groups, chk, onSel, bigBottle, stateOf(m), workDate(m), sub(m), actions(m,st,ctx),
//                              bulkBar(), legacy() }
// ================================================================
const FV = (function(){
  const units = {};
  const GN = { T:'تريما', R:'ريفيوس', B:'بقية الأنواع', A:'قديمة' };
  const esc2 = s => (typeof esc==='function' ? esc(s) : String(s==null?'':s));
  const dfmt = v => { if(!v) return ''; const d=new Date(v); return isNaN(d)?'':d.toLocaleDateString('en-CA').replace(/-/g,'/'); };
  const today = () => new Date().toLocaleDateString('en-CA');

  (function css(){
    if(document.getElementById('fv-css')) return;
    const s=document.createElement('style'); s.id='fv-css';
    s.textContent=`
.fv-top{display:flex;flex-direction:column;gap:8px;margin-bottom:10px}
.fv-search{width:100%;padding:10px 12px;border:1px solid #D1D5DB;border-radius:10px;font-size:15px}
.fv-tabs{display:flex;gap:6px}.fv-tabs button{flex:1;justify-content:center}
.fv-card{display:flex;align-items:center;gap:10px;padding:12px 14px;border:1px solid #E5E7EB;border-radius:12px;background:#fff;margin-bottom:8px;cursor:pointer}
.fv-no{min-width:54px;text-align:center;font-weight:800;font-size:19px;color:#BE123C}
.fv-mid{flex:1;min-width:0}.fv-mid b{font-size:16px}.fv-sub{font-size:13px;color:#6B7280;margin-top:2px}
.fv-badges{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;max-width:46%}
.fv-b{font-size:12.5px;font-weight:700;padding:3px 8px;border-radius:999px;white-space:nowrap}
.fv-b.g{background:#DCFCE7;color:#166534}.fv-b.r{background:#fff;color:#B91C1C;border:1.5px solid #DC2626}.fv-b.d{background:#F3F4F6;color:#4B5563}.fv-b.x{background:#FEE2E2;color:#991B1B}.fv-b.o{background:#DBEAFE;color:#1E40AF}
.fv-back{display:inline-flex;align-items:center;gap:6px;cursor:pointer;color:#BE123C;font-weight:700;margin-bottom:8px}
.fv-head{padding:10px 12px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;margin-bottom:10px;font-size:14.5px}
.fv-m.fv-ready{border:2px solid #16A34A !important}
.fv-m.fv-notready{border:2px solid #DC2626 !important;background:#fff}
.fv-m.fv-done{border:1px solid #D1D5DB !important;background:#F9FAFB}
.fv-m.fv-excl{border:2px solid #DC2626 !important;background:#FEE2E2}
.fv-m.fv-excl .fc-name,.fv-m.fv-excl .fc-sub.fv-nm{text-decoration:line-through}
.fv-st{font-size:13px;font-weight:700;margin-top:3px}
.fv-st.ready{color:#166534}.fv-st.notready{color:#6B7280}.fv-st.done{color:#4B5563}.fv-st.excl{color:#991B1B}`;
    document.head.appendChild(s);
  })();

  async function rpc(fn,args){ const r=await db.rpc(fn,args||{}); if(r.error) throw r.error; return r.data; }

  async function loadData(u){
    const forms = await rpc('forms_recent',{p_groups:u.cfg.groups,p_limit:60}) || [];
    const ids = forms.map(f=>f.id), by = {};
    if(ids.length){ (await rpc('form_members',{p_forms:ids}) || []).forEach(m=>{ (by[m.form_id]=by[m.form_id]||[]).push(m); }); }
    // وحدات المختبر تخفي أصل التريما وتدمج ناتجيه بقنينة واحدة (cfg.filter / cfg.dedup)
    if(u.cfg.filter || u.cfg.dedup){
      Object.keys(by).forEach(fid=>{
        const seen=new Set();
        by[fid]=by[fid].filter(m=>{
          if(u.cfg.filter && !u.cfg.filter(m)) return false;
          if(u.cfg.dedup){ const k=u.cfg.dedup(m); if(seen.has(k)) return false; seen.add(k); }
          return true;
        });
      });
    }
    u.forms = forms; u.by = by;
  }
  function counts(u,f){
    const c={ready:0,notready:0,done:0,excl:0}, ms=u.by[f.id]||[];
    ms.forEach(m=>{ c[u.cfg.stateOf(m).k]++; });
    c.total=ms.length; return c;
  }
  const isActive = (u,f)=>{ const c=counts(u,f); return f.status==='open' || c.ready+c.notready>0; };

  function card(u,f){
    const c=counts(u,f);
    const b=[];
    if(f.status==='open') b.push('<span class="fv-b o">مفتوحة</span>');
    if(c.ready) b.push(`<span class="fv-b g">${c.ready} جاهز</span>`);
    if(c.notready) b.push(`<span class="fv-b r">${c.notready} غير جاهز</span>`);
    if(c.done) b.push(`<span class="fv-b d">${c.done} أُنجز</span>`);
    if(c.excl) b.push(`<span class="fv-b x">${c.excl} خرج</span>`);
    return `<div class="fv-card" onclick="FV.open('${u.cfg.unit}','${f.id}')">
      <div class="fv-no">#${f.form_no}</div>
      <div class="fv-mid"><b>استمارة ${GN[f.form_group]||''}</b><div class="fv-sub">${dfmt(f.last_name_at)} — ${c.total} أسماء</div></div>
      <div class="fv-badges">${b.join('')}</div></div>`;
  }

  function memberCard(u,m,archive){
    const cfg=u.cfg, st=cfg.stateOf(m), k=st.k;
    const ctx={archive, canEdit: archive && (k==='done') && String(cfg.workDate?cfg.workDate(m)||'':'').slice(0,10)===today()};
    const chk = (k==='ready' && !archive && cfg.chk) ? `<input type="checkbox" class="${cfg.chk}" value="${m.id}" data-bt="${esc2(m.bottle_type||'')}" onclick="${cfg.onSel}()" style="width:18px;height:18px;flex-shrink:0">` : '<span style="width:18px;flex-shrink:0"></span>';
    const name = esc2(m.full_name||'—');
    const lines = cfg.bigBottle
      ? `<div class="fc-name fc-bn">${esc2(m.bottle_number||'—')}</div><div class="fc-sub fc-dn fv-nm">${name} — ${esc2(m.bottle_type||'')}</div>`
      : `<div class="fc-name">${name}</div><div class="fc-sub">${esc2(cfg.sub(m))}</div>`;
    const tag = st.t ? `<div class="fv-st ${k}">${esc2(st.t)}</div>` : '';
    const act = cfg.actions ? cfg.actions(m,st,ctx) : '';
    return `<div class="flow-card fv-m fv-${k}">${chk}<div class="fc-av">${typeof BAG!=='undefined'?BAG:''}</div><div style="flex:1;min-width:0">${lines}${tag}</div><div class="fc-act">${act}</div></div>`;
  }

  async function render(unit){
    const u=units[unit]; if(!u) return;
    const host=G(u.cfg.host); if(!host) return;
    try{
      if(!u.forms || u.reload!==false){ load(true); try{ await loadData(u); } finally{ load(false); } }
      u.reload=true;
      if(u.view==='detail') return renderDetail(u,host);
      renderList(u,host);
    }catch(e){ host.innerHTML='<div class="empty"><i class="ti ti-alert-circle"></i><p>تعذر التحميل: '+esc2(e.message||String(e))+'<br><small>تأكد من تشغيل SQL الاستمارات</small></p></div>'; }
  }

  async function renderList(u,host){
    const arch = u.tab==='archive';
    const list = u.forms.filter(f=> arch ? !isActive(u,f) : isActive(u,f));
    const top = `<div class="fv-top">
      <input class="fv-search" id="fv-q-${u.cfg.unit}" placeholder="🔍 ابحث بالاسم في كل الاستمارات" value="${esc2(u.q||'')}" oninput="FV.search('${u.cfg.unit}',this.value)">
      <div class="fv-tabs"><button class="btn ${arch?'':'btn-p'}" onclick="FV.tab('${u.cfg.unit}','active')">الاستمارات</button><button class="btn ${arch?'btn-p':''}" onclick="FV.tab('${u.cfg.unit}','archive')">الأرشيف</button></div></div>`;
    let body = list.length ? list.map(f=>card(u,f)).join('') : `<div class="empty"><i class="ti ti-check"></i><p>${arch?'لا توجد استمارات في الأرشيف':'لا توجد استمارات بانتظار هذه الوحدة'}</p></div>`;
    let legacy='';
    if(!arch && u.cfg.legacy){ try{ legacy = await u.cfg.legacy(); }catch(e){} }
    host.innerHTML = top + `<div id="fv-res-${u.cfg.unit}"></div><div id="fv-list-${u.cfg.unit}">${body}${legacy}</div>`;
    if(u.q && u.q.trim().length>=2) FV.search(u.cfg.unit,u.q,true);
  }

  async function renderDetail(u,host){
    const f = u.forms.find(x=>x.id===u.formId) || (u.extra||{})[u.formId];
    if(!f){ u.view='list'; return renderList(u,host); }
    const ms = u.by[f.id]||[];
    const arch = !isActive(u,f) ;
    const anyReady = ms.some(m=>u.cfg.stateOf(m).k==='ready');
    const head = `<div class="fv-back" onclick="FV.back('${u.cfg.unit}')"><i class="ti ti-arrow-right"></i> رجوع للاستمارات</div>
      <div class="fv-head"><b>استمارة #${f.form_no} — ${GN[f.form_group]||''}</b> — ${dfmt(f.last_name_at)} — ${ms.length} أسماء${f.status==='open'?' (مفتوحة: تُضاف لها أسماء جديدة)':''}${arch?' — <b>الأرشيف</b>: التعديل متاح خلال يوم العمل فقط':''}</div>`;
    const bar = (!arch && u.cfg.bulkBar) ? u.cfg.bulkBar() : '';
    const sel = (!arch && u.cfg.chk) ? selAllRow(u.cfg.chk,u.cfg.onSel,anyReady) : '';
    host.innerHTML = head + bar + sel + (ms.length ? ms.map(m=>memberCard(u,m,arch)).join('') : '<div class="empty"><p>لا توجد أسماء بهذه الاستمارة</p></div>');
  }

  // مجلدات الحملات: قناني الحملة تبقى خارج الاستمارات وتظهر كمجلد باسم الحملة يُفتح لقنانيه
  // opts: {chk,onSel,bulkLabel,bulkFn,row(r)->html}
  function folders(rows,opts){
    const by={}; (rows||[]).forEach(r=>{ const k=r.campaign_name||'حملة'; (by[k]=by[k]||[]).push(r); });
    const ks=Object.keys(by); if(!ks.length) return '';
    return '<div style="margin:14px 0 6px;font-weight:700;color:#6B7280">🚐 الحملات</div>'+ks.map((k,i)=>{
      const id='fvf-'+Math.random().toString(36).slice(2,8)+i;
      return `<details class="fv-folder" style="border:1px solid #E5E7EB;border-radius:12px;background:#fff;margin-bottom:8px;padding:6px 10px">
        <summary style="cursor:pointer;font-weight:800;font-size:16px;padding:6px 0">📁 ${esc2(k)} <span class="fv-b g" style="margin-right:6px">${by[k].length} قنينة</span></summary>
        <div id="${id}" style="padding-top:6px">
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
            <button class="btn" onclick="(function(b){var bx=b.closest('details').querySelectorAll('.${opts.chk}');var all=[].every.call(bx,function(c){return c.checked});bx.forEach(function(c){c.checked=!all});${opts.onSel}()})(this)">تحديد الكل / إلغاء</button>
            ${opts.bulkFn?`<button class="btn btn-p" onclick="${opts.bulkFn}">${opts.bulkLabel||'تنفيذ للمحدد'}</button>`:''}
          </div>
          ${by[k].map(opts.row).join('')}
        </div></details>`;
    }).join('');
  }

  let _qt=null;
  return { folders,
    async show(cfg){
      const prev=units[cfg.unit];
      units[cfg.unit]={cfg, view:'list', tab:'active', q:'', forms:null, by:{}, extra:{}};
      await render(cfg.unit);
    },
    async refresh(unit){ if(!units[unit]) return; units[unit].reload=true; await render(unit); },
    async open(unit,id){ const u=units[unit]; if(!u) return; u.formId=id; u.view='detail';
      if(!(u.by[id])){ try{ load(true); (await rpc('form_members',{p_forms:[id]})||[]).forEach(m=>{ (u.by[id]=u.by[id]||[]).push(m); }); u.by[id]=u.by[id]||[]; } finally{ load(false); } }
      u.reload=false; await render(unit); window.scrollTo&&window.scrollTo(0,0); },
    async back(unit){ const u=units[unit]; if(!u) return; u.view='list'; u.reload=true; await render(unit); },
    async tab(unit,t){ const u=units[unit]; if(!u) return; u.tab=t; u.view='list'; u.reload=false; await render(unit); },
    search(unit,q,immediate){
      const u=units[unit]; if(!u) return; u.q=q||'';
      clearTimeout(_qt);
      const run=async()=>{
        const res=G('fv-res-'+unit), lst=G('fv-list-'+unit); if(!res) return;
        const t=(u.q||'').trim();
        if(t.length<2){ res.innerHTML=''; if(lst) lst.style.display=''; return; }
        try{
          const rows=await rpc('search_form_members',{p_q:t,p_groups:u.cfg.groups})||[];
          rows.forEach(r=>{ u.extra[r.form_id]={id:r.form_id,form_no:r.form_no,form_group:r.form_group,last_name_at:r.last_name_at,status:'closed'}; });
          if(lst) lst.style.display='none';
          res.innerHTML = rows.length ? rows.map(r=>`<div class="fv-card" onclick="FV.open('${unit}','${r.form_id}')"><div class="fv-no">#${r.form_no}</div><div class="fv-mid"><b>${esc2(r.full_name)}</b><div class="fv-sub">استمارة ${GN[r.form_group]||''} — ${dfmt(r.last_name_at)} — قنينة ${esc2(r.bottle_number||'—')} (${esc2(r.bottle_type||'')})</div></div></div>`).join('') : '<div class="empty"><p>لا توجد نتائج</p></div>';
        }catch(e){ res.innerHTML='<div class="empty"><p>تعذر البحث: '+esc2(e.message||String(e))+'</p></div>'; }
      };
      if(immediate) run(); else _qt=setTimeout(run,350);
    }
  };
})();
