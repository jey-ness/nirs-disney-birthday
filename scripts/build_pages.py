#!/usr/bin/env python3
"""Build the password-protected copy of the site for GitHub Pages.

    python3 scripts/build_pages.py --save-password   # once: store the password in the macOS Keychain
    python3 scripts/build_pages.py            # uses the Keychain password (or asks), writes docs/
    PAGES_PASSWORD=... python3 scripts/build_pages.py --out /tmp/x   # non-interactive

Every build checks the password against the previous docs/data/trip.enc.json, so a typo
can't silently lock everyone out. Use --change-password to switch to a new password on purpose.

GitHub Pages serves docs/ from the main branch. Writes docs/ with the pages and assets, but the trip plan, confirmation
numbers and Maps key exist only inside docs/data/trip.enc.json, encrypted
with the password. Nothing readable about the trip is in docs/.

Crypto: PBKDF2-HMAC-SHA256 (600k iterations, random salt) -> 64 bytes:
first 32 = AES-256-CBC key, last 32 = HMAC-SHA256 key over iv||ciphertext.
AES runs through the system `openssl`, so no Python packages are needed.
The browser side is in assets/app.js (decryptBlob).
"""
import argparse, base64, getpass, glob, hashlib, hmac, json, os, re, secrets, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ITERATIONS = 600_000
KEYCHAIN_SERVICE = "nirs-disney-birthday-site"
COPY = ["index.html", "bookings/index.html", "menu/index.html", "sw.js", "manifest.webmanifest"] + \
       [os.path.relpath(p, ROOT) for p in glob.glob(os.path.join(ROOT, "day/*/index.html"))] + \
       [os.path.relpath(p, ROOT) for p in glob.glob(os.path.join(ROOT, "assets/*"))]


def read_local_config():
    """Pull mapsKey, mapId, Supabase settings and confirmations out of the git-ignored config.js."""
    path = os.path.join(ROOT, "config.js")
    if not os.path.exists(path):
        return {}
    src = open(path, encoding="utf-8").read()
    pick = lambda k: (re.search(rf'\b{k}\s*:\s*"([^"]*)"', src) or [None, ""])[1]
    conf = {k: v for k, v in re.findall(r'\b(\w+)\s*:\s*"([^"]*)"', re.search(r"confirmations\s*:\s*\{([^}]*)\}", src).group(1))} \
        if re.search(r"confirmations\s*:\s*\{", src) else {}
    return {"mapsKey": pick("mapsKey"), "mapId": pick("mapId"),
            "supabaseUrl": pick("supabaseUrl"), "supabaseAnonKey": pick("supabaseAnonKey"),
            "confirmations": {k: v for k, v in conf.items() if v}}


def encrypt(payload: bytes, password: str, salt: bytes = None) -> dict:
    salt = salt or secrets.token_bytes(16)
    iv = secrets.token_bytes(16)
    keys = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, ITERATIONS, dklen=64)
    enc_key, mac_key = keys[:32], keys[32:]
    ct = subprocess.run(
        ["openssl", "enc", "-aes-256-cbc", "-K", enc_key.hex(), "-iv", iv.hex(), "-nosalt"],
        input=payload, capture_output=True, check=True,
    ).stdout
    mac = hmac.new(mac_key, iv + ct, hashlib.sha256).digest()
    b = lambda x: base64.b64encode(x).decode()
    return {"v": 1, "kdf": "PBKDF2-SHA256", "iter": ITERATIONS, "salt": b(salt), "iv": b(iv), "ct": b(ct), "mac": b(mac)}


def keychain_password():
    """The site password from the macOS Keychain, or None. Never printed."""
    r = subprocess.run(["security", "find-generic-password", "-a", os.environ.get("USER", ""), "-s", KEYCHAIN_SERVICE, "-w"],
                       capture_output=True, text=True)
    return r.stdout.rstrip("\n") if r.returncode == 0 and r.stdout.strip() else None


def opens_previous(password: str, prev: dict) -> bool:
    """True if this password derives the key whose HMAC signed the previous build."""
    keys = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), base64.b64decode(prev["salt"]), prev["iter"], dklen=64)
    mac = hmac.new(keys[32:], base64.b64decode(prev["iv"]) + base64.b64decode(prev["ct"]), hashlib.sha256).digest()
    return hmac.compare_digest(mac, base64.b64decode(prev["mac"]))


def load_prev(out):
    try:
        return json.load(open(os.path.join(out, "data/trip.enc.json")))
    except (OSError, ValueError):
        return None


