#!/usr/bin/env python3
"""Publish a celebration card to a static host and verify it.

Platforms
  cloudflare     Cloudflare Pages      → https://<name>.pages.dev      (wrangler login, or CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID)
  vercel         Vercel                → https://<name>.vercel.app     (vercel login, or VERCEL_TOKEN)
  netlify        Netlify               → https://<name>.netlify.app    (netlify login, or NETLIFY_AUTH_TOKEN)
  netlify-anon   Netlify, no account   → random URL, password-protected, deleted after ~60 min unless claimed
  surge          surge.sh              → https://<name>.surge.sh       (surge login, or SURGE_LOGIN + SURGE_TOKEN)

Usage
  python3 deploy.py <card-dir> --to cloudflare [--name maya-30-k7f2q] [--team SLUG]      # prints the PLAN only
  python3 deploy.py <card-dir> --to cloudflare --yes                                     # actually publishes
  python3 deploy.py <card-dir> --yes                                                     # redeploy using <card>/deploy.json

Defaults: put {"platform": "cloudflare", "team": "…"} in ~/.config/celebration-card/deploy.json to use them
for every card unless --to/--team say otherwise (resolution: flags > card deploy.json > user defaults).

What it does: checks the CLI login (or token env vars), stages a clean copy of the card (no qa/,
notes, deploy.json, dev tools), writes absolute og:url / og:image for the final address, deploys,
verifies the page / preview image / audio seeking over HTTPS, and records the result in
<card>/deploy.json so later redeploys are one command.

Never uploaded, whatever the card folder holds: hidden files and folders (.env, .git, CLI state),
key and credential files, files with no extension, and links that point outside the card folder.
The plan lists any it held back under "not_uploaded".

Publishing puts the sender's photos and words on a public URL — always show the plan to the user and
get a yes before running with --yes. Tokens are only read from the environment, never passed as flags.
"""
import argparse
import json
import os
import re
import secrets
import shutil
import string
import subprocess
import sys
import tempfile
import urllib.request
from datetime import datetime
from pathlib import Path

# check: CLI command whose success means "logged in"; ok/fail: patterns its output must / must not contain.
PLATFORMS = {
    "cloudflare": {"url": "https://{name}.pages.dev/", "file_limit": 25 * 1024 * 1024, "env": ["CLOUDFLARE_API_TOKEN"],
                   "login": "npx wrangler login", "check": ["npx", "--yes", "wrangler@latest", "whoami"],
                   "ok": r"You are logged in", "fail": r"not authenticated|not logged in"},
    "vercel": {"url": "https://{name}.vercel.app/", "file_limit": 100 * 1024 * 1024, "env": ["VERCEL_TOKEN"],
               "login": "npx vercel login", "check": ["npx", "--yes", "vercel@latest", "whoami"],
               "ok": r"\S", "fail": r"Not authorized|\"status\":\s*\"error\"|No existing credentials|not logged in"},
    "netlify": {"url": "https://{name}.netlify.app/", "file_limit": 100 * 1024 * 1024, "env": ["NETLIFY_AUTH_TOKEN"],
                "login": "npx netlify-cli login", "check": ["npx", "--yes", "netlify-cli@latest", "status"],
                "ok": r"Current Netlify User|Email:", "fail": r"Not logged in"},
    "netlify-anon": {"url": None, "file_limit": 10 * 1024 * 1024, "env": [], "login": None, "check": None},
    "surge": {"url": "https://{name}.surge.sh/", "file_limit": 100 * 1024 * 1024, "env": ["SURGE_TOKEN"],
              "login": "npx surge login", "check": ["npx", "--yes", "surge", "whoami"],
              "ok": r"@", "fail": r"not authenticated|not logged in|Login"},
}
EXCLUDE_DIRS = {"qa", "node_modules", "__pycache__", "examples"}
EXCLUDE_FILES = {"deploy.json", "song-preview.html", "preview.html", "Thumbs.db"}
# Never uploaded: hidden files and folders, key and credential files, and files with no extension
# (a web page never needs those, and bare private keys have none).
PRIVATE_SUFFIXES = {".env", ".pem", ".key", ".p12", ".pfx", ".keystore", ".jks"}
PRIVATE_NAMES = {"credentials.json", "secrets.json", "token.json"}
PLAIN_NAMES_OK = {"_headers", "_redirects", "CNAME"}  # host config files that legitimately have no extension
QUIET_HIDDEN = {".DS_Store", ".gitkeep", ".git"}  # expected clutter: skipped without a mention in the plan


