// Image upload hints for the admin dashboard. Every image input marked with data-recommended="WxH" shows,
// once a file is chosen, the image's real size and whether it fits: data-fit="cover" images are cropped to
// the recommended shape on the site, data-fit="contain" images are shown whole.
const IMAGE_RATIO_TOLERANCE=0.06;
const IMAGE_SMALL_FACTOR=0.6;

function imageHintFor(input){
  let hint=input.parentElement.querySelector(':scope > .image-hint');
  if(!hint){ hint=document.createElement('span'); hint.className='image-hint'; hint.setAttribute('aria-live','polite'); input.after(hint); }
  return hint;
}

async function describeChosenImage(input){
  const hint=imageHintFor(input), file=input.files[0];
  hint.classList.remove('is-warning'); hint.textContent='';
  if(!file||!file.type.startsWith('image/')) return;
  let width, height;
  try { const bitmap=await createImageBitmap(file); ({width,height}=bitmap); bitmap.close(); }
  catch { hint.textContent='Nu am putut citi dimensiunea imaginii.'; return; }
  const [recommendedWidth,recommendedHeight]=input.dataset.recommended.split('x').map(Number);
  const offShape=Math.abs(width/height-recommendedWidth/recommendedHeight)/(recommendedWidth/recommendedHeight)>IMAGE_RATIO_TOLERANCE;
  const tooSmall=width<recommendedWidth*IMAGE_SMALL_FACTOR;
  const notes=[];
  if(input.dataset.fit==='contain') notes.push('se afișează întreagă, la orice proporție');
  else notes.push(offShape?'⚠ proporție diferită de cea recomandată: imaginea va fi decupată pe margini':'✓ Proporția e potrivită');
  if(tooSmall) notes.push('⚠ imaginea e mică și poate apărea neclară');
  hint.textContent=`Imaginea ta: ${width} × ${height} px · ${notes.join(' · ')}`;
  hint.classList.toggle('is-warning',(input.dataset.fit!=='contain'&&offShape)||tooSmall);
}

document.addEventListener('change',event=>{
  if(event.target.matches('input[type="file"][data-recommended]')) describeChosenImage(event.target);
});