def save_password(out):
    prev = load_prev(out)
    pw = getpass.getpass("Site password to save in the Keychain: ")
    if prev and not opens_previous(pw, prev):
        sys.exit("That password doesn't open the current site, so it wasn't saved. Try again.")
    if not prev and pw != getpass.getpass("Same password again: "):
        sys.exit("Passwords don't match.")
    # local call only; the value is never printed. Read it back to confirm it was stored.
    subprocess.run(["security", "add-generic-password", "-U", "-a", os.environ.get("USER", ""), "-s", KEYCHAIN_SERVICE,
                    "-l", "Nir's Disney birthday site", "-w", pw], check=True, capture_output=True)
    if keychain_password() != pw:
        sys.exit("Couldn't read the password back from the Keychain.")
    print("Saved in the macOS Keychain (" + KEYCHAIN_SERVICE + "). Builds no longer ask for it.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "docs"))
    ap.add_argument("--new-salt", action="store_true",
                    help="start fresh: every phone must re-enter the password and synced edits start empty")
    ap.add_argument("--save-password", action="store_true", help="store the site password in the macOS Keychain and exit")
    ap.add_argument("--change-password", action="store_true", help="allow a password that doesn't open the current site")
    args = ap.parse_args()
    out = os.path.abspath(args.out)
    if args.save_password:
        return save_password(out)

    password = os.environ.get("PAGES_PASSWORD")
    source = "environment"
    if not password and not args.change_password:
        password, source = keychain_password(), "Keychain"
    if not password:
        source = "typed"
        password = getpass.getpass("Site password: ")
        if password != getpass.getpass("Same password again: "):
            sys.exit("Passwords don't match.")
    prev = load_prev(out)
    if prev and not args.new_salt and not args.change_password and prev.get("iter") == ITERATIONS and not opens_previous(password, prev):
        sys.exit(f"Stopped: the {source} password doesn't open the current site, so phones would be locked out. "
                 "Nothing was changed. (Use --change-password to switch passwords on purpose.)")
    if len(password) < 10:
        sys.exit("Use at least 10 characters. Anyone can download the encrypted file and guess offline, so a long passphrase matters.")

    trip = json.load(open(os.path.join(ROOT, "data/trip.json"), encoding="utf-8"))
    stickers_path = os.path.join(ROOT, "data/stickers.json")  # git-ignored; pictures of Nir only ship encrypted
    stickers = json.load(open(stickers_path)) if os.path.exists(stickers_path) else []
    payload = json.dumps({"trip": trip, "config": read_local_config(), "stickers": stickers}, ensure_ascii=False).encode("utf-8")

    # Keep the previous salt: the same password then gives the same key, so phones stay
    # unlocked and live-sync edits (stored under an id derived from that key) carry over.
    salt = None
    prev = os.path.join(out, "data/trip.enc.json")
    if os.path.exists(prev) and not args.new_salt:
        try:
            old = json.load(open(prev))
            if old.get("iter") == ITERATIONS:
                salt = base64.b64decode(old["salt"])
        except (ValueError, KeyError):
            salt = None
    if os.path.exists(out):
        keep_git = os.path.join(out, ".git")
        for name in os.listdir(out):  # never touch a .git folder
            p = os.path.join(out, name)
            if p != keep_git:
                shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
    for rel in COPY:
        dst = os.path.join(out, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy2(os.path.join(ROOT, rel), dst)
    os.makedirs(os.path.join(out, "data"), exist_ok=True)
    json.dump(encrypt(payload, password, salt), open(os.path.join(out, "data/trip.enc.json"), "w"))
    open(os.path.join(out, "config.js"), "w").write("window.TRIP_CONFIG = { encrypted: true };\n")
    open(os.path.join(out, ".nojekyll"), "w").write("")
    open(os.path.join(out, "robots.txt"), "w").write("User-agent: *\nDisallow: /\n")

    # Safety net: nothing readable from the plan may leak into the build
    leaks = []
    cfg = read_local_config()
    # values that must only exist encrypted: keys, confirmations, and readable text from the plan itself
    secrets_to_check = [v for v in [cfg.get("mapsKey"), cfg.get("supabaseUrl"), cfg.get("supabaseAnonKey")] + list(cfg.get("confirmations", {}).values()) if v]
    secrets_to_check += [trip["travelers"]] + [d["summary"] for d in trip["days"]] + \
        [s["name"] for d in trip["days"] for s in d["stops"]] + [b["when"] for b in trip["booked"]]
    secrets_to_check += [st["src"][-200:] for st in stickers]  # sticker pictures only ever ship encrypted
    for dirpath, _, files in os.walk(out):
        if ".git" in dirpath.split(os.sep):
            continue
        for f in files:
            if f == "trip.enc.json":
                continue
            text = open(os.path.join(dirpath, f), "rb").read().decode("utf-8", "ignore")
            if any(s in text for s in secrets_to_check):
                leaks.append(os.path.relpath(os.path.join(dirpath, f), out))
    if leaks:
        sys.exit("Stopped: readable trip data found in " + ", ".join(leaks))

    print(f"Built {out}")
    print("  trip plan, confirmations and Maps key: encrypted in data/trip.enc.json")
    print(f"  password: {source}" + (", checked against the previous build" if prev and not args.change_password and not args.new_salt else ""))
    print("  salt: " + ("kept from the previous build (phones stay unlocked, synced edits carry over)" if salt else "new"))
    print("  next: commit docs/ and push main; GitHub Pages serves main /docs")


if __name__ == "__main__":
    main()
