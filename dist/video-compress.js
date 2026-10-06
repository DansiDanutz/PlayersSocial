// In-browser video compression for admin uploads (ES module). Videos that are not MP4 or are over the
// 50 MB storage limit are re-encoded to H.264/AAC MP4 with WebCodecs via Mediabunny (MPL-2.0, vendored
// unmodified in /vendor and loaded only when needed). The bitrate is sized from the duration so the result
// lands around 45 MB; the resolution steps down (1080p → 720p → 480p) as the bitrate budget shrinks.
const MEDIABUNNY_URL = '/vendor/mediabunny-1.61.3.min.mjs';
const MB = 1024 * 1024;
const UPLOAD_LIMIT_BYTES = 50 * MB;
const TARGET_BYTES = 45 * MB;
const AUDIO_BITRATE = 128000;
const MAX_VIDEO_BITRATE = 8000000;
const MIN_VIDEO_BITRATE = 500000;
const RETRY_BITRATE_FACTOR = 0.75;
// Long side of the output for each bitrate floor, highest first.
const RESOLUTION_STEPS = [[2500000, 1920], [1000000, 1280], [0, 854]];

function needsCompression(file) {
  return file.type !== 'video/mp4' || file.size > UPLOAD_LIMIT_BYTES;
}

function planCompression({ duration, width, height, targetBytes = TARGET_BYTES }) {
  const budget = Math.floor((targetBytes * 8) / duration - AUDIO_BITRATE);
  if (budget < MIN_VIDEO_BITRATE) {
    return { tooLong: true, maxMinutes: Math.floor((targetBytes * 8) / (MIN_VIDEO_BITRATE + AUDIO_BITRATE) / 60) };
  }
  const videoBitrate = Math.min(budget, MAX_VIDEO_BITRATE);
  const longSide = RESOLUTION_STEPS.find(([floor]) => videoBitrate >= floor)[1];
  const scale = Math.min(1, longSide / Math.max(width, height));
  const even = (size) => Math.max(2, Math.round((size * scale) / 2) * 2);
  return { tooLong: false, videoBitrate, width: even(width), height: even(height) };
}

async function encodeOnce(mediabunny, file, plan, audioCodecAvailable, onProgress) {
  const { Input, Output, Conversion, ALL_FORMATS, BlobSource, BufferTarget, Mp4OutputFormat, Quality } = mediabunny;
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target: new BufferTarget() });
    const conversion = await Conversion.init({
      input,
      output,
      video: { width: plan.width, height: plan.height, fit: 'contain', codec: 'avc', quality: new Quality({ bitrate: plan.videoBitrate }), forceTranscode: true },
      audio: audioCodecAvailable ? { codec: 'aac', quality: new Quality({ bitrate: AUDIO_BITRATE }) } : {},
    });
    if (!conversion.isValid) throw new Error('Acest videoclip nu poate fi convertit. Încearcă fișierul original de pe telefon (MP4 sau MOV).');
    conversion.onProgress = (share) => onProgress?.(share);
    await conversion.execute();
    return new File([output.target.buffer], `${file.name.replace(/\.[^.]+$/, '') || 'video'}.mp4`, { type: 'video/mp4' });
  } finally {
    input.dispose();
  }
}

async function compress(file, { onProgress } = {}) {
  const mediabunny = await import(MEDIABUNNY_URL);
  if (!(await mediabunny.canEncode('avc'))) throw new Error('Browserul nu poate comprima video. Folosește Chrome sau Edge pe calculator.');
  const audioCodecAvailable = await mediabunny.canEncode('aac');

  const probe = new mediabunny.Input({ formats: mediabunny.ALL_FORMATS, source: new mediabunny.BlobSource(file) });
  let plan;
  try {
    const track = await probe.getPrimaryVideoTrack();
    if (!track) throw new Error('Fișierul ales nu conține video.');
    const [duration, width, height] = await Promise.all([probe.computeDuration(), track.getDisplayWidth(), track.getDisplayHeight()]);
    plan = planCompression({ duration, width, height });
  } finally {
    probe.dispose();
  }
  if (plan.tooLong) throw new Error(`Videoclipul e prea lung pentru 50 MB. Încarcă maximum ${plan.maxMinutes} minute.`);

  // Encoders can overshoot the requested bitrate; retry once with less if the result is still too big.
  const first = await encodeOnce(mediabunny, file, plan, audioCodecAvailable, (share) => onProgress?.(share));
  if (first.size <= UPLOAD_LIMIT_BYTES) return first;
  const retryPlan = { ...plan, videoBitrate: Math.floor(plan.videoBitrate * RETRY_BITRATE_FACTOR) };
  const second = await encodeOnce(mediabunny, file, retryPlan, audioCodecAvailable, (share) => onProgress?.(share));
  if (second.size <= UPLOAD_LIMIT_BYTES) return second;
  throw new Error('Videoclipul nu a putut fi comprimat sub 50 MB. Încearcă unul mai scurt.');
}

// Exposed on window so the classic admin scripts (and tests) can use it.
window.PlayersVideoCompressor = { needsCompression, planCompression, compress, UPLOAD_LIMIT_BYTES };
