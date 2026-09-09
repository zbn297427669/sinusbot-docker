#!/usr/bin/env python3
"""
Minimal password-protected page to set YouTube cookies for SinusBot's yt-dlp.

Writes:
  /data/youtube-cookies.txt   — Netscape cookie file
  /data/yt-dlp.conf           — tells yt-dlp to use that cookies file

Env:
  COOKIE_ADMIN_PASSWORD  — required; empty = refuse to start
  COOKIE_FILE            — default /data/youtube-cookies.txt
  YTDLP_CONF             — default /data/yt-dlp.conf
  COOKIES_PATH_IN_BOT    — path yt-dlp sees inside sinusbot container
  BIND                   — default 0.0.0.0:8099
"""

from __future__ import annotations

import hashlib
import hmac
import html
import os
import secrets
import time
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs

PASSWORD = os.environ.get("COOKIE_ADMIN_PASSWORD", "").strip()
COOKIE_FILE = os.environ.get("COOKIE_FILE", "/data/youtube-cookies.txt")
YTDLP_CONF = os.environ.get("YTDLP_CONF", "/data/yt-dlp.conf")
COOKIES_PATH_IN_BOT = os.environ.get(
    "COOKIES_PATH_IN_BOT", "/opt/sinusbot/data/youtube-cookies.txt"
)
BIND = os.environ.get("BIND", "0.0.0.0:8099")

SESSION_TTL_SEC = 12 * 3600
_sessions: dict[str, float] = {}


def _hash_pw(pw: str) -> str:
    return hashlib.sha256(pw.encode("utf-8")).hexdigest()


def _new_session() -> str:
    tok = secrets.token_urlsafe(32)
    _sessions[tok] = time.time() + SESSION_TTL_SEC
    return tok


def _session_ok(tok: str | None) -> bool:
    if not tok:
        return False
    exp = _sessions.get(tok)
    if not exp:
        return False
    if time.time() > exp:
        _sessions.pop(tok, None)
        return False
    return True


def _purge_sessions() -> None:
    now = time.time()
    dead = [k for k, exp in _sessions.items() if exp <= now]
    for k in dead:
        _sessions.pop(k, None)


def _looks_like_netscape(text: str) -> bool:
    lines = [ln.strip() for ln in text.splitlines() if ln.strip() and not ln.strip().startswith("#")]
    if not lines:
        return False
    # Netscape: domain \t flag \t path \t secure \t expiry \t name \t value
    sample = lines[0].split("\t")
    return len(sample) >= 7


def _save_cookies(raw: str) -> None:
    text = raw.replace("\r\n", "\n").replace("\r", "\n").strip() + "\n"
    if not text.strip():
        raise ValueError("cookies 内容为空")
    if not _looks_like_netscape(text):
        raise ValueError(
            "格式不像 Netscape cookies.txt（需要用浏览器扩展导出，"
            "且包含用 Tab 分隔的域名行）"
        )
    os.makedirs(os.path.dirname(COOKIE_FILE) or ".", exist_ok=True)
    tmp = COOKIE_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        if not text.lstrip().startswith("#"):
            f.write("# Netscape HTTP Cookie File\n")
        f.write(text)
    os.replace(tmp, COOKIE_FILE)
    os.chmod(COOKIE_FILE, 0o644)

    conf = f"--cookies {COOKIES_PATH_IN_BOT}\n"
    tmp_c = YTDLP_CONF + ".tmp"
    with open(tmp_c, "w", encoding="utf-8") as f:
        f.write(conf)
    os.replace(tmp_c, YTDLP_CONF)
    os.chmod(YTDLP_CONF, 0o644)


def _status_bits() -> tuple[bool, str, bool]:
    exists = os.path.isfile(COOKIE_FILE)
    size = ""
    if exists:
        try:
            st = os.stat(COOKIE_FILE)
            size = f"{st.st_size} bytes, mtime={time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(st.st_mtime))}"
        except OSError as e:
            size = str(e)
    conf_ok = os.path.isfile(YTDLP_CONF)
    return exists, size, conf_ok


