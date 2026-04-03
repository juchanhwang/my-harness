# my-harness

Claude Code 개인 하네스 설정 저장소.

에이전트, 스킬, 커맨드, 훅, 플러그인, 글로벌 설정을 포함한다.

## 구조

```
my-harness/
├── agents/          # 서브 에이전트 정의 (18개)
├── skills/          # 스킬 정의 (15개, 도메인 스킬 7개 포함)
├── commands/        # 슬래시 커맨드 (2개)
├── hooks/           # 이벤트 훅 스크립트 (4개)
├── bin/             # CLI 커맨드 (1개)
├── CLAUDE.md        # 글로벌 지침
├── settings.json    # Claude Code 설정
└── keybindings.json # 키 바인딩
```

## 에이전트 (18)

[oh-my-opencode](https://github.com/anthropics/oh-my-opencode)의 에이전트 시스템을 벤치마킹하여 구성했다.

### 코어 에이전트

| 파일 | 모델 | 설명 |
|---|---|---|
| `orchestrator.md` | opus | 메인 진입점. 탐색→위임→검증 루프 조율 |
| `planner.md` | opus | 전략적 작업 계획 수립 (구현 없음) |
| `pre-planner.md` | opus | 사전 요구사항 분석, 모호성 식별 |
| `plan-reviewer.md` | opus | 계획 검토 및 검증 |
| `oracle.md` | opus | 아키텍처 설계, 고난이도 디버깅 컨설팅 |
| `analyzer.md` | opus | 코드베이스 분석 (read-only) |
| `deep-worker.md` | opus | 자율 심층 작업, 목표 지향 실행 |
| `librarian.md` | opus | 외부 문서/OSS 검색, 공식 문서 참조 |
| `delegator.md` | sonnet | 범용 작업 위임 및 조율 |
| `search.md` | haiku | 빠른 팩트 조회, 파일/경로 검색 |
| `media-reader.md` | sonnet | PDF, 이미지 등 미디어 파일 해석 |

### 도메인 전문가 에이전트

| 파일 | 모델 | 설명 |
|---|---|---|
| `fe-dev.md` | opus | 시니어 프론트엔드 엔지니어 (React/Next.js, TypeScript) |
| `be-dev.md` | opus | 시니어 백엔드 엔지니어 (Node.js, PostgreSQL, API 설계) |
| `designer.md` | sonnet | 시니어 프로덕트 디자이너 (UI/UX, 디자인 시스템) |
| `po.md` | sonnet | 시니어 프로덕트 오너 (제품 전략, PRD, 로드맵) |
| `qa.md` | sonnet | 시니어 QA 엔지니어 (테스트 전략, 자동화, 보안) |
| `ops-lead.md` | opus | 클라이언트 운영 총괄 (프로젝트 관리, CI/CD) |
| `data-analyst.md` | opus | 시니어 데이터 애널리스트 (SQL, 퍼널/코호트 분석) |

## 스킬 (15)

### 도메인 스킬 (7)

도메인 전문가 에이전트의 지식 베이스. 각 스킬은 `SKILL.md`(진입점 + 태스크-지식 매핑)와 도메인별 참조 파일로 구성된다.
참조 파일은 비공개(`.gitignore`)이며, `SKILL.md`만 추적한다.

| 스킬 | 역할 | 참조 파일 |
|---|---|---|
| `be` | 백엔드 도메인 — API 설계, DB, 보안, 캐싱, 분산 시스템, 성능 | 25개 |
| `fe` | 프론트엔드 도메인 — React/Next.js, 상태 관리, 테스트, 성능, 접근성 | 32개 |
| `designer` | 디자인 도메인 — UI/UX, 디자인 시스템, 토큰, 접근성, 리서치 | 25개 |
| `po` | 프로덕트 도메인 — 전략, PRD, 우선순위, 로드맵, 사용자 리서치 | 25개 |
| `qa` | QA 도메인 — 테스트 전략, 자동화, 성능/보안 테스트, 정적 분석 | 25개 |
| `ops-lead` | 운영 도메인 — 프로젝트 관리, 클라이언트, SLA, 프로세스 최적화 | 25개 |
| `data-analyst` | 데이터 도메인 — SQL, 퍼널/코호트 분석, A/B 테스트, 대시보드 | 25개 |

### 범용 스킬 (8)

| 스킬 | 역할 |
|---|---|
| `commit-convention` | Conventional Commits + Tim Pope + Chris Beams 기반 Git 커밋 컨벤션 |
| `find-skills` | `npx skills` CLI로 오픈 스킬 생태계 검색 및 설치 지원 |
| `mcp-builder` | MCP(Model Context Protocol) 서버 설계 및 구축 가이드 (Python/Node) |
| `pdf` | PDF 읽기·병합·분할·워터마크·폼 작성·OCR 등 전방위 PDF 처리 |
| `pptx` | PPTX 읽기·생성·편집·템플릿 작업 (markitdown + pptxgenjs 기반) |
| `remotion-best-practices` | Remotion(React 비디오) 개발 베스트 프랙티스 (30개+ 규칙) |
| `vercel-react-best-practices` | Vercel 엔지니어링 기반 React/Next.js 성능 최적화 64개 규칙 |
| `web-design-guidelines` | Vercel Web Interface Guidelines 기반 UI 접근성·UX 가이드 |

## 플러그인 (10)

`settings.json`의 `enabledPlugins`에 선언. Claude Code가 자동으로 설치/업데이트한다.

| 플러그인 | 용도 |
|---|---|
| `superpowers` | 스킬 시스템 자동 평가/활성화 |
| `context7` | 라이브러리 공식 문서 실시간 검색 |
| `code-review` | 멀티 에이전트 기반 PR 코드 리뷰 |
| `feature-dev` | 탐색→설계→구현→리뷰 기능 개발 워크플로우 |
| `frontend-design` | 고품질 프론트엔드 UI/UX 디자인 |
| `skill-creator` | 스킬 생성·테스트·평가·개선 루프 |
| `typescript-lsp` | TypeScript LSP 연동 (타입 진단, 자동 완성) |
| `playwright` | Playwright 브라우저 자동화 테스트 |
| `github` | GitHub MCP 서버 (이슈·PR·레포 관리) |
| `vercel` | Vercel 플랫폼 연동 (배포, 로그, 환경 변수) |

## 커맨드 (2)

| 커맨드 | 설명 |
|---|---|
| `/init-deep` | 계층적 CLAUDE.md 자동 생성 |
| `/ulw-loop` | Oracle 검증 기반 자기 참조 개발 루프 |

## 훅 (4)

| 훅 | 이벤트 | 역할 |
|---|---|---|
| `claude-remote-notification.sh` | `Notification` | 원격 알림 전송 |
| `claude-remote-session-start.sh` | `SessionStart` | 세션 시작 알림 |
| `claude-remote-stop.sh` | `Stop` | 세션 종료 알림 |
| `notify.sh` | `Notification`, `Stop` | macOS 로컬 알림 |

## CLI (bin/)

`~/bin/`에 심링크하여 터미널 어디서든 사용할 수 있는 CLI 커맨드.

### claude-team

에이전트 팀을 즉시 생성하는 래퍼 스크립트. `--append-system-prompt`로 팀 생성을 강제한다.

```bash
claude-team [team-type] ["작업 설명"]
```

| 팀 타입 | 구성 |
|---|---|
| `full` | 전체팀 (7명: PO + Designer + FE + BE + QA + OPS + DA) |
| `prod` | 프로덕션팀 (5명: PO + Designer + FE + BE + QA) |
| `dev` | 개발팀 (5명: FE + BE + QA + OPS + DA) |

```bash
# 개발팀 생성 + 작업 할당
claude-team dev "새로운 기능 개발"

# 프로덕션팀 생성 (작업 대기)
claude-team prod
```

설치:

```bash
ln -sf ~/Documents/FE/my-harness/bin/claude-team ~/bin/claude-team
```

## 사용법

설치 후 `--agent` 플래그로 에이전트를 지정해서 Claude Code를 실행한다.

**오케스트레이터 (권장)**

```bash
claude --agent orchestrator
```

탐색→위임→검증 루프를 자동으로 수행하는 메인 에이전트. 대부분의 작업에 이걸 쓰면 된다.

**플래너**

```bash
claude --agent planner
```

구현 없이 작업 계획만 수립한다. 복잡한 태스크의 설계/분석 단계에서 사용.

**에이전트 팀**

```bash
claude-team dev "작업 설명"
```

도메인 전문가 에이전트들을 팀으로 구성하여 협업. 자세한 내용은 위의 [CLI (bin/)](#cli-bin) 참조.

## 환경 변수

원격 훅 스크립트가 API 키를 사용한다. 사용 전 환경 변수를 설정해야 한다.

```bash
export CLAUDE_REMOTE_API_KEY="your-actual-api-key"
```

셸 프로필(`~/.zshrc` 등)에 추가하면 영구 적용된다.
