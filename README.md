# Share Timetable

팀원들이 **실제 날짜 기반 주간 시간표**에 가능한 시간을 선택하고, **누가 언제 가능한지**와 **팀원 전원이 함께 가능한 시간**을 확인하는 서비스입니다.

### 주요 기능
- 월요일부터 일요일까지, **00:00–24:00 / 30분 단위**의 주간 타임테이블 (한국 표준시 KST)
- 이름만 입력해 참여하고, 브라우저에 개인 수정 권한을 저장
- 클릭 / 마우스 드래그(모바일은 터치)로 시간 선택, 자동 저장
- 참여 가능한 인원 수를 색상으로 표시하고, 클릭 시 이름 목록 확인
- **1시간 이상 연속으로 전원이 가능한 시간** 추천
- 10초 간격 자동 동기화, 주 이동 및 이번 주 버튼
- **관리자 전용** 방 생성, 잠금, 삭제
- 팀별 공유 주소: https://your-domain.example/{key}
- 요청받은 색상: #BEDEFF, #FFF2A7, #FFA500, #930031

## 기술 구성
- **프론트엔드**: React + Vite + Lucide
- **서버**: Node.js 24 + Fastify
- **저장소**: SQLite (better-sqlite3) 파일 하나 / WAL 모드
- **배포**: Docker Compose, Cloudflare Tunnel 외부 노출
- **계정**: 관리자 비밀번호(서버 환경변수), 멤버별 랜덤 수정 토큰(서버는 SHA-256 해시만 저장)

별도의 PostgreSQL·Redis·Cloudflare 계정 DB는 필요하지 않습니다.

## 서버 배포 (Docker)

~~~bash
git clone https://github.com/ksh00500/share-timetable.git
cd share-timetable
cp .env.example .env
openssl rand -hex 24
~~~

생성된 랜덤 문자열을 .env의 **ADMIN_PASSWORD** 값으로 바꾸세요. 기본 예시 비밀번호를 그대로 사용하지 마세요.

~~~bash
docker compose up -d --build
curl http://127.0.0.1:8787/api/health
~~~

정상이라면 {"ok":true}가 반환됩니다. Docker 데이터는 timetable_data 볼륨에 보존됩니다. 컨테이너를 재생성해도 저장한 시간은 유지됩니다.

### Cloudflare Quick Tunnel (임시 공유 · 별도 도메인 불필요)

팀원들과 빠르게 시험하려면 **일반 Tunnel이나 DNS를 수정하지 말고** 다음 명령어로 앱 + Quick Tunnel을 함께 띄우세요.

~~~bash
docker compose --profile quick up -d --build
docker compose --profile quick logs -f quick-tunnel
~~~

로그에 나오는 `https://...trycloudflare.com` 주소가 공유 URL입니다. 관리자 페이지는 `https://...trycloudflare.com/admin`, 팀 방은 `https://...trycloudflare.com/{key}` 형식입니다.

- `quick-tunnel`은 Linux 호스트 네트워크(`network_mode: host`)로 실행하여 Docker DNS 조회 없이 `http://127.0.0.1:8787`에 연결합니다. 기존 `keyda-tunnel`이나 Cloudflare 설정을 건드리지 않습니다.
- Quick Tunnel은 **임시 테스트용**이며 재시작 시 `trycloudflare.com` 주소가 변경될 수 있습니다. 다시 발급된 주소를 팀원에게 공유해야 합니다.
- 시간표 데이터는 Docker 볼륨에 저장되므로 **터널 URL이 변경되어도 해당 서버의 방과 선택 데이터는 유지**됩니다.
- 중지는 `docker compose --profile quick down`입니다. 데이터를 유지하려면 `down -v`는 실행하지 마세요.
- 주소를 아는 누구나 방 내용을 볼 수 있으므로 개인 일정 등 민감한 내용을 공개하지 마세요.
- 관리자 비밀번호는 반드시 길고 예측하기 어렵게 설정하세요.

### Quick Tunnel 접속 오류 해결

기존 버전에서 `lookup timetable on 127.0.0.11:53` 오류가 뜬다면 GitHub 최신 설정을 받아 Quick Tunnel 컨테이너를 재생성하세요.

~~~bash
git pull
docker compose --profile quick up -d --build --force-recreate
curl -i http://127.0.0.1:8787/api/health
docker compose --profile quick logs --tail=40 quick-tunnel
~~~

`/api/health`가 `{"ok":true}`를 응답하면 앱 서버까지 연결된 것입니다. 호스트 네트워크 모드는 **Linux Docker 호스트 기준**입니다.

### 고정 도메인으로 연결할 때만 (선택)

### Cloudflare Tunnel 연결

기존 Cloudflare Tunnel이 **host 네트워크**에서 실행된다면, 새 Public Hostname의 Service URL을 다음으로 설정합니다.

- Public hostname: 예) timetable.keyda.site (사용할 도메인은 직접 지정)
- Service URL: http://127.0.0.1:8787
- 별도 포트포워딩 불필요
- Docker Compose의 포트 바인딩은 127.0.0.1에만 열려 있으므로 외부에서 포트 8787로 직접 접근할 수 없습니다.