def why_private(rel):
    """Reason a file must not be published, or None if it is fine to upload."""
    if any(part.startswith(".") for part in rel.parts):
        return "hidden"
    if rel.suffix.lower() in PRIVATE_SUFFIXES or rel.name.lower() in PRIVATE_NAMES:
        return "key or credential file"
    if not rel.suffix and rel.name not in PLAIN_NAMES_OK:
        return "no file extension"
    return None


def slugify(s):
    s = re.sub(r"[^a-z0-9-]+", "-", s.lower()).strip("-")
    return re.sub(r"-{2,}", "-", s)[:40] or "card"


def default_name(card):
    suffix = "".join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(5))
    return f"{slugify(card.name)}-{suffix}"  # unguessable: the page holds personal photos


def run(cmd, env=None, cwd=None, timeout=900):
    r = subprocess.run(cmd, capture_output=True, text=True, env=env, cwd=cwd, timeout=timeout)
    return r.returncode, (r.stdout or "") + (r.stderr or "")


def logged_in(platform, env):
    p = PLATFORMS[platform]
    if p["check"] is None:
        return True, "no account needed"
    if any(env.get(k) for k in p["env"]):
        return True, f"token from {', '.join(k for k in p['env'] if env.get(k))}"
    code, out = run(p["check"], env=env, timeout=180)
    ok = code == 0 and re.search(p["ok"], out) is not None and re.search(p["fail"], out, re.I) is None
    return ok, ("logged in via CLI" if ok else "not logged in")


def stage(card, name, include_md, tmp):
    """Copy what gets published into tmp/<name>. Returns (folder, files that were held back as private)."""
    root = Path(tmp) / name
    uses_music = "music/" in (card / "main.js").read_text(errors="ignore") if (card / "main.js").exists() else True
    held_back = []
    for src in card.rglob("*"):
        rel = src.relative_to(card)
        if src.is_dir() or any(part in EXCLUDE_DIRS for part in rel.parts[:-1]) or src.name in EXCLUDE_FILES:
            continue
        reason = why_private(rel)
        if reason is None and src.is_symlink() and not src.resolve().is_relative_to(card):
            reason = "link to a file outside the card folder"
        if reason:
            if not any(part in QUIET_HIDDEN for part in rel.parts):
                held_back.append(f"{rel.as_posix()} ({reason})")
            continue
        if not uses_music and rel.parts and rel.parts[0] == "music":
            continue  # the score isn't loaded by this card (file-audio route)
        if src.suffix.lower() == ".md" and not include_md:
            continue  # README / CREDITS / suno-prompt are for the sender, not the recipient
        dst = root / rel
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)
    return root, sorted(held_back)


def set_og(index_html, url):
    html = index_html.read_text()
    has_og = (index_html.parent / "og.jpg").exists()
    def put(prop, value, html):
        pat = re.compile(rf'(<meta\s+property="{re.escape(prop)}"\s+content=")[^"]*(")', re.I)
        if pat.search(html):
            return pat.sub(lambda m: m.group(1) + value + m.group(2), html)
        return html.replace("</head>", f'  <meta property="{prop}" content="{value}" />\n</head>', 1)
    html = put("og:url", url, html)
    if has_og:
        html = put("og:image", url + "og.jpg", html)
    index_html.write_text(html)
    return has_og


def find_urls(text, domain):
    return list(dict.fromkeys(re.findall(rf"https://[a-z0-9.-]+\.{re.escape(domain)}[^\s\"'<>]*", text)))


def wrangler(args, env):
    """Run a wrangler command. Recent wrangler versions hand Pages commands to Cloudflare's newer Workers flow; when that
    fails it asks for --force to use Pages itself, so try once more with it."""
    code, out = run(["npx", "--yes", "wrangler@latest", *args], env=env)
    if code != 0 and "--force" in out and "Cloudflare Pages" in out:
        code, out = run(["npx", "--yes", "wrangler@latest", *args, "--force"], env=env)
    return code, out


