# 미스토코리아 외근 거리 계산

국내 자동차 경로의 최단거리와 왕복 거리를 계산하는 Next.js 사이트입니다.
경유지는 최대 4개이며 방문 순서를 비교합니다. 왕복은 도착지에서 출발지로 바로 복귀하는 별도 경로를 합산합니다.

## Vercel 배포
1. GitHub 저장소를 Vercel의 Add New > Project에서 Import합니다.
2. Framework Preset은 Next.js, Root Directory는 기본값 ./를 사용합니다.
3. Production 환경변수에 KAKAO_REST_API_KEY와 KAKAO_MAP_JS_KEY를 등록합니다.
4. Deploy 후 생성된 운영 도메인을 카카오 디벨로퍼스 앱의 JavaScript SDK 도메인에 추가합니다.
5. 로그인 없는 공개 운영은 운영 도메인을 보호하지 않는 Deployment Protection 설정을 선택합니다.
6. 시크릿 창에서 지도, 장소 검색, 편도 및 왕복 계산을 확인합니다.

기존 ChatGPT Sites에 등록한 환경변수는 Vercel에 자동 이전되지 않습니다.
카카오맵 사용 설정 ON이 필요합니다. 사용자 위치나 경로는 데이터베이스에 저장하지 않습니다.
경유지 4개 검색은 최대 24회, 왕복 검색은 최대 25회 길찾기 요청을 사용합니다.

## 로컬 실행
npm ci
.env.example을 .env.local로 복사하여 키 입력
npm run dev

## 검증
npm test
npm run build

API 키는 Git에 올리지 않습니다. .env.local은 무시됩니다.
