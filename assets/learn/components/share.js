/* share.js — LX.Share and LX.copyText: share a state of the page as a link. The state travels in a name-safe #hash
   (letters, digits, - and _), the link is copied to the clipboard, and a select-and-copy fallback covers browsers that
   refuse (lesson 13's plan links, e.g. #plan-w530-s160-g220-p70-n0-b10-e50-fuel385). The lesson keeps its own encoder
   and decoder of the state; this component does the button, the address, the copy and the status line.
   var sh = LX.Share(host, {               host: where the link box goes (hidden until the first share)
     hash: function () { return "plan-w530-s160"; },    the state to share (a leading # is dropped; unsafe characters are
                                                         percent-encoded)
     note: "Anyone who opens this link sees your plan and runs its year themselves.",   the label above the link
     button: rowElement,                   where to put a "share" button (optional; or call sh.share() from your own)
     buttonText: "Share this plan",        buttonClass: "lx-btn ghost small"
     id: "t13-link",                       the link field's id (default: generated)
     replace: true,                        also write the hash into the address bar (history.replaceState; default true)
     copied: "Copied to the clipboard.",   manual: "Select the link and copy it."   (status texts)
     onShare: function (url, copied) {} });
   sh.share() -> Promise of true (copied) or false: builds the link, shows the box (label, read-only field, status line),
     copies, scrolls the box into view | sh.url() the link now | sh.el (the box) | sh.button (or null)
   LX.copyText(text, { select: inputOrTextarea }) -> Promise of true or false: navigator.clipboard first; if it is missing
     or refuses, select the field's text and try document.execCommand("copy").
   Keyboard: the button is a real button; the field selects its whole text on focus; the status line is aria-live.
   Node: module.exports = { shareUrl, isNameSafe, cleanHash } (pure). */
(function () {
  "use strict";
  // ---------------------------------------------------------------- pure helpers (no DOM; exported for Node)
  function isNameSafe(h) { return typeof h === "string" && /^[A-Za-z0-9_-]+$/.test(h); }
  function cleanHash(h) { h = String(h == null ? "" : h).replace(/^#/, ""); return isNameSafe(h) ? h : encodeURIComponent(h); }
  function shareUrl(href, hash) { return String(href).split("#")[0] + "#" + cleanHash(hash); }
  if (typeof module !== "undefined" && module.exports) module.exports = { shareUrl: shareUrl, isNameSafe: isNameSafe, cleanHash: cleanHash };
  if (typeof window === "undefined" || !window.LX) return;

  // ---------------------------------------------------------------- view
  var LX = window.LX, H = LX.H;
  LX.copyText = function (text, opt) {
    var el = opt && opt.select;
    function fallback() {
      if (!el) return false;
      try { el.focus(); el.select(); return !!document.execCommand("copy"); } catch (e) { return false; }
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(function () { return true; }, fallback);
    } catch (e) { /* fall through */ }
    return Promise.resolve(fallback());
  };
  LX.Share = function (host, o) {
    var box = H("div", { class: "lx-share", hidden: true }, host), id = o.id || LX.uid("share");
    var btn = o.button ? H("button", { class: o.buttonClass || "lx-btn ghost small", type: "button", text: o.buttonText || "Share this link" }, o.button) : null;
    function url() { return shareUrl(location.href, o.hash()); }
    function share() {
      var h = cleanHash(o.hash()), u = shareUrl(location.href, h);
      if (o.replace !== false) { try { history.replaceState(null, "", "#" + h); } catch (e) { /* not allowed here */ } }
      box.hidden = false; box.innerHTML = "";
      if (o.note) H("label", { class: "lx-share-note", for: id, html: LX.rich(o.note) }, box);
      var inp = H("input", { id: id, type: "text", readonly: true, value: u, "aria-label": o.note ? null : "Link to share" }, box);
      var msg = H("p", { class: "lx-share-note", "aria-live": "polite" }, box);
      inp.addEventListener("focus", function () { inp.select(); });
      var p = LX.copyText(u, { select: inp }).then(function (ok) {
        msg.textContent = ok ? (o.copied || "Copied to the clipboard.") : (o.manual || "Select the link and copy it.");
        if (o.onShare) o.onShare(u, ok);
        return ok;
      });
      box.scrollIntoView({ block: "nearest" });
      LX.emit("layout");
      return p;
    }
    if (btn) btn.addEventListener("click", share);
    return { el: box, button: btn, share: share, url: url };
  };
})();
