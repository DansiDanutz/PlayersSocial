// Admin dashboard: upload event videos (MP4 + optional poster) to the "players-videos" bucket and publish them
// in the site's Video tab, or delete them again. Authorization is enforced by the Supabase RPCs and storage
// policies; this file only drives the UI. Loaded with admin-events.js (reuses adminRpc and setFormStatus).
const VIDEO_BUCKET='players-videos';
const VIDEO_MAX_BYTES=50*1024*1024;
const POSTER_TYPES={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
const POSTER_MAX_BYTES=5*1024*1024;
const VIDEO_CATEGORY_LABELS={club:'Player’s Poker Club',sah:'Șah',remi:'Remi',table:'Table','ping-pong':'Ping-Pong'};
const VIDEO_TYPE_LABELS={event:'Eveniment',promo:'Promo',premium:'Premium'};

const videoPublicUrl=path=>`${SUPABASE_URL}/storage/v1/object/public/${VIDEO_BUCKET}/${path}`;
function videoPathFromUrl(url){ const prefix=videoPublicUrl(''); return url?.startsWith(prefix)?url.slice(prefix.length):null; }

// XHR instead of fetch so large videos can report upload progress.
function uploadVideoFile(file,extension,onProgress){
  const path=`${Date.now()}-${crypto.randomUUID().slice(0,8)}.${extension}`;
  return new Promise((resolve,reject)=>{
    const request=new XMLHttpRequest();
    request.open('POST',`${SUPABASE_URL}/storage/v1/object/${VIDEO_BUCKET}/${path}`);
    request.setRequestHeader('apikey',SUPABASE_KEY);
    request.setRequestHeader('Authorization',`Bearer ${adminSession.access_token}`);
    request.setRequestHeader('Content-Type',file.type);
    request.upload.addEventListener('progress',event=>{ if(event.lengthComputable&&onProgress) onProgress(event.loaded/event.total); });
    request.addEventListener('load',()=>request.status>=200&&request.status<300?resolve(videoPublicUrl(path)):reject(new Error('Fișierul nu a putut fi încărcat. Încearcă din nou.')));
    request.addEventListener('error',()=>reject(new Error('Conexiunea s-a întrerupt în timpul încărcării.')));
    request.send(file);
  });
}

// Best effort: files whose database row is gone (or was never written) should not stay in the bucket.
async function discardVideoFile(url){
  const path=videoPathFromUrl(url); if(!path) return;
  await fetch(`${SUPABASE_URL}/storage/v1/object/${VIDEO_BUCKET}/${path}`,{method:'DELETE',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${adminSession.access_token}`}}).catch(()=>{});
}

function validateVideoForm(data){
  const video=data.get('video'), poster=data.get('poster'), title=String(data.get('title')||'').trim();
  if(!video||!video.size) return 'Alege fișierul video.';
  if(video.type!=='video/mp4') return 'Videoclipul trebuie să fie MP4.';
  if(video.size>VIDEO_MAX_BYTES) return 'Videoclipul poate avea maximum 50 MB.';
  if(poster&&poster.size&&!POSTER_TYPES[poster.type]) return 'Coperta trebuie să fie JPG, PNG sau WEBP.';
  if(poster&&poster.size>POSTER_MAX_BYTES) return 'Coperta poate avea maximum 5 MB.';
  if(title.length<3||title.length>90) return 'Titlul trebuie să aibă 3–90 de caractere.';
  return null;
}

async function submitVideoForm(form){
  const data=new FormData(form), problem=validateVideoForm(data);
  if(problem){ setFormStatus(form,problem,'error'); return; }
  const button=form.querySelector('button[type="submit"]'), progress=form.querySelector('.video-upload-progress');
  const video=data.get('video'), poster=data.get('poster');
  const uploaded=[];
  button.disabled=true; progress.hidden=false; progress.value=0;
  setFormStatus(form,'Se încarcă videoclipul…','');
  try {
    const videoUrl=await uploadVideoFile(video,'mp4',share=>{ progress.value=Math.round(share*100); });
    uploaded.push(videoUrl);
    let posterUrl=null;
    if(poster&&poster.size){ posterUrl=await uploadVideoFile(poster,POSTER_TYPES[poster.type]); uploaded.push(posterUrl); }
    await adminRpc('players_admin_add_video',{p_category:data.get('category'),p_type:data.get('type'),p_title:String(data.get('title')).trim(),p_description:String(data.get('description')||'').trim()||null,p_video_url:videoUrl,p_poster_url:posterUrl});
    form.reset();
    setFormStatus(form,'Videoclipul a fost publicat în tab-ul Video.','ok');
    await Promise.all([renderVideoAdmin(),window.PlayersVideos?.reload()]);
  } catch(error){
    await Promise.all(uploaded.map(discardVideoFile));
    setFormStatus(form,error.message,'error');
  } finally {
    button.disabled=false; progress.hidden=true;
  }
}

async function deleteUploadedVideo(row,button){
  if(!confirm(`Ștergi „${row.title}” din tab-ul Video? Fișierul va fi șters definitiv.`)) return;
  button.disabled=true;
  try {
    const files=await adminRpc('players_admin_delete_video',{p_id:row.id});
    await Promise.all(files.flatMap(file=>[file.video_url,file.poster_url]).filter(Boolean).map(discardVideoFile));
    await Promise.all([renderVideoAdmin(),window.PlayersVideos?.reload()]);
  } catch(error){
    button.disabled=false;
    alert(error.message);
  }
}

function videoAdminItem(row){
  const item=document.createElement('div'), info=document.createElement('div'), title=document.createElement('strong'), meta=document.createElement('span'), remove=document.createElement('button');
  item.className='video-admin-item';
  title.textContent=row.title;
  meta.textContent=`${VIDEO_CATEGORY_LABELS[row.category]||row.category} · ${VIDEO_TYPE_LABELS[row.video_type]||row.video_type} · ${new Date(row.created_at).toLocaleDateString('ro-RO',{day:'numeric',month:'long',year:'numeric'})}`;
  info.append(title,meta);
  remove.type='button'; remove.className='video-admin-delete'; remove.textContent='Șterge';
  remove.addEventListener('click',()=>deleteUploadedVideo(row,remove));
  item.append(info,remove);
  return item;
}

async function renderVideoAdmin(){
  const list=document.querySelector('#videoAdminList');
  try { list.replaceChildren(...(await adminRpc('players_public_videos',{})).map(videoAdminItem)); }
  catch(error){ list.textContent=error.message; }
}

document.querySelector('.video-upload-form').addEventListener('submit',event=>{ event.preventDefault(); submitVideoForm(event.currentTarget); });
