// Admin dashboard: list, add and remove administrators. Every admin capability on the site checks
// public.is_players_admin() in the database, so this list is the single source of truth. The RPCs refuse
// non-admins, self-removal and removing the last admin; this file only drives the UI.
function adminMemberItem(row){
  const item=document.createElement('div'), info=document.createElement('div'), email=document.createElement('strong'), meta=document.createElement('span');
  item.className='admin-member';
  email.textContent=row.email;
  const isSelf=row.email===String(adminSession?.user?.email||'').toLowerCase();
  meta.textContent=isSelf?'Tu':row.added_by?`Adăugat de ${row.added_by}`:'Administrator inițial';
  info.append(email,meta);
  item.append(info);
  if(!isSelf){
    const remove=document.createElement('button');
    remove.type='button'; remove.className='admin-member-remove'; remove.textContent='Elimină';
    remove.addEventListener('click',()=>removeAdmin(row.email,remove));
    item.append(remove);
  }
  return item;
}

async function renderAdminList(){
  const list=document.querySelector('#adminList');
  try { list.replaceChildren(...(await adminRpc('players_admin_list_admins',{})).map(adminMemberItem)); }
  catch(error){ list.textContent=error.message; }
}

async function removeAdmin(email,button){
  if(!confirm(`Elimini accesul de administrator pentru ${email}?`)) return;
  button.disabled=true;
  try { await adminRpc('players_admin_remove_admin',{p_email:email}); await renderAdminList(); }
  catch(error){ button.disabled=false; alert(error.message); }
}

document.querySelector('.admin-add-form').addEventListener('submit',async event=>{
  event.preventDefault();
  const form=event.currentTarget, input=form.querySelector('input[name="email"]'), button=form.querySelector('button[type="submit"]');
  const email=input.value.trim().toLowerCase();
  if(!email){ setFormStatus(form,'Scrie adresa de email.','error'); return; }
  button.disabled=true;
  try {
    await adminRpc('players_admin_add_admin',{p_email:email});
    input.value='';
    setFormStatus(form,`${email} este acum administrator.`,'ok');
    await renderAdminList();
  } catch(error){
    setFormStatus(form,error.message,'error');
  } finally {
    button.disabled=false;
  }
});
