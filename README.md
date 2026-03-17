# my-harness

Claude Code 개인 하네스 설정 저장소.

에이전트, 스킬, 커맨드, 훅, 글로벌 설정을 포함한다.

## 구조

```
my-harness/
├── agents/          # 서브 에이전트 정의 (12개)
├── skills/          # 스킬 정의 (18개)
├── commands/        # 슬래시 커맨드 (1개)
├── hooks/           # 이벤트 훅 스크립트 (4개)
├── CLAUDE.md        # 글로벌 지침
├── settings.json    # Claude Code 설정
├── keybindings.json # 키 바인딩
└── install.sh       # 설치/제거 스크립트
```

## 에이전트 (12)

| 파일 | 설명 |
|---|---|
| `analyzer.md` | 코드베이스 분석 에이전트 |
| `deep-worker.md` | 자율 심층 작업 에이전트 |
| `delegator.md` | 작업 위임 에이전트 |
| `librarian.md` | 외부 문서/OSS 검색 에이전트 |
| `media-reader.md` | 미디어 파일 읽기 에이전트 |
| `oracle.md` | 고급 문제 해결 에이전트 |
| `orchestrator.md` | 작업 조율 에이전트 |
| `plan-reviewer.md` | 계획 검토 에이전트 |
| `planner.md` | 계획 수립 에이전트 |
| `pre-planner.md` | 사전 계획 에이전트 |
| `search.md` | 검색 에이전트 |
| `skill-reviewer.md` | 스킬 검토 에이전트 |

## 스킬 (18)

`code-review`, `feature-dev`, `find-skills`, `frontend-code-quality`, `frontend-design`, `github`, `mcp-builder`, `nestjs-testing`, `pdf`, `pptx`, `react-nextjs-testing`, `react-state-colocation`, `remotion-best-practices`, `skill-creator`, `skill-developer`, `structuring-react-layers`, `vercel-react-best-practices`, `web-design-guidelines`

## 커맨드 (1)

- `init-deep.md` — `/init-deep` 슬래시 커맨드

## 훅 (4)

- `claude-remote-notification.sh` — 원격 알림 전송
- `claude-remote-session-start.sh` — 세션 시작 알림
- `claude-remote-stop.sh` — 세션 종료 알림
- `notify.sh` — 로컬 알림

## 설치

```bash
git clone https://github.com/juchanhwang/my-harness.git
cd my-harness
./install.sh
```

## 제거

```bash
./install.sh --uninstall
```

## 환경 변수

원격 훅 스크립트가 API 키를 사용한다. 사용 전 환경 변수를 설정해야 한다.

```bash
export CLAUDE_REMOTE_API_KEY="your-actual-api-key"
```

셸 프로필(`~/.zshrc` 등)에 추가하면 영구 적용된다.
