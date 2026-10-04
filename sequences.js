// ================================================================
// BOTTLE SEQUENCES MANAGEMENT
// ================================================================
async function loadSeqGrid(){
  const grid = G('seqGrid');
  if(!grid) return;
  const{data,error}=await db.from('bottle_sequences').select('*').order('bottle_type');
  if(error||!data){ grid.innerHTML='<div class="empty"><p>تعذّر التحميل</p></div>'; return; }
  if(!data.length){ grid.innerHTML='<div class="empty"><p>لا توجد تسلسلات</p></div>'; return; }

  // Reception always uses the NEWEST active sequence of a bottle type; any older active one of the
  // same type is ignored (and never used as a fallback), so it is flagged on its card.
  const inUse={};
  data.filter(s=>s.is_active).forEach(s=>{
    const c=inUse[s.bottle_type];
    if(!c || String(s.created_at)>String(c.created_at)) inUse[s.bottle_type]=s;
  });
  grid.innerHTML = data.map(s=>{
    const remain = Math.max(0, s.end_number - s.current_number + 1);   // current_number is the NEXT unused number
    const span = s.end_number - s.start_number;
    const pct = span>0 ? Math.min(100, Math.max(0, (s.current_number - s.start_number)/span*100)).toFixed(0) : '0';
    const cls = remain > 500 ? 'ok' : remain > 100 ? 'warn' : 'danger';
    const ignored = s.is_active && inUse[s.bottle_type] && inUse[s.bottle_type].id!==s.id;
    return `<div class="seq-card ${s.is_active?'active':''}">
      <button class="seq-edit" onclick="openEditSeq('${s.id}','${s.bottle_type}',${s.current_number},${s.end_number},${s.start_number})">تعديل</button>
      <div class="seq-type">${s.bottle_type}</div>
      <div class="seq-num">${s.current_number}</div>
      <div class="seq-range">${s.start_number} ← ${s.end_number}</div>
      <div class="seq-remain ${cls}">متبقي: ${remain} قنينة (${pct}%)</div>
      ${ignored?'<div style="margin-top:6px;font-size:13.5px;font-weight:700;color:#B45309">⚠ غير مستخدم — يوجد تسلسل أحدث لنفس النوع (احذفه من «تعديل»)</div>':''}
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
  refreshExpiryNotifications();
}

function openEditSeq(id,type,current,end,start){
  G('esq-id').value=id;
  G('esq-start').value=start||'';
  G('esq-type-lbl').textContent=type;
  G('esq-current-lbl').textContent='الرقم الحالي: '+current+' | النهاية: '+end;
  G('esq-current').value=current;
  G('esq-to').value=end;
  G('editSeqModal').classList.add('on');
}

// Delete a sequence (e.g. a duplicate of the same type). Bottles already registered keep their numbers.
async function deleteSeq(){
  const id=G('esq-id').value, type=G('esq-type-lbl').textContent;
  if(!confirm('حذف تسلسل «'+type+'»؟\n'+G('esq-current-lbl').textContent+'\n\nالقناني المسجّلة سابقاً ما تتأثر. هل تريد الحذف؟')) return;
  load(true);
  const{data,error}=await db.from('bottle_sequences').delete().eq('id',id).select();
  load(false);
  if(error){toast('خطأ: '+error.message,'error');return;}
  if(!data||!data.length){toast('لم يُحذف — لا توجد صلاحية للحذف','error');return;}
  await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'DELETE',table_name:'bottle_sequences',record_id:id,old_values:data[0]});
  toast('🗑️ تم حذف التسلسل','success');
  G('editSeqModal').classList.remove('on');
  await loadSeqGrid();
  refreshExpiryNotifications();
}

async function saveEditSeq(){
  const id=G('esq-id').value;
  const current=parseInt(G('esq-current').value);
  const to=parseInt(G('esq-to').value);
  if(!current||!to||current>to){toast('تحقق من الأرقام','error');return;}
  load(true);
  // If the current number is moved BELOW the original start (refilling with older numbers), the start
  // follows it, otherwise the card's progress percentage would be meaningless.
  const oldStart=parseInt(G('esq-start').value);
  const upd={current_number:current,end_number:to};
  if(oldStart && current<oldStart) upd.start_number=current;
  const{error}=await db.from('bottle_sequences').update(upd).eq('id',id);
  load(false);
  if(error){toast('خطأ: '+error.message,'error');return;}
  toast('✅ تم تحديث التسلسل','success');
  G('editSeqModal').classList.remove('on');
  await loadSeqGrid();
  refreshExpiryNotifications();
}
