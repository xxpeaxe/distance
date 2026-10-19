export const dynamic = 'force-dynamic';
export async function GET(){return Response.json({ready:!!process.env.KAKAO_REST_API_KEY,mapKey:process.env.KAKAO_MAP_JS_KEY||null})}

