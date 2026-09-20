// ================================================================
// BOTTLE SEQUENCES MANAGEMENT
// ================================================================
async function loadSeqGrid(){
  const grid = G('seqGrid');
  if(!grid) return;
  const{data,error}=await db.from('bottle_sequences').select('*').order('bottle_type');
  if(error||!data){ grid.innerHTML='<div class="empty"><p>تعذّر التحميل</p></div>'; return; }
  if(!data.length){ grid.innerHTML='<div class="empty"><p>لا توجد تسلسلات</p></div>'; return; }

  grid.innerHTML = data.map(s=>{
    const remain = s.end_number - s.current_number;
    const pct = ((s.current_number - s.start_number)/(s.end_number - s.start_number)*100).toFixed(0);
    const cls = remain > 500 ? 'ok' : remain > 100 ? 'warn' : 'danger';
    return `<div class="seq-card ${s.is_active?'active':''}">
      <button class="seq-edit" onclick="openEditSeq('${s.id}','${s.bottle_type}',${s.current_number},${s.end_number})">تعديل</button>
      <div class="seq-type">${s.bottle_type}</div>
      <div class="seq-num">${s.current_number}</div>
      <div class="seq-range">${s.start_number} ← ${s.end_number}</div>
      <div class="seq-remain ${cls}">متبقي: ${remain} قنينة (${pct}%)</div>
    </div>`;
  }).join('');
}

function openAddSeqModal(){
  ['sq-from','sq-to','sq-notes'].forEach(id=>{const e=G(id);if(e)e.value='';});
  G('sq-type').value='مفلتر';
  G('addSeqModal').classList.add('on');
}

async function saveNewSeq(){
  const type=G('sq-type').value;
  const from=parseInt(G('sq-from').value);
  const to=parseInt(G('sq-to').value);
  const notes=G('sq-notes').value.trim();
  if(!type||!from||!to||from>=to){toast('تحقق من البيانات','error');return;}
  load(true);
  const{error}=await db.from('bottle_sequences').insert({
    bottle_type:type,start_number:from,end_number:to,current_number:from,
    is_active:true,notes:notes||null
  });
  load(false);
  if(error){toast('خطأ: '+error.message,'error');return;}
  toast('✅ تم إضافة تسلسل '+type,'success');
  G('addSeqModal').classList.remove('on');
  await loadSeqGrid();
}

function openEditSeq(id,type,current,end){
  G('esq-id').value=id;
  G('esq-type-lbl').textContent=type;
  G('esq-current-lbl').textContent='الرقم الحالي: '+current+' | النهاية: '+end;
  G('esq-current').value=current;
  G('esq-to').value=end;
  G('editSeqModal').classList.add('on');
}

async function saveEditSeq(){
  const id=G('esq-id').value;
  const current=parseInt(G('esq-current').value);
  const to=parseInt(G('esq-to').value);
  if(!current||!to||current>to){toast('تحقق من الأرقام','error');return;}
  load(true);
  const{error}=await db.from('bottle_sequences').update({current_number:current,end_number:to}).eq('id',id);
  load(false);
  if(error){toast('خطأ: '+error.message,'error');return;}
  toast('✅ تم تحديث التسلسل','success');
  G('editSeqModal').classList.remove('on');
  await loadSeqGrid();
}
