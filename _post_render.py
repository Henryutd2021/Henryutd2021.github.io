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
  - adds og:url, equal to the page's canonical link (Quarto writes the canonical link, canonical-url in _quarto.yml, but
    no og:url);
  - marks the navbar link of the section a nested page belongs to (Projects for projects/*, Learn for learn/*, Notes for
    field-notes/*): class "active" as on the section's own page, and aria-current="true" (aria-current="page" stays on
    the exact match, which Quarto marks);
  - listing pages whose post titles come straight after the page title (Briefings, Perspectives): the titles become <h2>
    and the margin's "Categories" heading <h2> too, so no heading level is skipped; the class h3 or h5 keeps their look;
  - 404.html: a robots noindex meta (Quarto already leaves it out of the sitemap and the search index).
Then the sitemap's directory indexes are written as the canonical links write them (.../learn/, not .../learn/index.html).
Checks (the render fails on any): every page except 404.html has exactly one canonical link and an og:url equal to it;
every og:image is an address on this site whose file was rendered.
A CDN <script> or stylesheet without integrity that is not in SRI is reported and the render fails, so a version bump
cannot ship without its hash: after changing a version, run the SRI update step; it recomputes the hashes here and
in the other files that hold them.
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
CANON = re.compile(r'<link rel="canonical" href="([^"]+)">')
OGURL = re.compile(r'<meta property="og:url" content="([^"]*)">')
OGIMG = re.compile(r'<meta property="og:image" content="([^"]*)">')
HEADER = re.compile(r'<header id="quarto-header".*?</header>', re.S)
NAVLINK = re.compile(r'<a class="nav-link" href="([^"#?]+)">')
LISTING_H3 = re.compile(r'<h3 class="no-anchor listing-title">(.*?)</h3>', re.S)
CATEGORY_H5 = re.compile(r'<h5 class="quarto-listing-category-title">(.*?)</h5>', re.S)


def site_url():
    """The site's address from _quarto.yml (website: site-url), with a trailing slash; None without one."""
    try:
        m = re.search(r'^\s*site-url:\s*"?([^"\s]+)"?\s*$', open("_quarto.yml", encoding="utf8").read(), re.M)
    except OSError:
        return None
    return m.group(1).rstrip("/") + "/" if m else None


def outside_raw(html, fn):
    """fn applied to the markup outside <script>, <style>, <pre> and <textarea> (their text is not markup)."""
    parts = KEEP.split(html)   # [outside, block, tag name, outside, block, tag name, ...]
    out = []
    for i in range(0, len(parts), 3):
        out.append(fn(parts[i]))
        if i + 1 < len(parts):
            out.append(parts[i + 1])
    return "".join(out)


def og_url(html):
    """An og:url equal to the canonical link, after og:site_name (or after the canonical link)."""
    m = CANON.search(html)
    if not m or OGURL.search(html):
        return html
    tag = '<meta property="og:url" content="%s">' % m.group(1)
    site_name = re.search(r'<meta property="og:site_name" content="[^"]*">', html)
    at = site_name.end() if site_name else m.end()
    return html[:at] + "\n" + tag + html[at:]


def nav_section(html, rel, out):
    """On a nested page, the navbar link of its section gets class active and aria-current="true". A link's section is
    the folder of its target when the target is a folder's index (learn/index.html -> learn/), or the folder named like
    the target page (projects.html -> projects/, field-notes.html -> field-notes/)."""
    page_dir = os.path.dirname(rel)

    def mark(header):
        def one(m):
            target = os.path.normpath(os.path.join(page_dir, m.group(1))).replace(os.sep, "/")
            if target == rel:
                return m.group(0)
            if os.path.basename(target) == "index.html":
                section = os.path.dirname(target)
            else:
                section = target[:-5] if target.endswith(".html") else ""
                if not os.path.isdir(os.path.join(out, section)):
                    section = ""
            if section and section != "." and rel.startswith(section + "/"):
                return '<a class="nav-link active" href="%s" aria-current="true">' % m.group(1)
            return m.group(0)
        return NAVLINK.sub(one, header)
    return HEADER.sub(lambda h: mark(h.group(0)), html, count=1)


def listing_headings(html):
    """Post titles of a listing straight after the page title (no <h2> in <main> before the first one) become <h2>;
    the margin's "Categories" heading becomes <h2>. Changed outside raw text only."""
    first = LISTING_H3.search(html)
    main = html.find("<main")
    lift = bool(first and 0 <= main < first.start() and not re.search(r"<h2\b", html[main:first.start()]))

    def sub(part):
        if lift:
            part = LISTING_H3.sub(lambda m: '<h2 class="no-anchor listing-title h3">%s</h2>' % m.group(1), part)
        return CATEGORY_H5.sub(lambda m: '<h2 class="quarto-listing-category-title h5">%s</h2>' % m.group(1), part)
    return outside_raw(html, sub)


def noindex(html):
    if 'name="robots"' in html:
        return html
    return re.sub(r'(<meta charset="utf-8">)', r'\1\n<meta name="robots" content="noindex">', html, count=1)


def problems_of(html, rel, out, base):
    """What the checks find wrong with one page (canonical, og:url, og:image)."""
    found = []
    canon = CANON.findall(html)
    ogurl = OGURL.findall(html)
    if rel == "404.html":
        if canon or ogurl:
            found.append("404.html has a canonical link or og:url")
    elif len(canon) != 1:
        found.append("%d canonical links" % len(canon))
    elif ogurl != canon:
        found.append("og:url %s does not match the canonical link %s" % (ogurl, canon[0]))
    for img in OGIMG.findall(html):
        if not base or not img.startswith(base):
            found.append("og:image %s is not on this site" % img)
        elif not os.path.isfile(os.path.join(out, img[len(base):].split("?")[0].split("#")[0])):
            found.append("og:image %s has no rendered file" % img)
    return found


def sitemap(out, base):
    """Directory indexes in the sitemap as the canonical links write them (.../ rather than .../index.html)."""
    f = os.path.join(out, "sitemap.xml")
    if not base or not os.path.exists(f):
        return
    text = open(f, encoding="utf8").read()
    new = re.sub(r"<loc>(%s(?:[^<]*/)?)index\.html</loc>" % re.escape(base), r"<loc>\1</loc>", text)
    if new != text:
        open(f, "w", encoding="utf8").write(new)


