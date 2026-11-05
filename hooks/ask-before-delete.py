#!/usr/bin/env python3
"""PreToolUse 훅 — 파일을 지우는 Bash 명령을 판정한다.

판정은 세 가지다.
  allow — 안전하다고 확신하는 삭제만 묻지 않고 통과시킨다 (아래 SAFE_*·CODE_EXT·BUILD_DIRS).
  deny  — 재귀 삭제(`rm -r/-R/-rf/-fr`)인데 대상이 재생성 가능한 산출물 폴더가 아니면 차단한다.
          (settings.json의 deny 규칙은 예외를 둘 수 없어서 이 규칙을 훅으로 옮겼다.)
  ask   — 그 밖에 삭제로 보이는 명령은 사용자에게 묻는다.

삭제 여부는 명령을 shlex로 쪼개 "실제로 실행되는 명령"을 보고 판단한다.
따옴표 안의 글자(`git commit -m 'rm unused'`, `grep os.remove`)는 삭제로 보지 않는다.
쪼갤 수 없는 형태(heredoc, `$(…)`, 서브셸)는 예전처럼 문자열 전체를 훑어 보수적으로 ask 한다.
`bash -c`, `xargs`, `python -c` 같은 래퍼는 인자 안까지 훑는다.

settings.json의 permissions.ask 규칙(Bash(rm *) 등)은 명령 앞부분만 보므로 이 훅이 그 틈을 메운다.
훅이 오류로 죽으면 판정이 없는 것이므로 settings.json의 ask 규칙이 대신 묻는다.
"""
import fnmatch
import json
import os
import re
import shlex
import sys

# 명령 경계(시작·공백·; & | ( ` ' " $ /) 뒤의 삭제 명령어. `docker run --rm`, `form` 같은 것은 제외된다.
DELETE_CMD = re.compile(r"""(?:^|[\s;&|(`'"$/])(?:rm|rmdir|unlink|shred|srm|trash)(?=$|[\s;&|)`'"])""")
OTHER_PATTERNS = [
    re.compile(r"(?:^|\s)-delete\b"),  # find … -delete
    re.compile(r"\bgit\s+clean\b"),
    re.compile(r"\.Trash\b"),  # mv … ~/.Trash
    re.compile(r"\bos\.(?:remove|unlink|rmdir|removedirs)\b"),
    re.compile(r"\bshutil\.rmtree\b"),
    re.compile(r"\.unlink\(|\b(?:rmSync|unlinkSync|rmdirSync)\b|\bfs(?:\.promises)?\.(?:rm|unlink|rmdir)\b"),
]

# --- 실제 실행되는 명령 기준의 삭제 판별 ---
DELETE_NAMES = {"rm", "rmdir", "unlink", "shred", "srm", "trash", "rimraf"}
WRAPPER_NAMES = {
    "bash", "sh", "zsh", "dash", "ksh", "eval", "exec", "xargs", "sudo", "env", "nohup", "time", "command",
    "node", "deno", "bun", "ruby", "perl", "php", "osascript",
}

# --- 자동 허용 범위 ---
# 1) AI 산출물·임시 경로(.orchestrator/, 세션 scratchpad) 하위 — 파일·폴더 모두, 확장자 무관
# 2) 프로젝트(cwd) 안의 일반 코드 파일(CODE_EXT). 설정 파일·보호 디렉터리는 제외
# 3) 프로젝트(cwd) 안의 재생성 가능한 산출물 폴더(BUILD_DIRS) — 재귀 삭제 허용
SAFE_DIR_NAMES = {".orchestrator"}
SAFE_ABS_PREFIXES = ("/private/tmp/claude-", "/tmp/claude-")
CODE_EXT = {
    ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".scss", ".less",
    ".html", ".vue", ".svelte", ".py", ".php", ".md", ".mdx",
}
BUILD_DIRS = {"dist", ".next", ".turbo", ".vercel", "coverage", "node_modules"}
PROTECTED_DIR_NAMES = {".git", ".claude", ".github", ".husky", ".vscode", "config"}  # 폴더·파일 삭제 공통
FILE_PROTECTED_DIR_NAMES = {"node_modules"}  # 폴더째 지우는 건 허용, 그 안의 개별 파일은 건드리지 않는다
PROTECTED_FILE_GLOBS = (
    "*.config.*", ".eslintrc*", ".prettierrc*", "CLAUDE.md", "AGENTS.md", "next-env.d.ts", "*.d.ts",
    "wp-config*.php",
)
RAW_META = re.compile(r"[`\n]|\$\(|\$\{")
SEPARATORS = {"&&", ";", "||", "|", "&", "|&"}
SIMPLE_SEPARATORS = {"&&", ";"}
GLOB_CHARS = set("*?[]{}~$")


