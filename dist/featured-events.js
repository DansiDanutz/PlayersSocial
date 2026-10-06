// Featured events come from Supabase (players_public_events): each one is promoted above the card grid,
// links back to the category card it belongs to, and moves to the history 24h after it starts.
// Loaded before the main inline script; functions read its globals (eventData, formatEventDate…) only when called.
const EVENT_ARCHIVE_DELAY_MS=24*60*60*1000;
const DEFAULT_EVENT_GLYPH='★';

const eventSlug=name=>name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const startTimeLabel=value=>value?String(value).slice(0,5):'';
// Romanian counts take "de" from 20 upwards, except 101–119 style endings (e.g. 20 de locuri, 101 locuri).
const countLabel=(count,singular,plural)=>count===1?`1 ${singular}`:`${count} ${count%100===0||count%100>=20?'de ':''}${plural}`;
const participantsLabel=count=>countLabel(count,'participant','participanți');

function eventStart(row){ return row?.event_date?new Date(`${row.event_date}T${startTimeLabel(row.start_time)||'00:00'}:00`):null; }
function hasEventEnded(row){ const start=eventStart(row); return Boolean(start)&&Date.now()-start.getTime()>=EVENT_ARCHIVE_DELAY_MS; }
function featuredRows(){ return Object.values(eventData).filter(row=>row.is_featured); }
function publicFeaturedRows(){ return featuredRows().filter(row=>!row.is_hidden); }
function categoryCards(){ return [...document.querySelectorAll('#eventGrid .event')]; }
function linkedCategoryCard(row){ return categoryCards().find(card=>card.dataset.name===row.linked_card)||null; }
function eventWhen(row){ const time=startTimeLabel(row.start_time); return `${formatEventDate(row.event_date)}${time?` · ora ${time}`:''}`; }
function finalParticipants(row){ return row.final_participants??Number(row.joined_count); }

function featuredSignature(row){ return JSON.stringify([row.event_name,row.linked_card,row.event_date,row.start_time,row.participant_target,row.description,row.location,row.banner_url]); }

// Share links go through /e/<slug> (api/share.js) so WhatsApp and Facebook show this event's banner and date.
const eventShareUrl=row=>`${location.origin}/e/${eventSlug(row.event_name)}`;
const eventShareText=row=>`${row.event_name} · ${eventWhen(row)} — Players Club`;
async function shareEvent(row,status){
  const url=eventShareUrl(row);
  if(navigator.share){ try { await navigator.share({title:row.event_name,text:eventShareText(row),url}); } catch(error){ if(error.name!=='AbortError') status.textContent='Nu am putut deschide distribuirea.'; } return; }
  try { await navigator.clipboard.writeText(url); status.textContent='Link copiat. Îl poți lipi oriunde.'; }
  catch { status.textContent=url; }
}
function eventShareRow(row){
  const wrapper=document.createElement('div'), buttons=document.createElement('div'), native=document.createElement('button'), whatsapp=document.createElement('a'), status=document.createElement('p');
  wrapper.className='event-share'; buttons.className='share-row';
  native.className='share-native'; native.type='button'; native.textContent='Distribuie';
  whatsapp.className='share-whatsapp'; whatsapp.textContent='Trimite pe WhatsApp'; whatsapp.target='_blank'; whatsapp.rel='noopener noreferrer';
  whatsapp.href=`https://wa.me/?text=${encodeURIComponent(`${eventShareText(row)} ${eventShareUrl(row)}`)}`;
  status.className='share-status'; status.setAttribute('aria-live','polite');
  native.addEventListener('click',()=>shareEvent(row,status));
  buttons.append(native,whatsapp); wrapper.append(buttons,status);
  return wrapper;
}

