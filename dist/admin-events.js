// Admin dashboard tools for featured events: create with a banner upload, edit (including the post-event
// recap and private notes), and view or export registrants. Authorization is enforced by the Supabase RPCs
// and storage policies; this file only drives the UI. Loaded before the main inline script.
const BANNER_BUCKET='players-event-banners';
const BANNER_TYPES={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
const BANNER_MAX_BYTES=5*1024*1024;
const DEFAULT_EVENT_LOCATION='Str. Louis Pasteur nr. 75, Cluj-Napoca';
const REGISTRATION_STATUS_LABELS={registered:'Înscris',pending:'Confirmare cerută',accepted:'Confirmat'};

async function adminRpc(name,body){
  const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{method:'POST',headers:authHeaders(adminSession.access_token),body:JSON.stringify(body)});
  const payload=await response.json().catch(()=>null);
  if(!response.ok) throw new Error(payload?.message||'Operațiunea a eșuat. Încearcă din nou.');
  return payload;
}

function bannerPathFromUrl(url){ const prefix=`${SUPABASE_URL}/storage/v1/object/public/${BANNER_BUCKET}/`; return url?.startsWith(prefix)?url.slice(prefix.length):null; }

async function uploadBanner(file){
  if(!BANNER_TYPES[file.type]) throw new Error('Bannerul trebuie să fie JPG, PNG sau WEBP.');
  if(file.size>BANNER_MAX_BYTES) throw new Error('Bannerul poate avea maximum 5 MB.');
  const path=`${Date.now()}-${crypto.randomUUID().slice(0,8)}.${BANNER_TYPES[file.type]}`;
  const response=await fetch(`${SUPABASE_URL}/storage/v1/object/${BANNER_BUCKET}/${path}`,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${adminSession.access_token}`,'Content-Type':file.type},body:file});
  if(!response.ok) throw new Error('Bannerul nu a putut fi încărcat.');
  return `${SUPABASE_URL}/storage/v1/object/public/${BANNER_BUCKET}/${path}`;
}

// Best effort: an upload whose event save failed should not stay orphaned in the bucket.
async function discardBanner(url){
  const path=bannerPathFromUrl(url); if(!path) return;
  await fetch(`${SUPABASE_URL}/storage/v1/object/${BANNER_BUCKET}/${path}`,{method:'DELETE',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${adminSession.access_token}`}}).catch(()=>{});
}

function cardOptions(selected){
  return categoryCards().map(card=>card.dataset.name).map(name=>`<option value="${escapeHtml(name)}"${name===selected?' selected':''}>${escapeHtml(name)}</option>`).join('');
}

function field(id,label,control,wide=false){ return `<label class="${wide?'admin-wide':''}" for="${id}">${label}${control}</label>`; }

function baseEventFields(row,prefix,isCreate){
  const today=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  return [
    field(`${prefix}-card`,'Card asociat',`<select id="${prefix}-card" name="linked_card" required>${cardOptions(row.linked_card)}</select>`),
    isCreate?field(`${prefix}-name`,'Numele evenimentului',`<input id="${prefix}-name" name="event_name" required minlength="3" maxlength="80" placeholder="Turneu de Remi">`):'',
    field(`${prefix}-date`,'Data',`<input id="${prefix}-date" name="event_date" type="date" required value="${escapeHtml(row.event_date||'')}"${isCreate?` min="${today}"`:''}>`),
    field(`${prefix}-time`,'Ora de început',`<input id="${prefix}-time" name="start_time" type="time" required value="${escapeHtml(startTimeLabel(row.start_time))}">`),
    field(`${prefix}-target`,'Locuri',`<input id="${prefix}-target" name="participant_target" type="number" required min="2" max="500" value="${escapeHtml(row.participant_target??16)}">`),
    field(`${prefix}-location`,'Locație',`<input id="${prefix}-location" name="location" required minlength="3" maxlength="120" value="${escapeHtml(row.location||DEFAULT_EVENT_LOCATION)}">`,true),
    field(`${prefix}-description`,'Descriere',`<textarea id="${prefix}-description" name="description" required minlength="10" maxlength="600">${escapeHtml(row.description||'')}</textarea>`,true),
    field(`${prefix}-banner`,isCreate?'Banner (JPG, PNG sau WEBP, max. 5 MB)':'Înlocuiește bannerul (opțional)',`<span class="banner-field"><img class="banner-preview" alt="Previzualizare banner"${row.banner_url?` src="${escapeHtml(row.banner_url)}"`:''}><input id="${prefix}-banner" name="banner" type="file" accept="image/jpeg,image/png,image/webp"${isCreate?' required':''}></span>`,true),
  ].join('');
}