def strip_comments(html):
    return outside_raw(html, lambda part: COMMENT.sub("", part))


def fix(page, out, base):
    text = open(page, encoding="utf8").read()
    rel = os.path.relpath(page, out).replace(os.sep, "/")
    new = strip_comments(POLYFILL.sub("", text))
    new = listing_headings(nav_section(og_url(new), rel, out))   # head tags and the navbar hold no raw text
    if rel == "404.html":
        new = noindex(new)

    def add(m):
        tag, url = m.group(0), m.group(1)
        if url in SRI and "integrity=" not in tag:
            tag = tag[:-1] + ' integrity="%s" crossorigin="anonymous">' % SRI[url]
        return tag
    new = SCRIPT.sub(add, new)
    if new != text:
        open(page, "w", encoding="utf8").write(new)
    page_problems = problems_of(new, rel, out, base) if "<head" in new else []
    return [t for t in CDN.findall(TEMPLATE.sub("", new)) if "integrity=" not in t], page_problems


def main():
    out = os.environ.get("QUARTO_PROJECT_OUTPUT_DIR", "_site")
    files = [f for f in os.environ.get("QUARTO_PROJECT_OUTPUT_FILES", "").splitlines() if f.endswith(".html")]
    if not files:
        files = [os.path.join(d, n) for d, _, ns in os.walk(out) for n in ns if n.endswith(".html")]
    base = site_url()
    missing, wrong = {}, []
    for f in files:
        if os.path.exists(f) and not re.match(r"google[0-9a-f]+\.html$", os.path.basename(f)):
            tags, page_problems = fix(f, out, base)
            for tag in tags:
                missing.setdefault(tag, []).append(f)
            wrong += ["%s: %s" % (os.path.relpath(f, out), p) for p in page_problems]
    sitemap(out, base)
    for tag, pages in missing.items():
        print(f"post-render: no SRI hash for {tag} ({len(pages)} pages, e.g. {pages[0]}); "
              "run the SRI update step", file=sys.stderr)
    for w in wrong:
        print("post-render: " + w, file=sys.stderr)
    sys.exit(1 if missing or wrong else 0)


if __name__ == "__main__":
    main()