PAGE_CSS = """
:root { --bg:#0f1419; --card:#1a2332; --text:#e7ecf3; --muted:#8b9bb4; --accent:#3d8bfd; --ok:#3dd68c; --bad:#ff6b6b; }
* { box-sizing: border-box; }
body { margin:0; font-family: ui-sans-serif, system-ui, sans-serif; background:var(--bg); color:var(--text); }
main { max-width:720px; margin:40px auto; padding:0 16px; }
.card { background:var(--card); border-radius:12px; padding:24px; }
h1 { margin:0 0 8px; font-size:1.35rem; }
p,li { color:var(--muted); line-height:1.5; }
.ok { color:var(--ok); } .bad { color:var(--bad); }
label { display:block; margin:16px 0 6px; font-size:.9rem; }
input[type=password], textarea {
  width:100%; background:#0c1118; color:var(--text); border:1px solid #2a3548;
  border-radius:8px; padding:10px 12px; font:inherit;
}
textarea { min-height:220px; font-family: ui-monospace, monospace; font-size:.85rem; }
button {
  margin-top:16px; background:var(--accent); color:#fff; border:0; border-radius:8px;
  padding:10px 18px; font:inherit; cursor:pointer; font-weight:600;
}
button.secondary { background:#2a3548; margin-left:8px; }
.flash { margin:12px 0; padding:10px 12px; border-radius:8px; background:#0c1118; }
.steps { margin:12px 0 0; padding-left:18px; }
"""


def _page(title: str, body: str) -> bytes:
    doc = f"""<!DOCTYPE html>
<html lang="zh-CN"><head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>{html.escape(title)}</title>
<style>{PAGE_CSS}</style>
</head><body><main><div class="card">{body}</div></main></body></html>"""
    return doc.encode("utf-8")


