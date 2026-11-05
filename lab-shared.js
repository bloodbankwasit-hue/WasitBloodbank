// ================================================================
// LAB — SHARED LOGIC between the two now-independent units (virology / classification).
// A bottle only leaves 'pending_lab' once BOTH its blood type AND its virus test result are
// known — whichever unit finishes second is the one that completes it. This file holds that
// shared completion logic so both units apply it identically.
// ================================================================

// fieldUpdates carries only the field(s) THIS unit is responsible for (blood_type, or
// serology_result + serology_type) — never both, since each unit only ever knows its own part.
// Local (Baghdad) calendar day the work was actually done — used by the home-screen statistics.
function labToday(){ const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }

async function applyLabUpdate(id, fieldUpdates){
  // Stamp the day this unit did its part (kept if the caller already stamped it, e.g. an offline
  // operation queued earlier and replayed now).
  fieldUpdates={...fieldUpdates};
  if('serology_result' in fieldUpdates && !fieldUpdates.serology_date) fieldUpdates.serology_date=labToday();
  if('blood_type' in fieldUpdates && !fieldUpdates.blood_type_date) fieldUpdates.blood_type_date=labToday();
  const{data:cur}=await db.from('blood_donations')
    .select('blood_type,serology_result,serology_type,status,donor_id,bottle_number,donors(full_name)')
    .eq('id',id).single();

  // قنينة تجاوزت مرحلة الفحص (مصابة / بالمخزن المؤقت / بالرصيد / تالفة): تعديل أو تسجيل الفصيلة فقط —
  // لا تتغير حالتها ولا يُعاد إدخال المتبرع بالمرفوضين (حصل ذلك سابقاً عند اكتمال الفحص).
  if(cur && ['rejected_positive','pending_release','in_stock','damaged'].includes(cur.status) && 'blood_type' in fieldUpdates && !('serology_result' in fieldUpdates)){
    const only={blood_type:fieldUpdates.blood_type, blood_type_date:fieldUpdates.blood_type_date};
    let{error:e1}=await db.from('blood_donations').update(only).eq('id',id);
    if(e1 && /blood_type_date/i.test(e1.message||'')){ delete only.blood_type_date; ({error:e1}=await db.from('blood_donations').update(only).eq('id',id)); }
    if(e1) throw e1;
    // مكوّنات/نواتج نفس السحبة (نفس المتبرع والرقم) ما زالت بنفس الفصيلة القديمة وبحالة مماثلة
    if(cur.donor_id && cur.bottle_number){
      let q=db.from('blood_donations').update({blood_type:fieldUpdates.blood_type}).eq('donor_id',cur.donor_id).eq('bottle_number',cur.bottle_number)
        .in('status',['rejected_positive','pending_release','in_stock','damaged']).eq('is_deleted',false).neq('id',id);
      q = cur.blood_type ? q.eq('blood_type',cur.blood_type) : q.is('blood_type',null);
      const{error:e2}=await q;
      if(e2) throw new Error('حُفظت الفصيلة لكن تعذّر تطبيقها على المكوّنات المرتبطة: '+e2.message);
    }
    return {complete:!!fieldUpdates.blood_type && !!cur.serology_result, effSer:cur.serology_result??null, effBt:fieldUpdates.blood_type, final:true};
  }
  const effBt = ('blood_type' in fieldUpdates) ? fieldUpdates.blood_type : (cur?.blood_type ?? null);
  const effSer = ('serology_result' in fieldUpdates) ? fieldUpdates.serology_result : (cur?.serology_result ?? null);
  const effSerType = ('serology_type' in fieldUpdates) ? fieldUpdates.serology_type : (cur?.serology_type ?? null);
  const complete = !!effBt && !!effSer;
  // Once lab is complete, a negative bottle no longer goes straight to 'in_stock' — it lands in
  // 'pending_release' (المخزن المؤقت) first, where the responsible staff reviews it (and can still
  // separate it there if it's a separable type) before manually confirming it into in_stock/التجهيز.
  const newStatus = complete ? (effSer==='Positive' ? 'rejected_positive' : 'pending_release') : 'pending_lab';

  const payload = {...fieldUpdates};
  if(complete) payload.status = newStatus;

  let{error}=await db.from('blood_donations').update(payload).eq('id',id);
  if(error && /serology_date|blood_type_date/i.test(error.message||'')){
    // The date columns haven't been added to the database yet — save the result without them.
    delete payload.serology_date; delete payload.blood_type_date;
    ({error}=await db.from('blood_donations').update(payload).eq('id',id));
  }
  if(error) throw error;

  // أول نتيجة فحص لهذه القنينة: تُخصم فحص واحد من كل مادة «تلقائية» (HIV, HBcore ...). لا يوقف الفحص إن فشل الخصم.
  if('serology_result' in fieldUpdates && !cur?.serology_result){
    try{ const rr=await db.rpc('lab_reagent_use',{p_n:1}); if(!rr.error && typeof refreshExpiryNotifications==='function') refreshExpiryNotifications(); }catch(e){ console.log('reagent use:',e); }
  }

  // One draw event can produce more than one pending-lab row sharing the same bottle number
  // (e.g. trima's two outputs, or a component separated before testing) — this unit's part of
  // the result applies to every sibling still awaiting it, linked by donor + bottle number.
  if(cur?.donor_id && cur?.bottle_number){
    const{error:sibErr}=await db.from('blood_donations').update(payload)
      .eq('donor_id',cur.donor_id).eq('bottle_number',cur.bottle_number).eq('status','pending_lab').neq('id',id);
    if(sibErr) throw new Error('حُفظت نتيجة القنينة لكن تعذّر تطبيقها على المكوّنات المرتبطة بنفس الرقم: '+sibErr.message);
  }

  if(complete && effSer==='Positive' && cur?.donors?.full_name){
    const{error:rejErr}=await db.from('rejected_donors').insert({
      full_name:cur.donors.full_name, rejection_reason:'إصابة: '+effSerType,
      rejection_date:new Date().toISOString().split('T')[0], rejection_type:'دائم',
      created_by:SES?.user?.id
    });
    if(rejErr){
      // This must NEVER fail silently — a donor who isn't in this list can walk back in and
      // donate again. Surface it loudly so staff add them manually right away (شاشة المصابون
      // والمرفوضون → المرفوضون مؤقتاً → إضافة) instead of assuming the automatic block worked.
      console.error('rejected_donors insert failed:', rejErr);
      toast('⚠️ فشلت إضافة '+cur.donors.full_name+' لقائمة المرفوضين تلقائياً — أضفه يدوياً حالاً من شاشة المصابون والمرفوضون!','error',10000);
    } else {
      await cacheRejectedDonors();
    }
  }

  return {complete, effSer, effBt};
}