function buildFeaturedCard(row){
  const source=linkedCategoryCard(row), card=document.createElement('article'), poster=document.createElement('a'), image=document.createElement('img'), content=document.createElement('div');
  card.className='event event-featured';
  card.id=`eveniment-${eventSlug(row.event_name)}`;
  card.dataset.name=row.event_name;
  card.dataset.category=source?.dataset.category||'table';
  card.dataset.capacity=String(row.participant_target);
  card.dataset.eventDate=row.event_date||'';
  card.dataset.startTime=startTimeLabel(row.start_time);
  card.dataset.signature=featuredSignature(row);
  card.style.setProperty('--card',source?.style.getPropertyValue('--card')||'var(--sun)');
  poster.className='poster-link'; poster.href=row.banner_url; poster.target='_blank'; poster.rel='noopener noreferrer';
  poster.setAttribute('aria-label',`Deschide afișul complet: ${row.event_name}`);
  image.src=row.banner_url; image.alt=`Afișul evenimentului ${row.event_name}`; image.loading='lazy';
  poster.append(image);
  content.className='featured-content';
  content.innerHTML='<div class="event-top"><div class="icon" aria-hidden="true"><span class="icon-glyph"></span></div><div class="attendance"></div></div><h3></h3><p class="desc"></p><div class="details"><span class="event-date"></span><span class="event-location"></span></div><div class="event-actions"><button class="join" type="button">Înscrie-te la turneu</button></div>';
  content.querySelector('.icon-glyph').textContent=source?.querySelector('.icon-glyph')?.textContent||DEFAULT_EVENT_GLYPH;
  content.querySelector('h3').textContent=row.event_name;
  content.querySelector('.desc').textContent=row.description||'';
  content.querySelector('.event-location').textContent=`⌖ ${row.location||''}`;
  const whatsapp=source?.querySelector('.whatsapp-group-link');
  if(whatsapp) content.querySelector('.event-actions').append(whatsapp.cloneNode(true));
  content.append(eventShareRow(row));
  card.append(poster,content);
  return card;
}

function syncLinkedCardLinks(upcoming){
  document.querySelectorAll('.card-featured-link').forEach(link=>link.remove());
  upcoming.forEach(row=>{
    const card=linkedCategoryCard(row); if(!card) return;
    const link=document.createElement('a');
    link.className='card-video-link card-featured-link';
    link.href=`#eveniment-${eventSlug(row.event_name)}`;
    link.textContent=`★ ${row.event_name} · ${formatEventDate(row.event_date)}`;
    card.querySelector('.details').before(link);
  });
}

// Rebuild a promoted card only when its content changed, so live counters don't reset animations.
function syncFeaturedCards(){
  const container=document.querySelector('#featuredEvents'), existing=new Map([...container.querySelectorAll('.event-featured')].map(card=>[card.dataset.name,card]));
  const rows=publicFeaturedRows().sort((a,b)=>eventStart(a)-eventStart(b));
  const cards=rows.map(row=>{ const current=existing.get(row.event_name); if(current?.dataset.signature===featuredSignature(row)) return current; const card=buildFeaturedCard(row); setupEventCard(card); return card; });
  container.replaceChildren(...cards);
  syncLinkedCardLinks(rows.filter(row=>!hasEventEnded(row)));
}

function historyCard(row){
  const item=document.createElement('article'), text=document.createElement('div'), chip=document.createElement('span'), title=document.createElement('strong'), date=document.createElement('p'), summary=document.createElement('p'), image=document.createElement('img');
  item.className='history-card';
  image.src=row.banner_url; image.alt=''; image.loading='lazy';
  chip.className='history-chip'; chip.textContent='Încheiat';
  title.textContent=`${row.event_name} încheiat`;
  date.textContent=`◷ ${formatEventDate(row.event_date)}`;
  summary.className='history-cta';
  summary.textContent=`${participantsLabel(finalParticipants(row))}. ${row.public_recap||'Te așteptăm la următorul!'}`;
  text.append(chip,title,date,summary);
  item.append(image,text);
  return item;
}

function renderEventHistory(){
  const ended=publicFeaturedRows().filter(hasEventEnded).sort((a,b)=>eventStart(b)-eventStart(a)), endedNames=new Set(ended.map(row=>row.event_name));
  document.querySelectorAll('#featuredEvents .event-featured').forEach(card=>card.classList.toggle('event-ended',endedNames.has(card.dataset.name)));
  document.querySelector('#eventHistoryList').replaceChildren(...ended.map(historyCard));
  document.querySelector('#eventHistory').hidden=ended.length===0;
  syncHistoryNav();
}

// History swiper: arrows scroll by one card, are disabled at either end and hidden when everything fits.
const historyList=document.querySelector('#eventHistoryList'), historyPrev=document.querySelector('.history-prev'), historyNext=document.querySelector('.history-next');
function syncHistoryNav(){
  const fits=historyList.scrollWidth<=historyList.clientWidth+2;
  historyPrev.parentElement.hidden=fits;
  historyPrev.disabled=historyList.scrollLeft<=2;
  historyNext.disabled=historyList.scrollLeft+historyList.clientWidth>=historyList.scrollWidth-2;
}
const historyStep=()=>(historyList.firstElementChild?.getBoundingClientRect().width||historyList.clientWidth)+12;
historyPrev.addEventListener('click',()=>historyList.scrollBy({left:-historyStep()}));
historyNext.addEventListener('click',()=>historyList.scrollBy({left:historyStep()}));
historyList.addEventListener('scroll',syncHistoryNav,{passive:true});
window.addEventListener('resize',syncHistoryNav);