function postEventFields(row,prefix,notes){
  return [
    field(`${prefix}-final`,'Participanți reali',`<input id="${prefix}-final" name="final_participants" type="number" min="0" max="5000" value="${escapeHtml(row.final_participants??'')}" placeholder="${escapeHtml(row.joined_count)} înscriși">`),
    `<label class="admin-check" for="${prefix}-hidden"><input id="${prefix}-hidden" name="is_hidden" type="checkbox"${row.is_hidden?' checked':''}> Ascuns de pe site</label>`,
    field(`${prefix}-recap`,'Mesaj public în istoric',`<input id="${prefix}-recap" name="public_recap" maxlength="300" value="${escapeHtml(row.public_recap||'')}" placeholder="Te așteptăm la următorul!">`,true),
    field(`${prefix}-notes`,'Notițe interne (vizibile doar adminilor)',`<textarea id="${prefix}-notes" name="admin_notes" maxlength="2000">${escapeHtml(notes||'')}</textarea>`,true),
  ].join('');
}

function wireBannerPreview(form){
  const input=form.querySelector('input[name="banner"]'), preview=form.querySelector('.banner-preview');
  input.addEventListener('change',()=>{ const file=input.files[0]; if(file) preview.src=URL.createObjectURL(file); });
}

function setFormStatus(form,message,kind){ const status=form.querySelector('.admin-form-status'); status.textContent=message; status.className=`admin-form-status${kind?` is-${kind}`:''}`; }

function eventPayload(data,bannerUrl){
  return {p_linked_card:data.get('linked_card'),p_event_date:data.get('event_date'),p_start_time:data.get('start_time'),p_target:Number(data.get('participant_target')),p_description:data.get('description'),p_location:data.get('location'),p_banner_url:bannerUrl};
}

// Uploads a new banner when one was chosen, runs the save, and cleans the upload up if the save fails.
async function submitEventForm(form,save,successMessage){
  const submit=form.querySelector('button[type="submit"]'), data=new FormData(form), file=form.querySelector('input[name="banner"]').files[0];
  submit.disabled=true; setFormStatus(form,file?'Se încarcă bannerul…':'Se salvează…');
  let uploadedUrl=null;
  try {
    if(file) uploadedUrl=await uploadBanner(file);
    await save(data,uploadedUrl);
    setFormStatus(form,successMessage,'ok');
    return true;
  } catch(error){
    if(uploadedUrl) await discardBanner(uploadedUrl);
    setFormStatus(form,error.message,'error');
    return false;
  } finally { submit.disabled=false; }
}

function renderCreateForm(){
  const panel=document.querySelector('#createEventPanel'), form=document.createElement('form');
  form.className='admin-controls create-event-form';
  form.innerHTML=`${baseEventFields({},'create',true)}<p class="admin-form-status" aria-live="polite"></p><div class="admin-actions"><button class="primary" type="submit">Publică evenimentul</button></div>`;
  wireBannerPreview(form);
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const created=await submitEventForm(form,(data,bannerUrl)=>adminRpc('players_admin_create_event',{p_event_name:data.get('event_name'),...eventPayload(data,bannerUrl)}),'Evenimentul a fost publicat.');
    if(!created) return;
    const name=String(new FormData(form).get('event_name')).trim();
    await refreshWorkflow(); toggleCreatePanel(false); await renderFeaturedAdmin(name,'Evenimentul a fost publicat.');
  });
  panel.replaceChildren(form);
}

