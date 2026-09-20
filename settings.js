// ================================================================
// SETTINGS (misc)
// ================================================================
function showAbout(){
  toast('نظام مصرف الدم — واسط | الإصدار 2.0.0 | Powered by Supabase + GitHub Pages','info',6000);
}

function dangerZone(){
  if(UPROF?.role!=='admin'){toast('هذا الإجراء متاح للمدير فقط','error'); return;}
  toast('للحذف الدائم: اتصل بمسؤول قاعدة البيانات مباشرةً','warning',5000);
}
