# my-harness

Claude Code 개인 하네스 설정 저장소.

에이전트, 스킬, 커맨드, 훅, 글로벌 설정을 포함한다.

## 구조

```
my-harness/
├── agents/          # 서브 에이전트 정의 (12개)
├── skills/          # 스킬 정의 (22개)
├── commands/        # 슬래시 커맨드 (1개)
├── hooks/           # 이벤트 훅 스크립트 (5개)
├── mcp.json         # MCP 서버 템플릿 (6개)
├── CLAUDE.md        # 글로벌 지침
├── settings.json    # Claude Code 설정
├── keybindings.json # 키 바인딩
└── install.sh       # 설치/제거 스크립트
```

## 에이전트 (12)

[oh-my-opencode](https://github.com/anthropics/oh-my-opencode)의 에이전트 시스템을 벤치마킹/클론하여 구성했다.

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

## 스킬 (22)

| 스킬 | 역할 | 트리거 |
|---|---|---|
| `code-review` | 멀티 에이전트 기반 PR 코드 리뷰. 신뢰도 점수로 false positive 필터링 | "review this PR", "code review" |
| `create-pr` | 프로젝트 커밋/PR 컨벤션에 맞는 GitHub PR 생성 (squash merge 전제) | PR 생성, "create PR" |
| `feature-dev` | 탐색→설계→구현→리뷰 단계별 기능 개발 워크플로우 | "implement feature", "add feature" |
| `find-skills` | `npx skills` CLI로 오픈 스킬 생태계 검색 및 설치 지원 | "find a skill for X", "how do I do X" |
| `frontend-code-quality` | 가독성·예측 가능성·응집도·결합도 4원칙 기반 프론트엔드 코드 품질 가이드 | 컴포넌트 설계, 리팩토링, 코드 리뷰 |
| `frontend-design` | 제네릭 AI 미학을 탈피한 고품질 프론트엔드 UI/UX 디자인 및 구현 | 웹 컴포넌트, 랜딩 페이지, 대시보드 제작 |
| `github` | GitHub MCP 서버 통한 이슈·PR·레포 관리 | "create issue", "manage PR" |
| `mcp-builder` | MCP(Model Context Protocol) 서버 설계 및 구축 가이드 (Python/Node) | MCP 서버 개발, 외부 API 통합 |
| `nestjs-expert` | NestJS 아키텍처·DI·미들웨어·가드·인터셉터·테스트 전문가 | NestJS 구현, 아키텍처 설계, 디버깅 |
| `nestjs-testing` | NestJS 행동/계약 중심 테스트 가이드. Functional Core / Imperative Shell 패턴 | Jest, `@nestjs/testing`, E2E 테스트 |
| `pdf` | PDF 읽기·병합·분할·워터마크·폼 작성·OCR 등 전방위 PDF 처리 | `.pdf` 파일 관련 모든 작업 |
| `pptx` | PPTX 읽기·생성·편집·템플릿 작업. markitdown + pptxgenjs 기반 | `.pptx` 파일, "slides", "presentation" |
| `react-nextjs-testing` | Kent C. Dodds 철학 기반 React/Next.js 행동 테스트 가이드 (Vitest + RTL + MSW + Playwright) | 테스트 코드 작성, 컴포넌트 테스트, E2E |
| `react-state-colocation` | Kent C. Dodds의 State Colocation 원칙 기반 상태 배치 의사결정 플로우차트 | 상태 관리 설계, prop drilling 해결 |
| `remotion-best-practices` | Remotion(React 비디오) 개발 베스트 프랙티스. 자막·FFmpeg·오디오 시각화 포함 | Remotion 코드, 비디오 생성 |
| `security` | 프론트엔드(XSS, 민감정보)·백엔드(인젝션, 인증/인가, CORS) 보안 코딩 가이드 | 보안 코드 작성·리뷰, 인증/인가 구현 |
| `server-api-design` | NestJS REST API 설계 가이드 (URL 컨벤션, DTO 검증, 에러 처리, Controller/Service 분리) | API 엔드포인트 설계, DTO 작성 |
| `skill-creator` | 새 스킬 생성→테스트→평가→반복 개선 루프. 정량 벤치마크 및 description 최적화 | "create a skill", 스킬 성능 측정 |
| `skill-developer` | Claude Code 스킬 시스템 가이드. 트리거·훅·자동 활성화·500줄 규칙·메모리 패턴 | 스킬 생성/수정, `skill-rules.json` |
| `structuring-react-layers` | Page(레이아웃 셸)→Feature Component→Hook 3계층 아키텍처 가이드 | 페이지 구조 설계, Hook 분리, 코드 리뷰 |
| `vercel-react-best-practices` | Vercel 엔지니어링 기반 React/Next.js 성능 최적화 62개 규칙 (8개 카테고리) | React 컴포넌트 작성, 번들 최적화 |
| `web-design-guidelines` | Vercel Web Interface Guidelines 기반 UI 접근성·UX 감사 | "review my UI", "check accessibility" |

## MCP 서버 (6)

`mcp.json`은 참조용 템플릿이다. `install.sh`가 자동 설치하지 않으며, 시크릿은 직접 채워야 한다.

| 서버 | 타입 | 용도 |
|---|---|---|
| `gcp` | stdio | Google Cloud Platform CLI |
| `sequential-thinking` | stdio | 순차적 사고 체인 |
| `chrome-devtools` | stdio | Chrome DevTools 연동 |
| `github` | http | GitHub API (토큰 필요) |
| `vercel` | http | Vercel 플랫폼 연동 |
| `notionApi` | stdio | Notion API (토큰 필요) |

## 커맨드 (1)

- `init-deep.md` — `/init-deep` 슬래시 커맨드

## 훅 (5)

| 훅 | 이벤트 | 역할 |
|---|---|---|
| `skill-eval.sh` | `UserPromptSubmit` | 프롬프트 제출 시 사용 가능한 스킬을 강제 평가·활성화 |
| `claude-remote-notification.sh` | `Notification` | 원격 알림 전송 |
| `claude-remote-session-start.sh` | `SessionStart` | 세션 시작 알림 |
| `claude-remote-stop.sh` | `Stop` | 세션 종료 알림 |
| `notify.sh` | `Notification`, `Stop` | macOS 로컬 알림 |

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