터널이 별도 Docker 네트워크에서 동작한다면, 동일 네트워크에 두 컨테이너를 연결한 뒤 Service URL을 http://share-timetable:3000으로 설정해야 합니다. 이 경우 Compose 네트워크·접근 경로를 직접 맞춰주세요.

### 사용법

1. https://도메인/admin 에 접속하여 .env의 관리자 비밀번호로 입장합니다.
2. 방 제목과 주소 key (예: index-weekly)를 정하고 방을 생성합니다.
3. 생성된 https://도메인/index-weekly 링크를 팀원에게 공유합니다.
4. 참여자는 이름을 입력하고 **내 시간 선택** 모드에서 가능한 시간을 선택합니다.
5. **전체 현황**에서 각 시간의 참여 인원 수와 참가자 이름, 추천 시간을 확인합니다.

**참여 기준:** 입장해서 이름을 등록한 구성원만 전체 인원에 포함됩니다. 아직 참여하지 않은 팀원은 계산에 포함되지 않으므로, 회의 확정 전 명단을 확인해주세요.

**복구 주의:** 개인 수정 토큰은 참여한 브라우저의 localStorage에만 저장됩니다. 브라우저 데이터를 지우거나 다른 장치로 이동하면 기존 이름으로 다시 수정할 수 없습니다. 필요한 경우 관리자가 기존 참여자를 삭제할 수 있는 API를 사용하거나 브라우저에서 원래 참여해야 합니다. 같은 이름 중복 가입은 허용하지 않습니다.

## 로컬 개발

Node.js 22.13+ (배포 이미지는 Node.js 24) 필요

~~~bash
npm install
cp .env.example .env
# .env에 충분히 긴 관리자 비밀번호 설정
npm run dev
~~~

- 웹 UI: http://localhost:5173
- 개발 API: http://localhost:3000 (Vite의 /api 프록시 사용)
- 개발 SQLite 파일: ./data/timetable.sqlite

~~~bash
npm test
npm run build
~~~

테스트는 in-memory SQLite를 사용하여 방 생성/중복, 비인가 접근, 본인 시간 수정, 주 범위 검사, 방 잠금 등을 확인합니다.

## 주요 API

| 메서드 | 경로 | 용도 |
|---|---|---|
| GET | /api/health | 서버 상태 |
| GET | /api/rooms/:key?week=YYYY-MM-DD | 방·참여자·주간 선택 데이터 (week는 월요일) |
| POST | /api/rooms/:key/join | 이름 등록, 개인 수정 토큰 발급 |
| PUT | /api/rooms/:key/availability | 1인/1주 분량을 전체 교체하여 저장 |
| GET | /api/admin/rooms | 관리자 방 목록 |
| POST | /api/admin/rooms | 관리자 방 생성 |
| PATCH | /api/admin/rooms/:key | 잠금 또는 잠금 해제 |
| DELETE | /api/admin/rooms/:key | 방과 데이터 삭제 |
| DELETE | /api/admin/rooms/:key/members/:memberId | 참여자 및 선택 시간 삭제 |

- 관리자 요청은 X-Admin-Key 헤더에 관리자 비밀번호가 필요합니다.
- 시간 수정은 X-Member-Token 헤더에 개인 토큰이 필요합니다.
- 비밀키는 Git에 업로드하지 않고 .env로 관리합니다.
- 방 키가 URL에 나타나므로 **방 링크를 가진 사람은 명단과 선택 시간을 볼 수 있습니다.** 기밀 일정에는 사용하지 마세요.
- 관리자 인증은 단일 서버 비밀번호를 기반으로 합니다. 다중 관리자·감사 로그·비밀번호 재설정·요청 속도 제한은 이후 확장 항목입니다.

## 운영 참고

- SQLite는 동시에 여러 사람이 읽고 쓰는 소규모 팀 사용에 적합하며, 데이터는 /app/data/timetable.sqlite에 저장됩니다.
- 안전한 오프라인 백업이 필요하면 컨테이너를 중지한 뒤 볼륨의 timetable.sqlite 파일을 복사하세요 (WAL 모드 동작 중 단순 파일 복사는 지양).
- 저장은 변경 후 약 0.55초 디바운스로 처리합니다. 변경 직후 페이지를 닫으면 아직 저장되지 않았을 수 있으니 **자동 저장됨** 상태를 확인하세요.
- 업데이트 시 git pull, docker compose up -d --build 로 이미지를 재빌드하면 됩니다. 볼륨은 유지됩니다.

## 알려진 MVP 범위

- 사용자 계정 / 이메일 인증 / Google Calendar 연동은 제공하지 않습니다.
- 관리자 대시보드 UI에서 참여자 개별 삭제는 아직 제공하지 않지만, 관리자 API로는 가능합니다.
- 데이터 동기화는 WebSocket 대신 **10초 간격 폴링** 방식입니다.
- 오프라인 사용 및 여러 기기 간 개인 수정 권한 동기화는 지원하지 않습니다.
