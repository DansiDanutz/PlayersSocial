// Admin dashboard "Program": plan each day of a week (one of the site's category cards + an optional
// image), add an image of the whole week and pick the event of the week among the planned days.
// Authorization is enforced by the Supabase RPCs and storage policies; this file only drives the UI.
// Loaded with admin-events.js (reuses adminRpc and setFormStatus); date helpers come from schedule.js.
const SCHEDULE_BUCKET='players-schedule';
const SCHEDULE_IMAGE_TYPES={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
const SCHEDULE_IMAGE_MAX_BYTES=5*1024*1024;
let programWeek=null, programData=null;

const schedulePublicUrl=path=>`${SUPABASE_URL}/storage/v1/object/public/${SCHEDULE_BUCKET}/${path}`;

async function uploadScheduleImage(file){
  if(!SCHEDULE_IMAGE_TYPES[file.type]) throw new Error('Imaginea trebuie să fie JPG, PNG sau WEBP.');
  if(file.size>SCHEDULE_IMAGE_MAX_BYTES) throw new Error('Imaginea poate avea maximum 5 MB.');
  const path=`${Date.now()}-${crypto.randomUUID().slice(0,8)}.${SCHEDULE_IMAGE_TYPES[file.type]}`;
  const response=await fetch(`${SUPABASE_URL}/storage/v1/object/${SCHEDULE_BUCKET}/${path}`,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${adminSession.access_token}`,'Content-Type':file.type},body:file});
  if(!response.ok) throw new Error('Imaginea nu a putut fi încărcată.');
  return schedulePublicUrl(path);
}

// Best effort: replaced or orphaned images should not stay in the bucket.
async function discardScheduleImage(url){
  const prefix=schedulePublicUrl('');
  if(!url?.startsWith(prefix)) return;
  await fetch(`${SUPABASE_URL}/storage/v1/object/${SCHEDULE_BUCKET}/${url.slice(prefix.length)}`,{method:'DELETE',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${adminSession.access_token}`}}).catch(()=>{});
}

// Uploads the chosen file (if any), runs the save and cleans up: the replaced image after success, the new upload after failure.
async function saveWithImage(file,save){
  const uploaded=file&&file.size?await uploadScheduleImage(file):null;
  try { const replaced=await save(uploaded); if(replaced) await discardScheduleImage(replaced); }
  catch(error){ if(uploaded) await discardScheduleImage(uploaded); throw error; }
}

function programDays(){ return new Map((programData?.days||[]).map(entry=>[entry.day,entry])); }
function eventOptions(selected){
  const names=categoryCards().map(card=>card.dataset.name);
  return ['<option value="">— Fără eveniment —</option>',...names.map(name=>`<option value="${escapeHtml(name)}"${name===selected?' selected':''}>${escapeHtml(name)}</option>`)].join('');
}

function programDayForm(date){
  const iso=PlayersSchedule.isoDay(date), entry=programDays().get(iso), form=document.createElement('form');
  form.className='admin-controls program-day'; form.dataset.day=iso; form.noValidate=true;
  form.innerHTML=`<h4>${escapeHtml(PlayersSchedule.dayLabel(date))}</h4>`
    +`<label for="program-event-${iso}">Eveniment</label><select id="program-event-${iso}" name="linked_card">${eventOptions(entry?.linked_card)}</select>`
    +`<label for="program-image-${iso}">Imagine (opțional · JPG, PNG sau WEBP, max. 5 MB) · Recomandat: 1080 × 1440 px (portret 3:4)<input id="program-image-${iso}" name="image" type="file" accept="image/jpeg,image/png,image/webp" data-recommended="1080x1440" data-fit="cover"></label>`
    +(entry?.image_url?`<img class="program-day-preview" src="${escapeHtml(entry.image_url)}" alt="">`:'')
    +`<label class="admin-check" for="program-featured-${iso}"><input id="program-featured-${iso}" type="radio" name="featured" value="${iso}"${programData?.featured_day===iso?' checked':''}${entry?'':' disabled'}>Evenimentul săptămânii</label>`
    +`<p class="admin-form-status" aria-live="polite"></p><div class="admin-actions"><button class="primary" type="submit">Salvează ziua</button><button class="program-clear" type="button"${entry?'':' disabled'}>Golește</button></div>`;
  form.addEventListener('submit',event=>{ event.preventDefault(); saveProgramDay(form); });
  form.querySelector('.program-clear').addEventListener('click',()=>clearProgramDay(form));
  form.querySelector('input[name="featured"]').addEventListener('change',()=>setFeaturedDay(iso));
  return form;
}

