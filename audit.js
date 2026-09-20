async function loadAudit(){
  load(true);
  const {data}=await db.from('audit_log').select('*').order('created_at',{ascending:false}).limit(100);
  load(false);
  if(data&&data.length){
    const rows=data.map(r=>`<div class="audit-row">
      <span class="a-time">${new Date(r.created_at).toLocaleString('ar-IQ')}</span>
      <span class="a-user">${esc(r.user_name||'النظام')}</span>
      <span class="a-action"><span class="pill ${r.action==='INSERT'?'pg':r.action==='DELETE'?'pr':'py'}">${esc(r.action)}</span></span>
      <span class="a-desc">${esc(AUDIT_TABLE_LABELS[r.table_name]||r.table_name)}${r.new_values?' — '+esc(humanizeAuditValues(r.new_values)):''}</span>
    </div>`).join('');
    G('auditTbl').innerHTML=`<div class="tw" style="max-height:480px;overflow-y:auto">${rows}</div>`;
  } else {
    G('auditTbl').innerHTML='<div class="empty"><i class="ti ti-shield-lock"></i><p>لا توجد سجلات بعد</p></div>';
  }
}
