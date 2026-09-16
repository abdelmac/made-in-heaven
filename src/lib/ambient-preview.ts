export const previewTracks = [
  { id: 'soft-rain', title: 'Pluie douce', attribution: 'Ambiance synthétique originale Solace', duration_seconds: 12, category: 'ambient' },
  { id: 'calm-waves', title: 'Ondes calmes', attribution: 'Ambiance synthétique originale Solace', duration_seconds: 12, category: 'ambient' },
] as const;

/** Original, low-volume PCM loops generated locally; no third-party recordings. */
export function createAmbientPreview(trackId: string): Blob {
  const sampleRate = 16_000;
  const samples = sampleRate * 12;
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index));
  };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  writeText(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, samples * 2, true);
  let seed = 123456789;
  let smooth = 0;
  for (let index = 0; index < samples; index++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = (seed / 0xffffffff) * 2 - 1;
    smooth = smooth * 0.96 + noise * 0.04;
    const time = index / sampleRate;
    const fade = Math.min(1, index / 1600, (samples - 1 - index) / 1600);
    const signal = trackId === 'calm-waves'
      ? smooth * 0.6 + Math.sin(time * Math.PI * 2 * 110) * 0.055 + Math.sin(time * Math.PI * 2 * 165) * 0.035
      : smooth * 1.1 + noise * 0.04;
    view.setInt16(44 + index * 2, Math.round(Math.max(-0.7, Math.min(0.7, signal)) * fade * 32767), true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
