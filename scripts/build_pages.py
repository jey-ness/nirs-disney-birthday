#!/usr/bin/env python3
"""Build the password-protected copy of the site for GitHub Pages.

    python3 scripts/build_pages.py            # asks for the password, writes docs/
    PAGES_PASSWORD=... python3 scripts/build_pages.py --out /tmp/x   # non-interactive

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
COPY = ["index.html", "bookings/index.html", "sw.js", "manifest.webmanifest"] + \
       [os.path.relpath(p, ROOT) for p in glob.glob(os.path.join(ROOT, "day/*/index.html"))] + \
       [os.path.relpath(p, ROOT) for p in glob.glob(os.path.join(ROOT, "assets/*"))]


def read_local_config():
    """Pull mapsKey, mapId and confirmations out of the git-ignored config.js."""
    path = os.path.join(ROOT, "config.js")
    if not os.path.exists(path):
        return {}
    src = open(path, encoding="utf-8").read()
    pick = lambda k: (re.search(rf'\b{k}\s*:\s*"([^"]*)"', src) or [None, ""])[1]
    conf = {k: v for k, v in re.findall(r'\b(\w+)\s*:\s*"([^"]*)"', re.search(r"confirmations\s*:\s*\{([^}]*)\}", src).group(1))} \
        if re.search(r"confirmations\s*:\s*\{", src) else {}
    return {"mapsKey": pick("mapsKey"), "mapId": pick("mapId"), "confirmations": {k: v for k, v in conf.items() if v}}


def encrypt(payload: bytes, password: str) -> dict:
    salt, iv = secrets.token_bytes(16), secrets.token_bytes(16)
    keys = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, ITERATIONS, dklen=64)
    enc_key, mac_key = keys[:32], keys[32:]
    ct = subprocess.run(
        ["openssl", "enc", "-aes-256-cbc", "-K", enc_key.hex(), "-iv", iv.hex(), "-nosalt"],
        input=payload, capture_output=True, check=True,
    ).stdout
    mac = hmac.new(mac_key, iv + ct, hashlib.sha256).digest()
    b = lambda x: base64.b64encode(x).decode()
    return {"v": 1, "kdf": "PBKDF2-SHA256", "iter": ITERATIONS, "salt": b(salt), "iv": b(iv), "ct": b(ct), "mac": b(mac)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "docs"))
    args = ap.parse_args()

    password = os.environ.get("PAGES_PASSWORD")
    if not password:
        password = getpass.getpass("Site password: ")
        if password != getpass.getpass("Same password again: "):
            sys.exit("Passwords don't match.")
    if len(password) < 10:
        sys.exit("Use at least 10 characters. Anyone can download the encrypted file and guess offline, so a long passphrase matters.")

    trip = json.load(open(os.path.join(ROOT, "data/trip.json"), encoding="utf-8"))
    payload = json.dumps({"trip": trip, "config": read_local_config()}, ensure_ascii=False).encode("utf-8")

    out = os.path.abspath(args.out)
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
    json.dump(encrypt(payload, password), open(os.path.join(out, "data/trip.enc.json"), "w"))
    open(os.path.join(out, "config.js"), "w").write("window.TRIP_CONFIG = { encrypted: true };\n")
    open(os.path.join(out, ".nojekyll"), "w").write("")
    open(os.path.join(out, "robots.txt"), "w").write("User-agent: *\nDisallow: /\n")

    # Safety net: nothing readable from the plan may leak into the build
    leaks = []
    cfg = read_local_config()
    # values that must only exist encrypted: keys, confirmations, and readable text from the plan itself
    secrets_to_check = [v for v in [cfg.get("mapsKey")] + list(cfg.get("confirmations", {}).values()) if v]
    secrets_to_check += [trip["travelers"]] + [d["summary"] for d in trip["days"]] + \
        [s["name"] for d in trip["days"] for s in d["stops"]] + [b["when"] for b in trip["booked"]]
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
    print("  next: commit docs/ and push main; GitHub Pages serves main /docs")


if __name__ == "__main__":
    main()