def deploy(platform, staged, name, team, env):
    """Run the platform CLI; return (ok, production_url, extra_info, raw_output)."""
    if platform == "cloudflare":
        if env.get("CLOUDFLARE_ACCOUNT_ID") is None and team:
            env["CLOUDFLARE_ACCOUNT_ID"] = team
        code, out = wrangler(["pages", "project", "create", name, "--production-branch", "main"], env)
        if code != 0 and not re.search(r"already exists|8000002", out):
            return False, None, "", out
        code, out = wrangler(["pages", "deploy", str(staged), "--project-name", name, "--branch", "main", "--commit-dirty=true"], env)
        urls = find_urls(out, "pages.dev")
        prod = None
        if urls:  # deployment URL is https://<hash>.<project>.pages.dev → production is the project subdomain
            host = urls[0].split("/")[2]
            labels = host.split(".")
            prod = f"https://{'.'.join(labels[1:]) if len(labels) > 3 else host}/"
        return code == 0, prod, (urls[0] if urls else ""), out
    if platform == "vercel":
        cmd = ["npx", "--yes", "vercel@latest", "deploy", str(staged), "--prod", "--yes"]
        if team:
            cmd += ["--scope", team]
        code, out = run(cmd, env=env)
        urls = find_urls(out, "vercel.app")
        prod = min(urls, key=len) if urls else None  # the alias (name.vercel.app) is the shortest
        return code == 0, (prod.rstrip("/") + "/") if prod else None, "", out
    if platform in ("netlify", "netlify-anon"):
        cmd = ["npx", "--yes", "netlify-cli@latest", "deploy", "--dir", str(staged), "--prod", "--no-build", "--json"]
        if platform == "netlify-anon":
            cmd += ["--allow-anonymous"]
        else:
            code, out = run(["npx", "--yes", "netlify-cli@latest", "sites:list", "--json"], env=env)
            try:
                sites = json.loads(out[out.index("["):]) if "[" in out else []
                exists = any(site.get("name") == name for site in sites)
            except (ValueError, json.JSONDecodeError):
                exists = False
            cmd += ["--site", name] if exists else ["--site-name", name]
            if team and not exists:
                cmd += ["--team", team]
        code, out = run(cmd, env=env)
        info, prod = "", None
        m = re.search(r"\{.*\}", out, re.S)
        if m:
            try:
                data = json.loads(m.group(0))
                prod = data.get("ssl_url") or data.get("url") or data.get("deploy_url")
                if prod and prod.startswith("http://"):
                    prod = "https://" + prod[len("http://"):]
                info = json.dumps({k: data[k] for k in data if k in ("site_name", "deploy_url", "claim_url", "password", "expires_at")})
            except json.JSONDecodeError:
                pass
        if not prod:
            urls = find_urls(out, "netlify.app")
            prod = urls[0] if urls else None
        return code == 0 and bool(prod), (prod.rstrip("/") + "/") if prod else None, info, out
    if platform == "surge":
        domain = f"{name}.surge.sh"
        code, out = run(["npx", "--yes", "surge", str(staged), domain], env=env)
        return code == 0, f"https://{domain}/", "", out
    raise SystemExit(f"unknown platform {platform}")


