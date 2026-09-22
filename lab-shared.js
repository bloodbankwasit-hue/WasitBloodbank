// ================================================================
// LAB — SHARED LOGIC between the two now-independent units (virology / classification).
// A bottle only leaves 'pending_lab' once BOTH its blood type AND its virus test result are
// known — whichever unit finishes second is the one that completes it. This file holds that
// shared completion logic so both units apply it identically.
// ================================================================

// fieldUpdates carries only the field(s) THIS unit is responsible for (blood_type, or
// serology_result + serology_type) — never both, since each unit only ever knows its own part.
async function applyLabUpdate(id, fieldUpdates){
  const{data:cur}=await db.from('blood_donations')
    .select('blood_type,serology_result,serology_type,donor_id,bottle_number,donors(full_name)')
    .eq('id',id).single();

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

  const{error}=await db.from('blood_donations').update(payload).eq('id',id);
  if(error) throw error;

  // One draw event can produce more than one pending-lab row sharing the same bottle number
  // (e.g. trima's two outputs, or a component separated before testing) — this unit's part of
  // the result applies to every sibling still awaiting it, linked by donor + bottle number.
  if(cur?.donor_id && cur?.bottle_number){
    await db.from('blood_donations').update(payload)
      .eq('donor_id',cur.donor_id).eq('bottle_number',cur.bottle_number).eq('status','pending_lab').neq('id',id);
  }

  if(complete && effSer==='Positive' && cur?.donors?.full_name){
    await db.from('rejected_donors').insert({
      full_name:cur.donors.full_name, rejection_reason:'إصابة: '+effSerType,
      rejection_date:new Date().toISOString().split('T')[0], rejection_type:'دائم',
      created_by:SES?.user?.id
    });
    await cacheRejectedDonors();
  }

  return {complete, effSer, effBt};
}