function toggleCreatePanel(open){
  const panel=document.querySelector('#createEventPanel'), toggle=document.querySelector('.admin-create-toggle');
  panel.hidden=!open; toggle.setAttribute('aria-expanded',String(open)); toggle.textContent=open?'× Renunță':'+ Creează eveniment';
  if(open){ renderCreateForm(); panel.querySelector('select').focus(); }
}

function csvCell(value){ const text=String(value??''), safe=/^[=+\-@]/.test(text)?`'${text}`:text; return `"${safe.replace(/"/g,'""')}"`; }

function downloadRegistrantsCsv(eventName,people){
  const header=['Prenume','Nume','Email','Status','Înscris la','Nume public'];
  const lines=people.map(person=>[person.first_name,person.last_name,person.email,REGISTRATION_STATUS_LABELS[person.confirmation_status]||person.confirmation_status,new Date(person.created_at).toLocaleString('ro-RO'),person.public_display_consent?'Da':'Nu'].map(csvCell).join(','));
  const blob=new Blob(['﻿'+[header.map(csvCell).join(','),...lines].join('\n')],{type:'text/csv;charset=utf-8'}), link=document.createElement('a');
  link.href=URL.createObjectURL(blob); link.download=`inscrisi-${eventSlug(eventName)}.csv`; link.click(); URL.revokeObjectURL(link.href);
}

function registrantsTable(people){
  if(!people.length) return '<p class="admin-muted">Încă nu s-a înscris nimeni.</p>';
  const rows=people.map(person=>`<tr><td>${escapeHtml(`${person.first_name} ${person.last_name}`)}</td><td>${escapeHtml(person.email)}</td><td>${escapeHtml(REGISTRATION_STATUS_LABELS[person.confirmation_status]||person.confirmation_status)}</td><td>${escapeHtml(new Date(person.created_at).toLocaleDateString('ro-RO'))}</td></tr>`).join('');
  return `<table><thead><tr><th>Nume</th><th>Email</th><th>Status</th><th>Data</th></tr></thead><tbody>${rows}</tbody></table>`;
}

async function showRegistrants(form,eventName,download){
  const container=form.querySelector('.registrants-admin');
  container.innerHTML='<p class="admin-muted">Se încarcă…</p>';
  try {
    const people=await adminRpc('players_admin_registrants',{p_event_name:eventName});
    container.innerHTML=`<p class="admin-muted">${people.length} ${people.length===1?'persoană înscrisă':'persoane înscrise'}</p>${registrantsTable(people)}`;
    if(download) downloadRegistrantsCsv(eventName,people);
  } catch(error){ container.innerHTML=''; setFormStatus(form,error.message,'error'); }
}

function buildEditForm(row,notes){
  const prefix=`edit-${eventSlug(row.event_name)}`, form=document.createElement('form');
  form.className='admin-controls featured-admin-body';
  form.innerHTML=`${baseEventFields(row,prefix,false)}${postEventFields(row,prefix,notes)}<p class="admin-form-status" aria-live="polite"></p><div class="admin-actions"><button class="primary" type="submit">Salvează</button><button class="show-registrants" type="button">Vezi înscrișii</button><button class="export-registrants" type="button">Descarcă CSV</button></div><div class="registrants-admin"></div>`;
  wireBannerPreview(form);
  form.querySelector('.show-registrants').addEventListener('click',()=>showRegistrants(form,row.event_name,false));
  form.querySelector('.export-registrants').addEventListener('click',()=>showRegistrants(form,row.event_name,true));
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    const finalValue=new FormData(form).get('final_participants');
    const saved=await submitEventForm(form,(data,bannerUrl)=>adminRpc('players_admin_update_featured_event',{p_event_name:row.event_name,...eventPayload(data,bannerUrl||row.banner_url),p_final_participants:finalValue===''?null:Number(finalValue),p_public_recap:data.get('public_recap'),p_admin_notes:data.get('admin_notes'),p_is_hidden:data.get('is_hidden')==='on'}),'Modificările au fost salvate.');
    if(!saved) return;
    if(form.querySelector('input[name="banner"]').files[0]) await discardBanner(row.banner_url);
    await refreshWorkflow(); await renderFeaturedAdmin(row.event_name,'Modificările au fost salvate.');
  });
  return form;
}

