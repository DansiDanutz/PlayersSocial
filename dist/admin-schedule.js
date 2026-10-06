// Admin dashboard "Program": plan each day of a week (one of the site's category cards + an optional
// banner that replaces the event's default one) and pick the event of the week among the planned days.
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
  // A day from the weekly default programme has no row of its own yet: saving it creates one.
  const saved=entry&&!entry.is_default;
  form.innerHTML=`<h4>${escapeHtml(PlayersSchedule.dayLabel(date))}</h4>`
    +(entry?.is_default?'<p class="program-default-note">Din programul implicit · salvează ca să schimbi ziua</p>':'')
    +`<label for="program-event-${iso}">Eveniment</label><select id="program-event-${iso}" name="linked_card">${eventOptions(entry?.linked_card)}</select>`
    +`<label for="program-time-${iso}">Ora de început<input id="program-time-${iso}" name="start_time" type="time" value="${entry?.start_time?.slice(0,5)??''}"></label>`
    +`<div class="program-prizes"><label for="program-buyin-${iso}">Buy-in (lei)<input id="program-buyin-${iso}" name="buy_in" type="number" min="0" step="1" inputmode="numeric" value="${entry?.buy_in??PlayersSchedule.CLUB_TERMS.buy_in}"></label>`
    +`<label for="program-guaranteed-${iso}">Garantat (lei)<input id="program-guaranteed-${iso}" name="guaranteed" type="number" min="0" step="1" inputmode="numeric" value="${entry?.guaranteed??PlayersSchedule.CLUB_TERMS.guaranteed}"></label>`
    +`<label for="program-players-${iso}">Minim jucători<input id="program-players-${iso}" name="min_players" type="number" min="1" step="1" inputmode="numeric" value="${entry?.min_players??PlayersSchedule.CLUB_TERMS.min_players}"></label></div>`
    +`<label for="program-image-${iso}">Imagine (opțional · JPG, PNG sau WEBP, max. 5 MB) · Recomandat: 1080 × 1440 px (portret 3:4)<input id="program-image-${iso}" name="image" type="file" accept="image/jpeg,image/png,image/webp" data-recommended="1080x1440" data-fit="cover"></label>`
    +`<img class="program-day-preview" alt="" hidden><p class="program-banner-note"></p>`
    +(entry?.image_url?`<button class="program-use-default" type="button">Folosește bannerul implicit</button>`:'')
    +`<label class="admin-check" for="program-featured-${iso}"><input id="program-featured-${iso}" type="radio" name="featured" value="${iso}"${programData?.featured_day===iso?' checked':''}${saved?'':' disabled'}>Evenimentul săptămânii</label>`
    +`<p class="admin-form-status" aria-live="polite"></p><div class="admin-actions"><button class="primary" type="submit">Salvează ziua</button><button class="program-clear" type="button"${saved?'':' disabled'}>Golește</button></div>`;
  form.addEventListener('submit',event=>{ event.preventDefault(); saveProgramDay(form); });
  form.querySelector('.program-clear').addEventListener('click',()=>clearProgramDay(form));
  form.querySelector('input[name="featured"]').addEventListener('change',()=>setFeaturedDay(iso));
  form.querySelector('select').addEventListener('change',()=>showDayBanner(form,entry));
  form.querySelector('.program-use-default')?.addEventListener('click',()=>useDefaultBanner(form));
  showDayBanner(form,entry);
  return form;
}

// The day's own banner, or the default one of the chosen event (which an uploaded image replaces).
function showDayBanner(form,entry){
  const preview=form.querySelector('.program-day-preview'), note=form.querySelector('.program-banner-note'), card=form.querySelector('select').value;
  const src=entry?.image_url||(card&&PlayersSchedule.defaultImage(card));
  preview.hidden=!src; if(src) preview.src=src;
  note.textContent=entry?.image_url?'Banner personalizat':src?'Banner implicit · încarcă o imagine ca să-l înlocuiești':'';
}

async function useDefaultBanner(form){
  const day=form.dataset.day, entry=programDays().get(day);
  try {
    const replaced=await adminRpc('players_admin_set_schedule_day',{p_day:day,p_linked_card:entry.linked_card,p_image_url:null,p_start_time:entry.start_time?.slice(0,5)??null,p_buy_in:entry.buy_in??null,p_guaranteed:entry.guaranteed??null,p_min_players:entry.min_players??null});
    await discardScheduleImage(replaced);
    await afterProgramChange({day,text:'Ziua folosește bannerul implicit.'});
  } catch(error){ setFormStatus(form,error.message,'error'); }
}

