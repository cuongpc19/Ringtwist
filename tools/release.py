"""Both builds for publishing, each checked before it is kept.

    python tools/release.py

1. The CrazyGames build (`build.py crazy`): every shipped level replayed out of
   it (tools/verify_build.js), then zipped with index.html at the zip's root to
   release/ringtwist-crazygames-<date>-<commit>.zip - the file the CrazyGames
   developer portal takes. The unzipped copy stays beside it in
   release/crazygames/ to open from disk or check by hand.
2. Then the plain web build back into dist/, checked the same way: what
   serve.py shows a phone. (GitHub Pages builds its own from src/ in CI -
   .github/workflows/pages.yml.)

Commit first: the build stamp in the page reads the commit, and a "+" after it
means the tree had changes that are not in any commit.
"""
import datetime
import pathlib
import shutil
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, DIST, OUT = ROOT / "src", ROOT / "dist", ROOT / "release"


def run(cmd, cwd):
    print("$", " ".join(cmd))
    r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    tail = (r.stdout or "").strip().splitlines()[-3:]
    print("\n".join("  " + ln for ln in tail))
    if r.returncode:
        print(r.stdout[-3000:], r.stderr[-3000:])
        sys.exit("failed: " + " ".join(cmd))


def build(target):
    run([sys.executable, "build.py"] + ([target] if target != "web" else []), SRC)
    run(["node", "tools/verify_build.js"], ROOT)


def main():
    commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip() or "nogit"
    dirty = bool(subprocess.run(["git", "status", "--porcelain"], cwd=ROOT, capture_output=True, text=True).stdout.strip())
    OUT.mkdir(exist_ok=True)

    build("crazy")
    copy = OUT / "crazygames"
    if copy.exists():
        shutil.rmtree(copy)
    shutil.copytree(DIST, copy)
    name = "ringtwist-crazygames-%s-%s%s" % (datetime.date.today().strftime("%Y%m%d"), commit, "-dirty" if dirty else "")
    zipf = shutil.make_archive(str(OUT / name), "zip", root_dir=copy)
    print("CrazyGames upload: %s (%d KB)" % (zipf, pathlib.Path(zipf).stat().st_size // 1024))

    build("web")
    print("web build in", DIST)
    if dirty:
        print("⚠ the tree has uncommitted changes: commit, then run this again for a clean stamp")


if __name__ == "__main__":
    main()