function featuredAdminItem(row,notes,isOpen){
  const item=document.createElement('details'), summary=document.createElement('summary'), image=document.createElement('img'), text=document.createElement('div'), title=document.createElement('strong'), meta=document.createElement('span');
  item.className='featured-admin'; item.open=isOpen;
  image.src=row.banner_url; image.alt='';
  title.textContent=row.event_name;
  const attendance=hasEventEnded(row)?participantsLabel(finalParticipants(row)):`${row.joined_count}/${row.participant_target} înscriși`;
  meta.textContent=`${eventWhen(row)} · ${attendance}${row.is_hidden?' · ascuns':''}`;
  text.append(title,meta); summary.append(image,text); item.append(summary);
  item.addEventListener('toggle',()=>{ if(item.open&&!item.querySelector('form')) item.append(buildEditForm(row,notes)); });
  if(isOpen) item.append(buildEditForm(row,notes));
  return item;
}

// Re-renders both lists; the saved event reopens and keeps its confirmation message.
async function renderFeaturedAdmin(openName,savedMessage){
  let notes={};
  try { notes=Object.fromEntries((await adminRpc('players_admin_event_notes',{})).map(row=>[row.event_name,row.admin_notes])); }
  catch(error){ document.querySelector('#featuredUpcoming').textContent=error.message; return; }
  const rows=featuredRows(), upcoming=rows.filter(row=>!hasEventEnded(row)).sort((a,b)=>eventStart(a)-eventStart(b)), ended=rows.filter(hasEventEnded).sort((a,b)=>eventStart(b)-eventStart(a));
  const item=row=>featuredAdminItem(row,notes[row.event_name],row.event_name===openName);
  document.querySelector('#featuredUpcoming').replaceChildren(...upcoming.map(item));
  document.querySelector('#featuredEnded').replaceChildren(...ended.map(item));
  const openForm=document.querySelector('.featured-admin[open] form');
  if(openForm&&savedMessage) setFormStatus(openForm,savedMessage,'ok');
}

document.querySelector('.admin-create-toggle').addEventListener('click',()=>toggleCreatePanel(document.querySelector('#createEventPanel').hidden));
// Dashboard tabs: only the selected section is shown, so each tool is one tap away (also on phones).
function showDashboardSection(id){
  document.querySelectorAll('.dashboard-nav button[data-section]').forEach(button=>{
    const section=button.dataset.section, active=section===id;
    button.classList.toggle('active',active);
    if(active) button.setAttribute('aria-current','page'); else button.removeAttribute('aria-current');
    document.getElementById(section).hidden=!active;
    document.querySelectorAll(`[data-panel="${section}"]`).forEach(element=>{ element.hidden=!active; });
    if(active) button.scrollIntoView({block:'nearest',inline:'center'});
  });
  document.querySelector('#adminDashboard').scrollTop=0;
  document.querySelector('.dashboard-main').scrollTop=0;
  const current=document.querySelector(`.dashboard-nav button[data-section="${id}"]`);
  document.querySelector('.dashboard-menu-current').textContent=current?current.textContent:'';
  toggleDashboardMenu(false);
}
// On phones the sections live behind one menu button.
function toggleDashboardMenu(open){
  const nav=document.querySelector('.dashboard-nav'), toggle=document.querySelector('.dashboard-menu-toggle');
  nav.classList.toggle('is-open',open); toggle.setAttribute('aria-expanded',String(open));
}
document.querySelector('.dashboard-menu-toggle').addEventListener('click',()=>toggleDashboardMenu(!document.querySelector('.dashboard-nav').classList.contains('is-open')));
document.querySelectorAll('.dashboard-nav button[data-section]').forEach(button=>button.addEventListener('click',()=>showDashboardSection(button.dataset.section)));
showDashboardSection('dashboardKpis');
