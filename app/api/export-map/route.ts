export const dynamic = 'force-dynamic';

// Only Kakao's fixed static-map endpoint is allowed; the REST key stays on the server.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const values = ['x', 'y', 'level'].map(name => q.get(name));
  if (values.some(value => value === null || !/^\d+(\.\d+)?$/.test(value))) {
    return Response.json({error: '지도 좌표가 올바르지 않습니다.'}, {status: 400});
  }
  const [x, y, level] = values.map(Number);
  if (x < 123 || x > 133 || y < 32 || y > 40 || !Number.isInteger(level) || level < 1 || level > 15) {
    return Response.json({error: '지도 범위가 올바르지 않습니다.'}, {status: 400});
  }
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) return Response.json({error: '지도 API 연결을 확인해주세요.'}, {status: 503});
  const url = new URL('https://dapi.kakao.com/v2/maps/staticmap');
  url.search = new URLSearchParams({center: `${x},${y}`, size: '900x500', lv: String(level), scale: '1', format: 'png', coord: 'WGS84', logo_pos: 'BOTTOM_RIGHT'}).toString();
  try {
    const response = await fetch(url, {headers: {Authorization: `KakaoAK ${key}`}, cache: 'no-store', signal: AbortSignal.timeout(15000), redirect: 'error'});
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/png')) throw new Error('map');
    return new Response(await response.arrayBuffer(), {headers: {'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
  } catch {
    return Response.json({error: '저장용 지도를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.'}, {status: 502});
  }
}
