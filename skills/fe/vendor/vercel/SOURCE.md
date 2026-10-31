# vendor/vercel — 출처와 변경 내역

> 이 파일은 Apache License 2.0 §4(b)의 변경 고지를 겸한다. 라이선스 원문 고지는 [LICENSE](./LICENSE).

| 항목 | 값 |
|---|---|
| 원본 | vercel 플러그인 (`claude-plugins-official/vercel`) |
| 버전 | 0.50.0 |
| 원본 경로 | `~/.claude/plugins/cache/claude-plugins-official/vercel/0.50.0/skills/{nextjs,next-cache-components}/` |
| 라이선스 | Apache-2.0 (Copyright 2026 Vercel, Inc.) — 원본 `LICENSE` 고지(12줄) + Apache-2.0 전문(apache.org, 2026-10-30 추가) |
| 복사일 | 2026-10-30 |
| 성격 | 0.50.0 시점 스냅샷. 버전 의존 API는 context7(`/vercel/next.js`)로 최신 공식 문서를 확인하고 공식 문서를 우선한다 |

## 포함 범위

| 로컬 경로 | 원본 |
|---|---|
| `nextjs/index.md` | `skills/nextjs/SKILL.md` |
| `nextjs/references/*.md` (19개) | `skills/nextjs/references/*.md` |
| `next-cache-components/index.md` | `skills/next-cache-components/SKILL.md` |

제외: `upstream/`(빌드 원본 사본), `overlay.yaml`(플러그인 빌드 오버레이). 그 밖의 vercel 스킬(`routing-middleware`, `turbopack`, `shadcn`, `react-best-practices` 등)은 복사하지 않았다.

## 변경 사항

1. **파일 이름 변경** — 두 스킬의 `SKILL.md` → `index.md`. 하위 `SKILL.md`가 별도 스킬로 등록되는 것을 막기 위해서다.
2. **frontmatter 축소** — 주입 엔진 전용 메타를 제거하고 `name`, `description`, `metadata.docs`만 남겼다.
   - `nextjs`: `metadata.priority`·`sitemap`·`pathPatterns`·`bashPatterns`·`promptSignals`, `validate`, `chainTo`, `retrieval` 제거
   - `next-cache-components`: `metadata.priority`·`pathPatterns`·`importPatterns`·`bashPatterns`·`promptSignals`·`validate`, `retrieval`, `chainTo` 제거
3. **출처 줄 추가** — 두 `index.md`의 frontmatter 바로 아래에 출처 인용 블록 한 줄을 추가했다.
4. **`nextjs/index.md` 링크 수정 (19곳)** — 원본은 `./file-conventions.md` 형태로 링크하지만 실제 파일은 `references/` 아래에 있다. 모두 `./references/<파일>.md`로 고쳤다.
5. **`nextjs/references/directives.md` 71행** — "see the `next-cache-components` skill." → `../../next-cache-components/index.md`를 가리키는 링크로 바꿨다. 같은 내용을 이 폴더로 함께 옮겼기 때문이다.

위 외의 본문은 원본과 같다.
