export const maxDuration = 180;
type Place = {name:string; x:string; y:string; address?:string};
function permutations(a:Place[]):Place[][] {return a.length ? a.flatMap((p,i)=>permutations(a.filter((_,j)=>i!==j)).map(t=>[p,...t])) : [[]];}
function departureString(ms:number){return new Date(ms+9*3600000).toISOString().slice(0,16).replace(/[-:T]/g,'');}
async function lookup(origin:Place,destination:Place,stops:Place[],departure:string,key:string){
 const u=new URL('https://apis-navi.kakaomobility.com/v1/future/directions');
 u.searchParams.set('origin',origin.x+','+origin.y);u.searchParams.set('destination',destination.x+','+destination.y);
 u.searchParams.set('departure_time',departure);u.searchParams.set('priority','DISTANCE');u.searchParams.set('summary','false');
 if(stops.length)u.searchParams.set('waypoints',stops.map(p=>p.x+','+p.y).join('|'));
 const r=await fetch(u,{headers:{Authorization:'KakaoAK '+key},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error();
 const data:any=await r.json();const route=data.routes?.[0];if(route?.result_code!==0)throw Error();
 const vertices:number[][]=[];for(const s of route.sections||[])for(const road of s.roads||[])for(let j=0;j<road.vertexes.length;j+=2)vertices.push([road.vertexes[j],road.vertexes[j+1]]);
 return {distance:route.summary.distance,duration:route.summary.duration,vertices,points:[origin,...stops,destination]};
}
function pairKey(a:Place,b:Place){return [a.x,a.y,b.x,b.y].join(',');}
async function transitLeg(origin:Place,destination:Place,key:string){
 if(+origin.x===+destination.x&&+origin.y===+destination.y)return {origin,destination,distance:0,duration:0,transfers:0,fare:0,walkingDistance:0,steps:[],paths:[]};
 const u=new URL('https://dapi.kakao.com/v2/routing/publictraffic');
 u.searchParams.set('start_x',origin.x);u.searchParams.set('start_y',origin.y);u.searchParams.set('end_x',destination.x);u.searchParams.set('end_y',destination.y);
 const response=await fetch(u,{headers:{Authorization:'KakaoAK '+key},signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('대중교통 API 조회에 실패했습니다. 카카오맵 API 권한과 사용량을 확인해주세요.');
 const data:any=await response.json();
 if(['NO_RESULTS','STARTNODES_NULL','ENDNODES_NULL','EQUAL_POINTS'].includes(data.status))return null;
 if(data.status!=='OK'||!Array.isArray(data.routes))throw Error('대중교통 경로 정보를 확인할 수 없습니다. 잠시 후 다시 시도해주세요.');
 const routes=data.routes.filter((r:any)=>Number.isFinite(r.properties?.totalTime)&&Number.isFinite(r.properties?.totalDistance));
 routes.sort((a:any,b:any)=>a.properties.totalTime-b.properties.totalTime||a.properties.totalDistance-b.properties.totalDistance);
 const route=routes[0];if(!route)return null;
 const p=route.properties;const steps=(route.steps||[]).map((s:any)=>({type:s.properties?.type,guidance:s.properties?.guidance||'',distance:s.properties?.distance||0,duration:s.properties?.time||0,vehicles:(s.properties?.vehicles||[]).map((v:any)=>v.name).filter(Boolean)}));
 const paths=(route.steps||[]).map((s:any)=>(s.path?.points||[]).filter((point:any)=>Array.isArray(point)&&point.length>=2&&Number.isFinite(point[0])&&Number.isFinite(point[1]))).filter((p:any)=>p.length>1);
 return {origin,destination,distance:p.totalDistance,duration:p.totalTime,transfers:p.transfers||0,fare:typeof p.fare?.value==='number'?p.fare.value:null,walkingDistance:steps.filter((s:any)=>s.type==='WALKING').reduce((a:number,s:any)=>a+s.distance,0),steps,paths};
}
function transitSummary(legs:any[]){return {distance:legs.reduce((n,l)=>n+l.distance,0),duration:legs.reduce((n,l)=>n+l.duration,0),transfers:legs.reduce((n,l)=>n+l.transfers,0),fare:legs.every(l=>l.fare!==null)?legs.reduce((n,l)=>n+l.fare,0):null,walkingDistance:legs.reduce((n,l)=>n+l.walkingDistance,0)};}
async function transitRoute(b:any,key:string){
 const orders=permutations(b.stops);const pairs=new Map<string,[Place,Place]>();
 for(const order of orders){const points=[b.origin,...order,b.destination];for(let i=0;i<points.length-1;i++)pairs.set(pairKey(points[i],points[i+1]),[points[i],points[i+1]]);}
 const results=new Map<string,any>();const entries=[...pairs.entries()];
 try{for(let i=0;i<entries.length;i+=3)await Promise.all(entries.slice(i,i+3).map(async([id,[a,z]])=>results.set(id,await transitLeg(a,z,key))));}
 catch(e:any){return Response.json({error:e.message||'대중교통 경로 조회에 실패했습니다.'},{status:502});}
 let best:any=null;
 for(const order of orders){const points=[b.origin,...order,b.destination];const legs=points.slice(0,-1).map((p,i)=>results.get(pairKey(p,points[i+1])));if(legs.some(l=>!l))continue;const totals=transitSummary(legs);if(!best||totals.duration<best.duration||(totals.duration===best.duration&&totals.distance<best.distance))best={...totals,points,legs};}
 if(!best)return Response.json({error:'입력한 장소를 모두 연결하는 대중교통 경로가 없습니다. 다른 장소나 자동차를 선택해주세요.'},{status:422});
 const outbound={distance:best.distance,duration:best.duration};const destinationIndex=best.points.length-1;let returnLeg;
 if(b.roundTrip){try{const back=await transitLeg(b.destination,b.origin,key);if(!back)return Response.json({error:'도착지에서 출발지로 복귀하는 대중교통 경로가 없습니다.'},{status:422});returnLeg={distance:back.distance,duration:back.duration};best.legs.push(back);best.points.push(b.origin);Object.assign(best,transitSummary(best.legs));}catch{return Response.json({error:'대중교통 복귀 경로 조회에 실패했습니다. 다시 시도해주세요.'},{status:502});}}
 return Response.json({...best,mode:'transit',roundTrip:!!b.roundTrip,compared:orders.length,vertices:[],paths:best.legs.flatMap((l:any)=>l.paths),destinationIndex,...(b.roundTrip?{outbound,returnLeg}:{})});
}
export async function POST(req:Request){
 const key=process.env.KAKAO_REST_API_KEY;if(!key)return Response.json({error:'카카오 API 키를 먼저 연결해주세요.'},{status:503});
 try{
 const b:any=await req.json();const valid=(p:any)=>p&&typeof p.name==='string'&&p.name.length<=200&&typeof p.x==='string'&&typeof p.y==='string'&&Number.isFinite(+p.x)&&Number.isFinite(+p.y)&&+p.x>=124&&+p.x<=132&&+p.y>=33&&+p.y<=39;
 if(!Array.isArray(b.stops)||b.stops.length>4||![b.origin,...b.stops,b.destination].every(valid)||('roundTrip'in b&&typeof b.roundTrip!=='boolean')||('mode'in b&&!['car','transit'].includes(b.mode)))return Response.json({error:'국내 장소와 이동수단을 올바르게 선택해주세요.'},{status:400});
 if(b.mode==='transit')return await transitRoute(b,key);
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(b.departure))return Response.json({error:'출발 시간을 확인해주세요.'},{status:400});
 const departure=new Date(b.departure+'+09:00').getTime();if(!Number.isFinite(departure)||departure<Date.now()-120000)return Response.json({error:'현재 이후의 출발 시간을 선택해주세요.'},{status:400});
 const orders=permutations(b.stops);let best:any=null;let failures=0;
 for(let i=0;i<orders.length;i+=3){await Promise.all(orders.slice(i,i+3).map(async(order:Place[])=>{try{const route=await lookup(b.origin,b.destination,order,b.departure.replace(/[-:T]/g,''),key);if(!best||route.distance<best.distance||(route.distance===best.distance&&route.duration<best.duration))best=route;}catch{failures++;}}));}
 if(failures||!best)return Response.json({error:'일부 방문 순서를 비교하지 못했습니다. API 사용량과 설정을 확인한 뒤 다시 검색해주세요.'},{status:502});
 if(!b.roundTrip)return Response.json({...best,mode:'car',compared:orders.length,roundTrip:false});
 try{
 const back=await lookup(b.destination,b.origin,[],departureString(departure+best.duration*1000),key);
 return Response.json({mode:'car',distance:best.distance+back.distance,duration:best.duration+back.duration,vertices:[...best.vertices,...back.vertices],points:[...best.points,b.origin],compared:orders.length,roundTrip:true,outbound:{distance:best.distance,duration:best.duration},returnLeg:{distance:back.distance,duration:back.duration},destinationIndex:best.points.length-1});
 }catch{return Response.json({error:'복귀 경로를 조회하지 못했습니다. 잠시 후 왕복 거리 계산을 다시 시도해주세요.'},{status:502});}
 }catch{return Response.json({error:'요청을 처리하지 못했습니다. 입력값을 확인해주세요.'},{status:400});}
}
