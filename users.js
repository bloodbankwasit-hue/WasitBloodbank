// ================================================================
// PERMISSIONS HELPERS
// ================================================================
const ALL_PERMS = [
  {key:'dashboard',  label:'🏠 لوحة التحكم'},
  {key:'reception',  label:'➕ إضافة متبرع'},
  {key:'draw',       label:'🩸 السحب'},
  {key:'lab',        label:'🔬 المختبر'},
  {key:'supply',     label:'📦 التجهيز'},
  {key:'donors',     label:'👥 سجل المتبرعين'},
  {key:'search',     label:'🔍 البحث المتقدم'},
  {key:'barcode',    label:'📊 الباركود والطباعة'},
  {key:'infected',   label:'⚠️ المصابون'},
  {key:'rejected',   label:'🚫 المرفوضون'},
  {key:'rare',       label:'💉 الفصائل النادرة'},
  {key:'stats',      label:'📈 الإحصائيات'},
  {key:'audit',      label:'🔒 سجل التتبع'},
  {key:'settings',   label:'⚙️ الإعدادات'},
];

function renderPermCheckboxes(containerId, selected=[]){
  const box = G(containerId);
  if(!box) return;
  box.innerHTML = ALL_PERMS.map(p=>`
    <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;background:#fafafa;border:1px solid #e0e0e0;border-radius:8px;padding:7px 10px">
      <input type="checkbox" value="${p.key}" ${selected.includes(p.key)?'checked':''} style="width:16px;height:16px;accent-color:#BE123C">
      ${p.label}
    </label>`).join('');
}

function getCheckedPerms(containerId){
  const box = G(containerId);
  if(!box) return [];
  return Array.from(box.querySelectorAll('input[type=checkbox]:checked')).map(cb=>cb.value);
}

// ================================================================
// USER MANAGEMENT (Admin Only)
// ================================================================
async function loadUsers(){
  // Check admin - use multiple sources
  const isAdminNow = (UPROF?.role==='admin') || (SES && UPROF?.role==='admin');
  if(!isAdminNow){
    const wp=G('nonAdminWarn'); if(wp) wp.style.display='block';
    const ap=G('adminUsersPanel'); if(ap) ap.style.display='none';
    return;
  }
  G('nonAdminWarn').style.display='none';
  G('adminUsersPanel').style.display='block';
  load(true);
  const{data}=await db.from('user_profiles').select('id,full_name,role,is_active,created_at,permissions').order('created_at',{ascending:true});
  load(false);
  const rl={admin:'مدير النظام',tech:'فني مختبر',reception:'موظف استقبال',viewer:'عرض فقط'};
  if(data&&data.length){
    G('usersTbl').innerHTML=`<div class="tw"><table><thead><tr>
      <th>الاسم الكامل</th><th>الدور الوظيفي</th><th>الحالة</th><th>تاريخ الإنشاء</th><th>إجراءات</th>
    </tr></thead><tbody>${data.map(u=>`<tr>
      <td>${esc(u.full_name)}</td>
      <td><span style='font-size:11px;color:#757575'>${u.role==='admin'?'مدير النظام ✅':((u.permissions||[]).length+' قسم')}</span></td>
      <td><span class="pill ${u.is_active?'pg':'pr'}">${u.is_active?'نشط':'معطّل'}</span></td>
      <td>${fd(u.created_at)}</td>
      <td>${u.id!==SES?.user?.id?`
        <button class="ibtn" onclick="showEditUser('${u.id}','${esc(u.full_name)}','${u.role}')" title="تعديل"><i class="ti ti-edit"></i></button>
        <button class="ibtn" onclick="toggleUserActive('${u.id}',${u.is_active})" title="${u.is_active?'تعطيل':'تفعيل'}">
          <i class="ti ${u.is_active?'ti-user-off':'ti-user-check'}"></i>
        </button>`:'<span style="font-size:10px;color:#9e9e9e">حسابك الحالي</span>'}
      </td>
    </tr>`).join('')}</tbody></table></div>`;
  } else {
    G('usersTbl').innerHTML='<div class="empty"><i class="ti ti-user-cog"></i><p>لا يوجد مستخدمون</p></div>';
  }
}

