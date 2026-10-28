import {formatMeasuredAt} from './measured-at';
import {APPLICATION_DISTANCE_NOTE} from './travel-policy';

type Place = {name: string; x: string; y: string; address?: string};
type Result = {
  measuredAt: string; mode: 'car' | 'transit'; distance: number; roundTrip: boolean; compared: number;
  points: Place[]; destinationIndex?: number; vertices?: number[][]; paths?: number[][][];
  outbound?: {distance: number}; returnLeg?: {distance: number};
  legs?: {origin: Place; destination: Place; distance: number}[];
};
const km = (distance: number) => `${(distance / 1000).toFixed(1)} km`;
const label = (r: Result, i: number) => i === 0 ? '출발' : i === r.points.length - 1 ? (r.roundTrip ? '복귀' : '도착') : i === r.destinationIndex ? '도착' : `경유 ${i}`;

async function routeMap(r: Result): Promise<HTMLCanvasElement> {
  const k = (window as any).kakao?.maps;
  if (!k?.Map) throw new Error('지도가 준비된 후 다시 저장해주세요.');
  // A fixed export viewport keeps the entire route visible even after the user pans the live map.
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:900px;height:500px;pointer-events:none';
  host.setAttribute('aria-hidden', 'true');
  document.body.appendChild(host);
  try {
    const map = new k.Map(host, {center: new k.LatLng(+r.points[0].y, +r.points[0].x), level: 8});
    const paths = r.mode === 'transit' ? r.paths || [] : [r.vertices || []];
    const bounds = new k.LatLngBounds();
    r.points.forEach(p => bounds.extend(new k.LatLng(+p.y, +p.x)));
    paths.forEach(path => path.forEach(p => bounds.extend(new k.LatLng(p[1], p[0]))));
    map.setBounds(bounds, 60, 70, 60, 70);
    const center = map.getCenter();
    const projection = map.getProjection();
    const pixel = (x: number, y: number) => projection.containerPointFromCoords(new k.LatLng(y, x));
    const routePixels = paths.map(path => path.map(p => pixel(p[0], p[1])));
    const markers = r.points.map(p => pixel(+p.x, +p.y));
    const params = new URLSearchParams({x: String(center.getLng()), y: String(center.getLat()), level: String(map.getLevel())});
    const response = await fetch(`/api/export-map?${params}`, {signal: AbortSignal.timeout(25000)});
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || '저장용 지도를 불러오지 못했습니다. 다시 시도해주세요.');
    }
    const url = URL.createObjectURL(await response.blob());
    const image = new Image();
    try {image.src = url; await image.decode();} finally {URL.revokeObjectURL(url);}
    const canvas = document.createElement('canvas'); canvas.width = 900; canvas.height = 500;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('이 브라우저에서는 이미지 저장을 지원하지 않습니다.');
    ctx.drawImage(image, 0, 0, 900, 500);
    ctx.strokeStyle = r.mode === 'transit' ? '#2465a3' : '#176b50';
    ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    routePixels.forEach(path => {
      if (path.length < 2) return;
      ctx.beginPath(); path.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
    });
    ctx.font = 'bold 14px "Malgun Gothic", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    markers.forEach((p, i) => {
      if (r.roundTrip && i === markers.length - 1) return;
      const text = i === 0 && r.roundTrip ? '출발·복귀' : label(r, i);
      const width = ctx.measureText(text).width + 22;
      ctx.fillStyle = '#176b50'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(p.x - width / 2, p.y - 32, width, 30, 15); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffffff'; ctx.fillText(text, p.x, p.y - 17);
    });
    // Preserve the original Kakao logo area above every route overlay.
    ctx.drawImage(image, image.width - 150, image.height - 40, 150, 40, 750, 460, 150, 40);
    return canvas;
  } finally {host.remove();}
}