class Handler(BaseHTTPRequestHandler):
    server_version = "YtCookiesWeb/1.0"

    def log_message(self, fmt: str, *args) -> None:
        print(f"[{self.log_date_time_string()}] {self.address_string()} {fmt % args}")

    def _read_body(self) -> bytes:
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0:
            return b""
        if n > 2_000_000:
            raise ValueError("body too large")
        return self.rfile.read(n)

    def _cookie_token(self) -> str | None:
        raw = self.headers.get("Cookie") or ""
        c = SimpleCookie()
        try:
            c.load(raw)
        except Exception:
            return None
        morsel = c.get("yc_session")
        return morsel.value if morsel else None

    def _set_session_headers(self, tok: str | None, clear: bool = False) -> list[tuple[str, str]]:
        if clear:
            return [("Set-Cookie", "yc_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0")]
        if not tok:
            return []
        return [(
            "Set-Cookie",
            f"yc_session={tok}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_TTL_SEC}",
        )]

    def _send(self, code: int, body: bytes, extra: list[tuple[str, str]] | None = None) -> None:
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in extra or []:
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def _login_form(self, flash: str = "") -> bytes:
        msg = f'<div class="flash bad">{html.escape(flash)}</div>' if flash else ""
        return _page(
            "YouTube Cookies",
            f"""
            <h1>YouTube Cookies</h1>
            <p>给 SinusBot / yt-dlp 设置 cookies（解决 “Sign in to confirm you’re not a bot”）。</p>
            {msg}
            <form method="post" action="/login">
              <label>管理密码</label>
              <input type="password" name="password" required autofocus/>
              <button type="submit">登录</button>
            </form>
            """,
        )

    def _admin_form(self, flash: str = "", ok: bool = False) -> bytes:
        exists, size, conf_ok = _status_bits()
        status = (
            f'<p class="ok">cookies 已存在：{html.escape(size)}</p>'
            if exists
            else '<p class="bad">尚未设置 cookies</p>'
        )
        status += (
            '<p class="ok">yt-dlp.conf 已写入</p>'
            if conf_ok
            else '<p class="bad">yt-dlp.conf 尚未写入</p>'
        )
        flash_html = ""
        if flash:
            cls = "ok" if ok else "bad"
            flash_html = f'<div class="flash {cls}">{html.escape(flash)}</div>'
        return _page(
            "YouTube Cookies",
            f"""
            <h1>YouTube Cookies</h1>
            {status}
            {flash_html}
            <ol class="steps">
              <li>浏览器登录 YouTube</li>
              <li>用扩展导出 <b>Netscape</b> 格式 cookies.txt（站点 youtube.com）</li>
              <li>粘贴下方或选择文件上传 → 保存</li>
              <li>重启 sinusbot 容器后试播</li>
            </ol>
            <form method="post" action="/save" enctype="multipart/form-data">
              <label>粘贴 cookies.txt 内容</label>
              <textarea name="cookies" placeholder="# Netscape HTTP Cookie File&#10;..."></textarea>
              <label>或上传文件</label>
              <input type="file" name="file" accept=".txt,text/plain"/>
              <div>
                <button type="submit">保存</button>
                <button type="submit" formaction="/logout" formmethod="post" class="secondary" formnovalidate>退出</button>
              </div>
            </form>
            """,
        )

    def do_GET(self) -> None:
        _purge_sessions()
        path = self.path.split("?", 1)[0]
        if path in ("/", "/index.html"):
            if _session_ok(self._cookie_token()):
                self._send(200, self._admin_form())
            else:
                self._send(200, self._login_form())
            return
        if path == "/healthz":
            self._send(200, b"ok")
            return
        self._send(404, _page("404", "<h1>Not found</h1>"))

    def do_POST(self) -> None:
        _purge_sessions()
        path = self.path.split("?", 1)[0]
        try:
            raw = self._read_body()
        except ValueError as e:
            self._send(400, _page("Error", f"<h1>{html.escape(str(e))}</h1>"))
            return

        ctype = (self.headers.get("Content-Type") or "").lower()

        if path == "/login":
            fields = parse_qs(raw.decode("utf-8", errors="replace"))
            pw = (fields.get("password") or [""])[0]
            if hmac.compare_digest(_hash_pw(pw), _hash_pw(PASSWORD)):
                tok = _new_session()
                self._send(302, b"", self._set_session_headers(tok) + [("Location", "/")])
            else:
                self._send(401, self._login_form("密码错误"))
            return

        if path == "/logout":
            tok = self._cookie_token()
            if tok:
                _sessions.pop(tok, None)
            self._send(302, b"", self._set_session_headers(None, clear=True) + [("Location", "/")])
            return

        if path == "/save":
            if not _session_ok(self._cookie_token()):
                self._send(401, self._login_form("请先登录"))
                return
            try:
                text = self._extract_cookies_payload(raw, ctype)
                _save_cookies(text)
                self._send(
                    200,
                    self._admin_form(
                        "已保存。请执行：docker restart sinusbot，然后 Stop/Clear 后再播。",
                        ok=True,
                    ),
                )
            except Exception as e:
                self._send(400, self._admin_form(str(e), ok=False))
            return

        self._send(404, _page("404", "<h1>Not found</h1>"))

    def _extract_cookies_payload(self, raw: bytes, ctype: str) -> str:
        if "multipart/form-data" in ctype:
            # Minimal multipart parse: prefer file field, else cookies textarea
            boundary = ""
            for part in ctype.split(";"):
                part = part.strip()
                if part.startswith("boundary="):
                    boundary = part.split("=", 1)[1].strip().strip('"')
            if not boundary:
                raise ValueError("bad multipart")
            parts = raw.split(("--" + boundary).encode())
            file_text = ""
            paste_text = ""
            for part in parts:
                if b"Content-Disposition" not in part:
                    continue
                header, _, body = part.partition(b"\r\n\r\n")
                if not body:
                    continue
                body = body.rstrip(b"\r\n-")
                header_s = header.decode("utf-8", errors="replace")
                if 'name="file"' in header_s and body.strip():
                    file_text = body.decode("utf-8", errors="replace")
                elif 'name="cookies"' in header_s:
                    paste_text = body.decode("utf-8", errors="replace")
            text = file_text.strip() or paste_text.strip()
            if not text:
                raise ValueError("请粘贴内容或选择文件")
            return text
        fields = parse_qs(raw.decode("utf-8", errors="replace"))
        text = (fields.get("cookies") or [""])[0].strip()
        if not text:
            raise ValueError("请粘贴内容或选择文件")
        return text


def main() -> None:
    if not PASSWORD:
        raise SystemExit("COOKIE_ADMIN_PASSWORD is required (set a non-empty password)")
    host, _, port_s = BIND.rpartition(":")
    host = host or "0.0.0.0"
    port = int(port_s or "8099")
    httpd = ThreadingHTTPServer((host, port), Handler)
    print(f"yt-cookies-web listening on http://{host}:{port}")
    print(f"cookie file -> {COOKIE_FILE}")
    print(f"yt-dlp conf -> {YTDLP_CONF} (--cookies {COOKIES_PATH_IN_BOT})")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