def matches_delete(text):
    return bool(DELETE_CMD.search(text)) or any(p.search(text) for p in OTHER_PATTERNS)


def find_delete(cmd):
    """문자열 전체 기준(보수적)으로 삭제로 보이는 첫 매치의 텍스트. 없으면 None."""
    for pattern in (DELETE_CMD, *OTHER_PATTERNS):
        m = pattern.search(cmd)
        if m:
            return m.group(0).strip(" ;&|(`'\"$/") or m.group(0)
    return None


def build_reason(matched, description):
    parts = [f"삭제 명령으로 보여 확인을 요청합니다 (감지: {matched})"]
    if isinstance(description, str) and description.strip():
        parts.append(f"설명: {description.strip()}")
    else:
        parts.append("설명 없음")
    parts.append("~/.claude/hooks/ask-before-delete.py")
    return " | ".join(parts)


def split_segments(cmd):
    """(구간 목록, 단순 여부). 서브셸·heredoc·`$(…)` 등 쪼갤 수 없으면 None.

    단순 = `&&`·`;`로만 이었고 파이프·리다이렉트·백그라운드가 없다. 단순하지 않은 명령은 자동 허용하지 않는다.
    """
    if RAW_META.search(cmd):
        return None
    try:
        lexer = shlex.shlex(cmd, posix=True, punctuation_chars=True)
        lexer.whitespace_split = True
        tokens = list(lexer)
    except ValueError:
        return None
    segments, current, simple = [], [], True
    for tok in tokens:
        if tok in SEPARATORS:
            segments.append(current)
            current = []
            simple = simple and tok in SIMPLE_SEPARATORS
        elif tok and set(tok) <= set("();<>|&"):
            if "(" in tok or ")" in tok:
                return None
            simple = False  # 리다이렉트 등: 토큰 자체는 버린다
        elif "(" in tok or ")" in tok:
            return None
        else:
            current.append(tok)
    segments.append(current)
    return [seg for seg in segments if seg], simple


def delete_label(seg):
    """이 구간이 실제로 삭제를 실행하면 사유 라벨을, 아니면 None."""
    name = os.path.basename(seg[0])
    args = seg[1:]
    if name in DELETE_NAMES:
        return name
    for tok in args:  # find -delete, git rm, docker rm, xargs rm 처럼 토큰 자체가 삭제 명령인 경우
        if tok in DELETE_NAMES or tok == "-delete":
            return tok
    if name == "git" and "clean" in args:
        return "git clean"
    if name == "mv" and any(".Trash" in t for t in args):
        return "mv → .Trash"
    if (name in WRAPPER_NAMES or name.startswith("python")) and matches_delete(" ".join(seg)):
        return f"{name} 안의 삭제"
    return None


def _resolve(raw, cwd):
    if GLOB_CHARS & set(raw):
        return None
    if os.path.isabs(raw):
        return os.path.realpath(raw)
    if not os.path.isabs(cwd or ""):
        return None
    return os.path.realpath(os.path.join(cwd, raw))


def _inside_project(real, cwd):
    root = os.path.realpath(cwd)
    return root != os.sep and real != root and os.path.commonpath([root, real]) == root