function renderProgramStatus(){
  const status=document.querySelector('.program-week-status'), featured=programData?.featured_day&&programDays().get(programData.featured_day);
  status.textContent=featured?`Evenimentul săptămânii: ${featured.linked_card}, ${PlayersSchedule.dayLabel(PlayersSchedule.parseDay(featured.day))}`:'Nu ai ales evenimentul săptămânii.';
  document.querySelector('.program-unfeature').hidden=!featured;
}

function renderProgramWeekForm(){
  const preview=document.querySelector('.program-week-preview'), remove=document.querySelector('.program-week-remove');
  preview.hidden=!programData?.image_url; remove.hidden=!programData?.image_url;
  if(programData?.image_url) preview.src=programData.image_url;
}

// Re-reads the shown week and redraws the tab; keeps a confirmation on the form that was just saved.
async function renderProgramAdmin(message){
  if(!programWeek) programWeek=PlayersSchedule.weekStart(new Date());
  document.querySelector('.program-week-label').textContent=PlayersSchedule.rangeLabel(programWeek);
  try { programData=await PlayersSchedule.fetchWeek(programWeek); }
  catch(error){ document.querySelector('.program-days').textContent='Programul nu a putut fi încărcat. Încearcă din nou.'; return; }
  document.querySelector('.program-days').replaceChildren(...Array.from({length:7},(_,index)=>programDayForm(PlayersSchedule.addDays(programWeek,index))));
  renderProgramWeekForm(); renderProgramStatus();
  if(message){ const target=message.day?document.querySelector(`.program-day[data-day="${message.day}"]`):document.querySelector('.program-week-form'); setFormStatus(target,message.text,'ok'); }
}

async function afterProgramChange(message){
  await Promise.all([renderProgramAdmin(message),window.PlayersSchedule.reload()]);
}

async function saveProgramDay(form){
  const data=new FormData(form), linkedCard=data.get('linked_card'), day=form.dataset.day, existing=programDays().get(day);
  if(!linkedCard){ setFormStatus(form,'Alege evenimentul zilei.','error'); return; }
  form.querySelector('button[type="submit"]').disabled=true;
  try {
    await saveWithImage(data.get('image'),uploaded=>adminRpc('players_admin_set_schedule_day',{p_day:day,p_linked_card:linkedCard,p_image_url:uploaded||existing?.image_url||null}));
    await afterProgramChange({day,text:'Ziua a fost salvată.'});
  } catch(error){ setFormStatus(form,error.message,'error'); form.querySelector('button[type="submit"]').disabled=false; }
}

async function clearProgramDay(form){
  const day=form.dataset.day;
  try {
    const image=await adminRpc('players_admin_clear_schedule_day',{p_day:day});
    await discardScheduleImage(image);
    await afterProgramChange({day,text:'Ziua a fost golită.'});
  } catch(error){ setFormStatus(form,error.message,'error'); }
}

async function setFeaturedDay(day){
  try {
    await adminRpc('players_admin_set_schedule_week',{p_week_start:PlayersSchedule.isoDay(programWeek),p_image_url:programData?.image_url||null,p_featured_day:day});
    await afterProgramChange();
  } catch(error){ document.querySelector('.program-week-status').textContent=error.message; }
}

document.querySelector('.program-week-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget, file=new FormData(form).get('image');
  if(!file||!file.size){ setFormStatus(form,'Alege imaginea programului.','error'); return; }
  try {
    await saveWithImage(file,uploaded=>adminRpc('players_admin_set_schedule_week',{p_week_start:PlayersSchedule.isoDay(programWeek),p_image_url:uploaded,p_featured_day:programData?.featured_day||null}));
    form.reset();
    await afterProgramChange({text:'Imaginea săptămânii a fost salvată.'});
  } catch(error){ setFormStatus(form,error.message,'error'); }
});
document.querySelector('.program-week-remove').addEventListener('click',async()=>{
  try {
    const replaced=await adminRpc('players_admin_set_schedule_week',{p_week_start:PlayersSchedule.isoDay(programWeek),p_image_url:null,p_featured_day:programData?.featured_day||null});
    await discardScheduleImage(replaced);
    await afterProgramChange({text:'Imaginea săptămânii a fost eliminată.'});
  } catch(error){ setFormStatus(document.querySelector('.program-week-form'),error.message,'error'); }
});
document.querySelector('.program-unfeature').addEventListener('click',()=>setFeaturedDay(null));
document.querySelector('.program-prev').addEventListener('click',()=>{ programWeek=PlayersSchedule.addDays(programWeek,-7); renderProgramAdmin(); });
document.querySelector('.program-next').addEventListener('click',()=>{ programWeek=PlayersSchedule.addDays(programWeek,7); renderProgramAdmin(); });
