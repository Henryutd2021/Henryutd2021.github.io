#!/usr/bin/env python3
"""Post-render step (project: post-render in _quarto.yml): Subresource Integrity for the tags Quarto writes itself.

Quarto's HTML template writes the MathJax <script> (its URL is pinned in _quarto.yml, html-math-method) and, before it,
the ES6 polyfill from cdnjs.cloudflare.com/polyfill, which no option turns off. After each render this script, for every
rendered page:
  - adds integrity (SHA-384, from SRI below) and crossorigin="anonymous" to each CDN <script> whose URL is in SRI;
  - removes the polyfill <script>: its content is generated per browser, so it cannot be pinned or hashed, and no browser
    that can run the site needs it (the next inline script in the same template is ES6 already);
  - removes HTML comments (outside <script>, <style>, <pre> and <textarea>): pandoc copies the source's <!-- ... --> notes
    (build notes, generated-block markers) into every page, and they are for the source only. The page's text, markup and
    scripts are unchanged.
A CDN <script> or stylesheet without integrity that is not in SRI is reported and the render fails, so a version bump
cannot ship without its hash: after changing a version, run  python3 scripts/site_sri.py --update  from the repository
root that holds scripts/; it recomputes the hashes here and in the other files that hold them.
Standard library only. Quarto sets QUARTO_PROJECT_OUTPUT_DIR and QUARTO_PROJECT_OUTPUT_FILES.
"""
import os
import re
import sys

SRI = {   # URL (exact version) -> SHA-384 of the file served there
    "https://cdn.jsdelivr.net/npm/mathjax@4.1.3/tex-chtml.js": "sha384-IgpmJyK7IVIVd18E1Ubslp9a1s6/6VBt9aJFbpzNIJPPMaxwEV7OxR/xY0hHbSck",
}
POLYFILL = re.compile(r'[ \t]*<script src="https://cdnjs\.cloudflare\.com/polyfill/v3/polyfill\.min\.js\?features=es6"></script>\n?')
SCRIPT = re.compile(r"<script\b[^>]*\bsrc=\"(https://[^\"]+)\"[^>]*>")
CDN = re.compile(r"<(?:script|link)\b[^>]*\b(?:src|href)=\"https://(?:cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com|unpkg\.com|code\.jquery\.com)/[^>]*>")
TEMPLATE = re.compile(r"<template\b.*?</template>", re.S)   # inert markup (the visitor widget) is not loaded as is
KEEP = re.compile(r"(<(script|style|pre|textarea)\b.*?</\2\s*>)", re.S | re.I)   # raw text: comments there are not markup
COMMENT = re.compile(r"<!--(?!\[if|<!\[endif).*?-->", re.S)


def strip_comments(html):
    parts = KEEP.split(html)   # [outside, block, tag name, outside, block, tag name, ...]
    out = []
    for i in range(0, len(parts), 3):
        out.append(COMMENT.sub("", parts[i]))
        if i + 1 < len(parts):
            out.append(parts[i + 1])
    return "".join(out)


def fix(page):
    text = open(page, encoding="utf8").read()
    new = strip_comments(POLYFILL.sub("", text))

    def add(m):
        tag, url = m.group(0), m.group(1)
        if url in SRI and "integrity=" not in tag:
            tag = tag[:-1] + ' integrity="%s" crossorigin="anonymous">' % SRI[url]
        return tag
    new = SCRIPT.sub(add, new)
    if new != text:
        open(page, "w", encoding="utf8").write(new)
    return [t for t in CDN.findall(TEMPLATE.sub("", new)) if "integrity=" not in t]


def main():
    out = os.environ.get("QUARTO_PROJECT_OUTPUT_DIR", "_site")
    files = [f for f in os.environ.get("QUARTO_PROJECT_OUTPUT_FILES", "").splitlines() if f.endswith(".html")]
    if not files:
        files = [os.path.join(d, n) for d, _, ns in os.walk(out) for n in ns if n.endswith(".html")]
    missing = {}
    for f in files:
        if os.path.exists(f):
            for tag in fix(f):
                missing.setdefault(tag, []).append(f)
    for tag, pages in missing.items():
        print(f"post-render: no SRI hash for {tag} ({len(pages)} pages, e.g. {pages[0]}); "
              "run python3 scripts/site_sri.py --update", file=sys.stderr)
    sys.exit(1 if missing else 0)


if __name__ == "__main__":
    main()