function showAddUserModal(){
  ['au-name','au-email','au-pw'].forEach(id=>G(id).value='');
  renderPermCheckboxes('au-perms', []);
  G('addUserModal').classList.add('on');
}

async function createUser(){
  const nm=G('au-name').value.trim(),em=G('au-email').value.trim(),pw=G('au-pw').value;
  if(!nm||!em||!pw){toast('يرجى تعبئة جميع الحقول','error');return;}
  if(pw.length<8){toast('كلمة المرور يجب أن تكون 8 أحرف على الأقل','error');return;}
  load(true);
  try{
    // حفظ جلسة الأدمن قبل إنشاء الحساب الجديد
    const adminAccess  = SES?.access_token;
    const adminRefresh = SES?.refresh_token;

    const{data,error}=await db.auth.signUp({email:em,password:pw});
    if(error) throw error;
    const uid=data.user?.id;
    if(!uid) throw new Error('فشل الإنشاء — تأكد من تعطيل "Confirm email" في إعدادات Supabase');

    // إعادة جلسة الأدمن فوراً
    if(adminAccess&&adminRefresh){
      await db.auth.setSession({access_token:adminAccess,refresh_token:adminRefresh});
      const s=await db.auth.getSession();
      if(s.data.session) SES=s.data.session;
    }

    const perms=getCheckedPerms('au-perms');
    const{error:pe}=await db.from('user_profiles').insert({
      id:uid,full_name:nm,role:'viewer',is_active:true,permissions:perms
    });
    if(pe) throw pe;

    await db.from('audit_log').insert({
      user_id:SES?.user?.id,user_name:UPROF?.full_name,
      action:'INSERT',table_name:'user_profiles',
      record_id:uid,new_values:{name:nm,email:em,permissions:perms}
    });

    toast('✅ تم إنشاء حساب '+nm+' بنجاح','success');
    G('addUserModal').classList.remove('on');
    ['au-name','au-email','au-pw'].forEach(id=>{const e=G(id);if(e)e.value='';});
    await loadUsers();
  }catch(e){
    toast('خطأ: '+e.message,'error');
    console.log('createUser err:',e);
  }
  finally{load(false);}
}

function showEditUser(id,name,role,perms){
  G('eu-id').value=id; G('eu-name').value=name;
  const permArr = perms ? JSON.parse(perms) : [];
  renderPermCheckboxes('eu-perms', permArr);
  G('editUserModal').classList.add('on');
}

async function saveUserEdit(){
  const id=G('eu-id').value, nm=G('eu-name').value.trim();
  if(!nm){toast('أدخل الاسم','error');return;}
  const perms = getCheckedPerms('eu-perms');
  load(true);
  const{error}=await db.from('user_profiles').update({full_name:nm,permissions:perms}).eq('id',id);
  load(false);
  if(error){toast('خطأ: '+error.message,'error');return;}
  await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'UPDATE',table_name:'user_profiles',record_id:id,new_values:{name:nm,permissions:perms}});
  toast('تم حفظ التعديلات','success');
  G('editUserModal').classList.remove('on');
  await loadUsers();
}

async function toggleUserActive(id,cur){
  const act=cur?'تعطيل':'تفعيل';
  if(!confirm('هل تريد '+act+' هذا الحساب؟')) return;
  load(true);
  const{error}=await db.from('user_profiles').update({is_active:!cur}).eq('id',id);
  load(false);
  if(error){toast('خطأ: '+error.message,'error');return;}
  await db.from('audit_log').insert({user_id:SES?.user?.id,user_name:UPROF?.full_name,action:'UPDATE',table_name:'user_profiles',record_id:id,new_values:{is_active:!cur}});
  toast('تم '+act+' الحساب بنجاح','success');
  await loadUsers();
}
