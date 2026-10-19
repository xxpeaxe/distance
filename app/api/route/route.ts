export const maxDuration = 180;
function permutations(a:any[]):any[][]{return a.length?a.flatMap((p,i)=>permutations(a.filter((_,j)=>i!==j)).map(t=>[p,...t])):[[]]}
function departureString(ms:number){return new Date(ms+9*3600000).toISOString().slice(0,16).replace(/[-:T]/g,'');}
async function lookup(origin:any,destination:any,stops:any[],departure:string,key:string){
 const u=new URL('https://apis-navi.kakaomobility.com/v1/future/directions');
 u.searchParams.set('origin',origin.x+','+origin.y);u.searchParams.set('destination',destination.x+','+destination.y);
 u.searchParams.set('departure_time',departure);u.searchParams.set('priority','DISTANCE');u.searchParams.set('summary','false');
 if(stops.length)u.searchParams.set('waypoints',stops.map(p=>p.x+','+p.y).join('|'));
 const r=await fetch(u,{headers:{Authorization:'KakaoAK '+key},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error();
 const data:any=await r.json();const route=data.routes?.[0];if(route?.result_code!==0)throw Error();
 const vertices:number[][]=[];for(const s of route.sections||[])for(const road of s.roads||[])for(let j=0;j<road.vertexes.length;j+=2)vertices.push([road.vertexes[j],road.vertexes[j+1]]);
 return {distance:route.summary.distance,duration:route.summary.duration,vertices,points:[origin,...stops,destination]};
}
export async function POST(req:Request){
 const key=process.env.KAKAO_REST_API_KEY;if(!key)return Response.json({error:'카카오 API 키를 먼저 연결해주세요.'},{status:503});
 try{
 const b:any=await req.json();const valid=(p:any)=>p&&typeof p.name==='string'&&p.name.length<=200&&Number.isFinite(+p.x)&&Number.isFinite(+p.y)&&+p.x>=124&&+p.x<=132&&+p.y>=33&&+p.y<=39;
 if(!Array.isArray(b.stops)||b.stops.length>4||![b.origin,...b.stops,b.destination].every(valid)||('roundTrip' in b&&typeof b.roundTrip!=='boolean'))return Response.json({error:'국내 장소를 올바르게 선택해주세요.'},{status:400});
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(b.departure))return Response.json({error:'출발 시간을 확인해주세요.'},{status:400});
 const departure=new Date(b.departure+'+09:00').getTime();if(!Number.isFinite(departure)||departure<Date.now()-120000)return Response.json({error:'현재 이후의 출발 시간을 선택해주세요.'},{status:400});
 const orders=permutations(b.stops);let best:any=null;let failures=0;
 for(let i=0;i<orders.length;i+=3){await Promise.all(orders.slice(i,i+3).map(async(order:any[])=>{try{const route=await lookup(b.origin,b.destination,order,b.departure.replace(/[-:T]/g,''),key);if(!best||route.distance<best.distance||(route.distance===best.distance&&route.duration<best.duration))best=route;}catch{failures++;}}));}
 if(failures||!best)return Response.json({error:'일부 방문 순서를 비교하지 못했습니다. API 사용량과 설정을 확인한 뒤 다시 검색해주세요.'},{status:502});
 if(!b.roundTrip)return Response.json({...best,compared:orders.length,roundTrip:false});
 try{
 const back=await lookup(b.destination,b.origin,[],departureString(departure+best.duration*1000),key);
 return Response.json({distance:best.distance+back.distance,duration:best.duration+back.duration,vertices:[...best.vertices,...back.vertices],points:[...best.points,b.origin],compared:orders.length,roundTrip:true,outbound:{distance:best.distance,duration:best.duration},returnLeg:{distance:back.distance,duration:back.duration},destinationIndex:best.points.length-1});
 }catch{return Response.json({error:'복귀 경로를 조회하지 못했습니다. 잠시 후 왕복 거리 계산을 다시 시도해주세요.'},{status:502});}
 }catch{return Response.json({error:'요청을 처리하지 못했습니다. 입력값을 확인해주세요.'},{status:400});}
}