// ---------- weekly default programme ----------
const WEEKDAY_NAMES=['Luni','Marți','Miercuri','Joi','Vineri','Sâmbătă','Duminică'];
let programTemplate=new Map();

// The values a weekday shows on the site: its own, or the club defaults where it has none.
function templateValues(row){
  const terms=PlayersSchedule.CLUB_TERMS;
  return { card:row?.linked_card??null, time:row?.start_time?.slice(0,5)??null, buy_in:row?.buy_in??terms.buy_in, guaranteed:row?.guaranteed??terms.guaranteed, min_players:row?.min_players??terms.min_players };
}

function programTemplateRow(weekday,name){
  const values=templateValues(programTemplate.get(weekday)), item=document.createElement('div');
  const number=(field,label,min)=>`<label class="program-template-number">${label}<input name="${field}" type="number" min="${min}" step="1" inputmode="numeric" aria-label="${label} implicit ${name}" value="${values[field]}"></label>`;
  item.className='program-template-day'; item.dataset.weekday=String(weekday);
  item.innerHTML=`<span class="program-template-name">${name}</span>`
    +`<select name="card" aria-label="Eveniment implicit ${name}">${eventOptions(values.card)}</select>`
    +`<input name="time" type="time" aria-label="Ora implicită ${name}" value="${values.time??''}">`
    +`<div class="program-template-terms">${number('buy_in','Buy-in',0)}${number('guaranteed','Garantat',0)}${number('min_players','Minim jucători',1)}</div>`;
  return item;
}

async function renderProgramTemplate(){
  const list=document.querySelector('.program-template-days');
  try { programTemplate=new Map((await adminRpc('players_admin_list_schedule_template',{})).map(row=>[Number(row.weekday),row])); }
  catch(error){ list.textContent='Programul implicit nu a putut fi încărcat. Încearcă din nou.'; return; }
  list.replaceChildren(...WEEKDAY_NAMES.map((name,index)=>programTemplateRow(index+1,name)));
}

// Saves only the weekdays that changed, then redraws the tab and the public programme.
async function saveProgramTemplate(form){
  const rows=[...form.querySelectorAll('.program-template-day')].map(item=>{
    const weekday=Number(item.dataset.weekday), card=item.querySelector('select').value||null, field=name=>item.querySelector(`[name="${name}"]`).value;
    const values={ card, time:card?(field('time')||null):null, buy_in:card?parseLei(field('buy_in')):null, guaranteed:card?parseLei(field('guaranteed')):null, min_players:card?parseLei(field('min_players')):null };
    const before=templateValues(programTemplate.get(weekday)), saved=before.card?before:{ card:null, time:null, buy_in:null, guaranteed:null, min_players:null };
    return { weekday, name:WEEKDAY_NAMES[weekday-1], values, changed:Object.keys(values).some(key=>values[key]!==saved[key]) };
  });
  const invalid=rows.find(row=>row.values.card&&(row.values.buy_in===undefined||row.values.guaranteed===undefined||!row.values.min_players));
  if(invalid){ setFormStatus(form,`${invalid.name}: buy-in-ul și garantatul trebuie să fie sume întregi în lei, iar minimul de jucători cel puțin 1.`,'error'); return; }
  const changes=rows.filter(row=>row.changed);
  if(!changes.length){ setFormStatus(form,'Nu ai schimbat nimic.','ok'); return; }
  const button=form.querySelector('button[type="submit"]'); button.disabled=true;
  try {
    for(const { weekday, values } of changes) await adminRpc('players_admin_set_schedule_template_day',{p_weekday:weekday,p_linked_card:values.card,p_start_time:values.time,p_buy_in:values.buy_in,p_guaranteed:values.guaranteed,p_min_players:values.min_players});
    await Promise.all([renderProgramTemplate(),afterProgramChange()]);
    setFormStatus(form,'Programul implicit a fost salvat.','ok');
  } catch(error){ setFormStatus(form,error.message,'error'); }
  finally { button.disabled=false; }
}
document.querySelector('.program-template-form').addEventListener('submit',event=>{ event.preventDefault(); saveProgramTemplate(event.currentTarget); });

function renderProgramStatus(){
  const status=document.querySelector('.program-week-status'), featured=programData?.featured_day&&programDays().get(programData.featured_day);
  status.textContent=featured?`Evenimentul săptămânii: ${featured.linked_card}, ${PlayersSchedule.dayLabel(PlayersSchedule.parseDay(featured.day))}`:'Nu ai ales evenimentul săptămânii.';
  document.querySelector('.program-unfeature').hidden=!featured;
}