def _is_safe_file(raw, cwd):
    real = _resolve(raw, cwd)
    if real is None:
        return False
    parts = set(real.split(os.sep))
    if parts & (PROTECTED_DIR_NAMES | FILE_PROTECTED_DIR_NAMES):
        return False
    if real.startswith(SAFE_ABS_PREFIXES) or parts & SAFE_DIR_NAMES:
        return True
    name = os.path.basename(real)
    if any(fnmatch.fnmatch(name, g) for g in PROTECTED_FILE_GLOBS):
        return False
    return os.path.splitext(name)[1] in CODE_EXT and _inside_project(real, cwd)


def _is_safe_dir(raw, cwd):
    real = _resolve(raw, cwd)
    if real is None:
        return False
    parts = set(real.split(os.sep))
    if parts & PROTECTED_DIR_NAMES:
        return False
    if real.startswith(SAFE_ABS_PREFIXES) or parts & SAFE_DIR_NAMES:
        return True
    if not _inside_project(real, cwd):
        return False
    rel = os.path.relpath(real, os.path.realpath(cwd))
    return bool(set(rel.split(os.sep)) & BUILD_DIRS)


def judge_rm(tokens, cwd):
    """`rm …` 한 구간의 판정: "allow" | "deny" | "ask"."""
    recursive, targets, past_opts = False, [], False
    for tok in tokens[1:]:
        if not past_opts and tok == "--":
            past_opts = True
        elif not past_opts and tok.startswith("-"):
            if tok.startswith("--") or not set(tok[1:]) <= set("fivrR"):
                return "ask"
            recursive = recursive or bool(set(tok[1:]) & set("rR"))
        else:
            targets.append(tok)
    if not targets:
        return "ask"
    if recursive:
        return "allow" if all(_is_safe_dir(t, cwd) for t in targets) else "deny"
    return "allow" if all(_is_safe_file(t, cwd) for t in targets) else "ask"


def judge(segments, simple, cwd):
    verdicts, cd_seen = [], False
    for seg in segments:
        if seg[0] == "rm":
            verdicts.append(judge_rm(seg, cwd))
        elif seg[0] in ("cd", "pushd", "popd"):
            cd_seen = True
        elif delete_label(seg):
            verdicts.append("ask")
    if "deny" in verdicts:
        return "deny"
    if cd_seen or not simple or not verdicts or "ask" in verdicts:
        return "ask"  # cd 뒤의 상대경로, 파이프·리다이렉트가 낀 명령은 신뢰하지 않는다
    return "allow"


def emit(decision, reason):
    json.dump(
        {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": decision,
                "permissionDecisionReason": reason,
            }
        },
        sys.stdout,
        ensure_ascii=False,
    )


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        return
    if data.get("tool_name") != "Bash":
        return
    tool_input = data.get("tool_input") or {}
    cmd = tool_input.get("command")
    if not isinstance(cmd, str):
        return
    description = tool_input.get("description")

    parsed = split_segments(cmd)
    if parsed is None:  # 쪼갤 수 없는 형태 — 문자열 전체를 보수적으로 훑는다
        matched = find_delete(cmd)
        if matched is not None:
            emit("ask", build_reason(matched, description))
        return

    segments, simple = parsed
    labels = [lbl for lbl in (delete_label(seg) for seg in segments) if lbl]
    if not labels:
        return
    verdict = judge(segments, simple, data.get("cwd"))
    if verdict == "allow":
        emit("allow", "코드 파일·산출물 폴더·AI 산출물 삭제 — 자동 허용 (~/.claude/hooks/ask-before-delete.py)")
    elif verdict == "deny":
        emit(
            "deny",
            "재귀 삭제(rm -r/-R/-rf/-fr)는 산출물 폴더(dist, .next, .turbo, .vercel, coverage, node_modules) 외에는 "
            "차단됩니다. 폴더는 mv로 ~/.Trash에 옮기세요 (~/.claude/hooks/ask-before-delete.py)",
        )
    else:
        emit("ask", build_reason(labels[0], description))


if __name__ == "__main__":
    main()