export async function saveResultImage(r: Result) {
  await document.fonts.ready;
  const map = await routeMap(r);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('이 브라우저에서는 이미지 저장을 지원하지 않습니다.');
  const font = (size: number, bold = false) => `${bold ? 'bold ' : ''}${size}px "Malgun Gothic", Arial, sans-serif`;
  const lines = (text: string, size: number, width = 900, bold = false) => {
    ctx.font = font(size, bold); const result: string[] = []; let line = '';
    for (const char of Array.from(text)) {
      if (char === '\n' || (line && ctx.measureText(line + char).width > width)) {result.push(line); line = char === '\n' ? '' : char;} else line += char;
    }
    if (line) result.push(line);
    return result;
  };
  const pointRows = r.points.map((p, i) => ({title: lines(`${label(r, i)} · ${p.name}`, 20, 900, true), address: p.address ? lines(p.address, 16) : []}));
  const legRows = r.mode === 'transit' ? (r.legs || []).map(leg => lines(`${leg.origin.name} → ${leg.destination.name} · ${km(leg.distance)}`, 18)) : [];
  const policy = lines('외근 이동거리 입력 시 참고용이며 해당 사이트는 카카오맵 기반으로 제작되었습니다.\n외근 품의 작성 시 외근거리 계산 후 이미지를 저장하여 첨부 파일에 첨부하여 주시기바랍니다.' + (r.mode === 'car' ? '\n' + APPLICATION_DISTANCE_NOTE : ''), 16);
  const pointHeight = pointRows.reduce((h, row) => h + row.title.length * 30 + row.address.length * 24 + 18, 0);
  const legHeight = legRows.length ? 48 + legRows.reduce((h, row) => h + row.length * 27 + 10, 0) : 0;
  const car = r.mode === 'car';
  const headerHeight = r.roundTrip ? 328 : 278;
  const height = headerHeight + pointHeight + 565 + legHeight + policy.length * 25 + 95;
  canvas.width = 2000; canvas.height = height * 2; ctx.scale(2, 2);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1000, height);
  ctx.textBaseline = 'top';
  const text = (value: string, x: number, y: number, size: number, color = '#24382c', bold = false) => {ctx.font = font(size, bold); ctx.fillStyle = color; ctx.fillText(value, x, y);};
  ctx.fillStyle = '#176b50'; ctx.fillRect(0, 0, 1000, 10);
  text('미스토코리아 외근 거리 계산', 50, 45, 32, '#176b50', true);
  const mode = r.mode === 'transit' ? '대중교통' : '자동차';
  text(`${mode} · ${r.roundTrip ? '왕복' : '편도'} · ${r.mode === 'transit' ? '최소 소요시간 경로 기준' : '추천경로 기준'}`, 50, 100, 19, '#53634f');
  text(car ? `외근 신청거리 ${km(r.distance)}` : km(r.distance), 50, 143, car ? 40 : 48, '#176b50', true);
  text(`경로 측정거리 ${r.distance.toLocaleString('ko-KR')} m · ${r.compared}가지 방문 순서 비교`, 50, 205, 16, '#53634f');
  text(`측정 일시: ${formatMeasuredAt(r.measuredAt)}`, 50, 234, 17, '#53634f');
  if (r.roundTrip) {
    text(`가는 거리 ${km(r.outbound!.distance)} + 복귀 거리 ${km(r.returnLeg!.distance)}`, 50, 281, 19);
    text('도착지에서 출발지로 바로 복귀하는 기준입니다.', 50, 311, 16, '#53634f');
  }
  let y = headerHeight + 25;
  pointRows.forEach(row => {
    row.title.forEach(line => {text(line, 50, y, 20, '#24382c', true); y += 30;});
    row.address.forEach(line => {text(line, 50, y, 16, '#53634f'); y += 24;}); y += 18;
  });
  y += 10; ctx.drawImage(map, 50, y, 900, 500); y += 520;
  text('경로 지도 · © Kakao', 50, y, 15, '#53634f'); y += 40;
  if (legRows.length) {
    text('대중교통 구간별 거리 (도보 포함)', 50, y, 20, '#24382c', true); y += 40;
    legRows.forEach(row => {row.forEach(line => {text(line, 50, y, 18); y += 27;}); y += 10;}); y += 8;
  }
  ctx.strokeStyle = '#dfe6d9'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(50, y); ctx.lineTo(950, y); ctx.stroke(); y += 22;
  policy.forEach(line => {text(line, 50, y, 16, '#53634f'); y += 25;});
  text(window.location.origin, 50, y + 16, 15, '#6f8263');
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('이미지를 만들지 못했습니다. 다시 시도해주세요.')), 'image/png'));
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = `미스토코리아_외근거리_${mode}_${r.roundTrip ? '왕복' : '편도'}.png`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