// Re-reads the shown week and redraws the tab; keeps a confirmation on the form that was just saved.
// ---------- overview: today's programme and quick actions ----------
async function renderDashboardToday(){
  const card=document.querySelector('.dashboard-today-card'), today=new Date();
  try {
    const week=await PlayersSchedule.fetchWeek(PlayersSchedule.weekStart(today)), entry=week.days.find(day=>day.day===PlayersSchedule.isoDay(today));
    const day=document.createElement('span'); day.className='dashboard-today-day'; day.textContent=`Astăzi · ${PlayersSchedule.dayLabel(today)}`;
    if(!entry){ const free=document.createElement('p'); free.className='dashboard-today-free'; free.textContent='Nu e niciun eveniment în Program.'; card.replaceChildren(day,free); return; }
    const name=document.createElement('strong'); name.className='dashboard-today-event'; name.textContent=entry.linked_card;
    card.replaceChildren(day,name,...PlayersSchedule.prizeRow(entry));
  } catch(error){ card.textContent='Programul de azi nu a putut fi încărcat.'; }
}
const QUICK_ACTIONS={
  create:()=>{ showDashboardSection('dashboardFeatured'); toggleCreatePanel(true); },
  video:()=>showDashboardSection('dashboardVideos'),
  template:()=>{ showDashboardSection('dashboardProgram'); document.querySelector('.program-template').open=true; },
};
document.querySelectorAll('.dashboard-quick [data-quick]').forEach(button=>button.addEventListener('click',()=>QUICK_ACTIONS[button.dataset.quick]()));

async function renderProgramAdmin(message){
  renderDashboardToday();
  if(!programWeek){ programWeek=PlayersSchedule.weekStart(new Date()); renderProgramTemplate(); }
  document.querySelector('.program-week-label').textContent=PlayersSchedule.rangeLabel(programWeek);
  try { programData=await PlayersSchedule.fetchWeek(programWeek); }
  catch(error){ document.querySelector('.program-days').textContent='Programul nu a putut fi încărcat. Încearcă din nou.'; return; }
  document.querySelector('.program-days').replaceChildren(...Array.from({length:7},(_,index)=>programDayForm(PlayersSchedule.addDays(programWeek,index))));
  renderProgramStatus();
  if(message) setFormStatus(document.querySelector(`.program-day[data-day="${message.day}"]`),message.text,'ok');
}

async function afterProgramChange(message){
  await Promise.all([renderProgramAdmin(message),window.PlayersSchedule.reload()]);
}

// Empty means "not set"; otherwise a whole number of lei, 0 or more. Returns undefined when invalid.
function parseLei(value){
  const text=String(value??'').trim();
  if(!text) return null;
  return /^\d+$/.test(text)?Number(text):undefined;
}

async function saveProgramDay(form){
  const data=new FormData(form), linkedCard=data.get('linked_card'), day=form.dataset.day, existing=programDays().get(day);
  if(!linkedCard){ setFormStatus(form,'Alege evenimentul zilei.','error'); return; }
  const buyIn=parseLei(data.get('buy_in')), guaranteed=parseLei(data.get('guaranteed'));
  if(buyIn===undefined||guaranteed===undefined){ setFormStatus(form,'Buy-in-ul și garantatul trebuie să fie sume întregi în lei (0 sau mai mult).','error'); return; }
  const minPlayers=parseLei(data.get('min_players'));
  if(minPlayers===undefined||minPlayers===0){ setFormStatus(form,'Minimul de jucători trebuie să fie un număr întreg, cel puțin 1.','error'); return; }
  form.querySelector('button[type="submit"]').disabled=true;
  try {
    await saveWithImage(data.get('image'),uploaded=>adminRpc('players_admin_set_schedule_day',{p_day:day,p_linked_card:linkedCard,p_image_url:uploaded||existing?.image_url||null,p_start_time:data.get('start_time')||null,p_buy_in:buyIn,p_guaranteed:guaranteed,p_min_players:minPlayers}));
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
    // The site no longer shows a week image: saving the week also drops an old one.
    const replaced=await adminRpc('players_admin_set_schedule_week',{p_week_start:PlayersSchedule.isoDay(programWeek),p_image_url:null,p_featured_day:day});
    await discardScheduleImage(replaced);
    await afterProgramChange();
  } catch(error){ document.querySelector('.program-week-status').textContent=error.message; }
}

document.querySelector('.program-unfeature').addEventListener('click',()=>setFeaturedDay(null));
document.querySelector('.program-prev').addEventListener('click',()=>{ programWeek=PlayersSchedule.addDays(programWeek,-7); renderProgramAdmin(); });
document.querySelector('.program-next').addEventListener('click',()=>{ programWeek=PlayersSchedule.addDays(programWeek,7); renderProgramAdmin(); });