def http(url, method="GET", headers=None):
    if not url.startswith("https://"):  # only ever check the published site, never a local or file address
        return 0, b"not an https address"
    req = urllib.request.Request(url, method=method, headers={"User-Agent": "celebration-card-deploy/1.0", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.status, r.read(400 if method == "GET" else 0)
    except urllib.error.HTTPError as e:
        return e.code, b""
    except Exception as e:  # noqa: BLE001
        return 0, str(e).encode()


def verify(url, staged):
    checks = {}
    code, body = http(url)
    checks["page"] = code
    if (staged / "og.jpg").exists():
        checks["og.jpg"] = http(url + "og.jpg", "HEAD")[0]
    audio = next((p for p in (staged / "assets" / "audio").glob("*.mp3")), None) if (staged / "assets" / "audio").exists() else None
    if audio:
        rel = audio.relative_to(staged).as_posix()
        checks["audio seeking"] = http(url + rel, "GET", {"Range": "bytes=0-1"})[0]
    return checks


def notes_for(checks):
    """Plain-language notes on the checks that need one."""
    notes = {}
    if checks.get("audio seeking") == 206:
        notes["audio seeking"] = "206: the host supports range requests"
    elif checks.get("audio seeking") == 200:
        notes["audio seeking"] = "200: the host ignores range requests (Cloudflare Pages); fine, the card plays songs up to 15 MB from memory"
    return notes


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("card")
    ap.add_argument("--to", choices=list(PLATFORMS), help="platform (default: the one in deploy.json)")
    ap.add_argument("--name", help="project / subdomain name (default: from deploy.json, else <folder>-<random>)")
    ap.add_argument("--team", help="Vercel scope, Netlify team slug, or Cloudflare account id")
    ap.add_argument("--include-md", action="store_true", help="also publish .md files (README, CREDITS…)")
    ap.add_argument("--yes", action="store_true", help="actually publish (without it, only the plan is printed)")
    args = ap.parse_args()

    card = Path(args.card).resolve()
    if not (card / "index.html").exists():
        sys.exit(f"{card} has no index.html")
    cfg_path = card / "deploy.json"
    cfg = json.loads(cfg_path.read_text()) if cfg_path.exists() else {}
    user_defaults_path = Path.home() / ".config" / "celebration-card" / "deploy.json"
    user_defaults = json.loads(user_defaults_path.read_text()) if user_defaults_path.exists() else {}
    platform = args.to or cfg.get("platform") or user_defaults.get("platform")
    if not platform:
        sys.exit("Choose a platform with --to (cloudflare, vercel, netlify, netlify-anon, surge).")
    name = slugify(args.name) if args.name else (cfg.get("name") if cfg.get("platform") == platform else None) or default_name(card)
    team = args.team or cfg.get("team") or (user_defaults.get("team") if platform == user_defaults.get("platform") else None)
    spec = PLATFORMS[platform]
    expected = spec["url"].format(name=name) if spec["url"] else "(assigned by Netlify)"
    with tempfile.TemporaryDirectory(prefix="card-deploy-") as tmp:  # staging copy: removed however this ends
        publish(args, card, cfg, cfg_path, platform, name, team, spec, expected, tmp)


def publish(args, card, cfg, cfg_path, platform, name, team, spec, expected, tmp):
    env = dict(os.environ)
    staged, held_back = stage(card, name, args.include_md, tmp)
    files = [p for p in staged.rglob("*") if p.is_file()]
    total = sum(p.stat().st_size for p in files)
    too_big = [f"{p.relative_to(staged)} ({p.stat().st_size / 1e6:.1f} MB)" for p in files if p.stat().st_size > spec["file_limit"]]
    has_og = (staged / "og.jpg").exists()

    auth_ok, auth_note = logged_in(platform, env)
    plan = {
        "platform": platform, "name": name, "url": expected, "team": team, "files": len(files),
        "size_mb": round(total / 1e6, 1), "auth": auth_note if auth_ok else f"NOT READY — {auth_note}",
        "excluded": "qa/, *.md (README, CREDITS, suno-prompt), deploy.json, music/examples, song-preview.html, hidden files" + ("" if (staged / "music").exists() else ", music/ (not used)"),
        **({"not_uploaded": held_back} if held_back else {}),
        "link_preview": ("password-protected: previews won't unfurl" if platform == "netlify-anon"
                         else "og:url + og:image set to the live address" if has_og else "no og.jpg — previews will show without an image"),
    }
    print(json.dumps({"plan": plan}, indent=2, ensure_ascii=False))
    if too_big:
        sys.exit(f"Files over the {spec['file_limit'] // 1024 // 1024} MB per-file limit for {platform}: {too_big}. Compress them first (prepare_media.py --video-max 960).")
    if not auth_ok:
        login = spec["login"]
        sys.exit(f"\nNot logged in to {platform}. Either run  ! {login}  (opens a browser), or set {' / '.join(spec['env'])} in the environment, then re-run.")
    if platform == "netlify-anon":
        print("\nNote: anonymous Netlify sites are password-protected and deleted after ~60 minutes unless claimed with a free account.")
    if not args.yes:
        print("\nPlan only. Show this to the user; re-run with --yes to publish.")
        return

    if spec["url"]:
        set_og(staged / "index.html", expected)
    ok, url, info, out = deploy(platform, staged, name, team, env)
    if not ok or not url:
        print(out[-2500:])
        sys.exit(f"\nDeploy to {platform} failed (see output above). If the name is taken, re-run with a different --name.")
    if spec["url"] and url != expected:  # host gave a different address: fix the absolute OG tags and redeploy once
        set_og(staged / "index.html", url)
        ok2, url2, info2, out2 = deploy(platform, staged, name, team, env)
        url = url2 or url
    checks = verify(url, staged)
    if spec["url"] or platform == "netlify-anon":
        set_og(card / "index.html", url)  # keep the source in sync with what's live
    record = {"platform": platform, "name": name, "team": team, "url": url, "deployedAt": datetime.now().isoformat(timespec="seconds"),
              "checks": checks, "info": info, "history": (cfg.get("history", []) + [{"url": url, "at": datetime.now().isoformat(timespec="seconds")}])[-10:]}
    cfg_path.write_text(json.dumps(record, indent=2))
    print(json.dumps({"published": url, "checks": checks, "notes": notes_for(checks) or None, "info": info or None, "recorded": str(cfg_path)}, indent=2, ensure_ascii=False))
    bad = {k: v for k, v in checks.items() if not (isinstance(v, int) and 200 <= v < 300)}
    if bad:
        print(f"\nWarning: some checks didn't pass yet (CDN propagation can take a minute): {bad}")
    print(f"\nShare it: \"Made you something 🎉 Open it with sound on: {url}\"\nQR code for a paper card: npx --yes qrcode -o qr.png \"{url}\"")


if __name__ == "__main__":
    main()
