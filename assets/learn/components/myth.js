/* myth.js — myth-or-fact cards and quick questions, written as plain markup that works without JS.
   <div class="lx-myths" data-quiz="g0-myth">                       (or class="lx-quiz" for a quick question with more options)
     <div class="lx-qq" data-id="store" data-answer="myth">
       <p class="lx-qtext">“A power plant can store electricity for later.”</p>
       <ul class="lx-choices"><li data-value="myth">Myth</li><li data-value="fact">Fact</li></ul>
       <details class="lx-answer"><summary>Answer</summary><p>Myth. One or two sentences why.</p></details>
     </div> ...
   </div>
   With JS the options become buttons; a pick shows right or not quite plus the "why" from the answer box: all of it, its
   later paragraphs, lists and tables included (the first paragraph's "Myth." or "Fact." is dropped). Answers stay in
   this browser (LX.progress.answer). A score line counts the right answers. */
(function () {
  "use strict";
  var LX = window.LX, H = LX.H;
  // the answer box's whole "why": its first paragraph (without the leading "Myth." or "Fact.") runs on after "Right." or
  // "Not quite."; every later paragraph, list or table follows as it is, so nothing the answer says is lost with JS
  function whyHTML(det) {
    var parts = Array.prototype.filter.call(det.childNodes, function (n) {
      return n.nodeType === 1 ? n.tagName !== "SUMMARY" : n.nodeType === 3 && /\S/.test(n.nodeValue);
    });
    if (!parts.length) return { first: "", rest: "" };
    var head = parts[0], rest = parts.slice(1);
    var first = head.nodeType === 3 ? LX.esc(head.nodeValue.trim()) : head.tagName === "P" ? head.innerHTML : null;
    if (first == null) { first = ""; rest = parts; }
    return { first: first.replace(/^\s*(Myth|Fact)\.\s*/, ""),
      rest: rest.map(function (n) {
        if (n.nodeType === 3) return "<p>" + LX.esc(n.nodeValue.trim()) + "</p>";
        return n.tagName === "TABLE" ? '<div class="lx-scroll-x">' + n.outerHTML + "</div>" : n.outerHTML;   // a table scrolls on a phone
      }).join("") };
  }
  function setup(box) {
    var qid = box.getAttribute("data-quiz") || "quiz";
    var cards = box.querySelectorAll(".lx-qq"), score = H("p", { class: "lx-score", "aria-live": "polite" }, box);
    function tally() {
      var right = box.querySelectorAll(".lx-qq.is-right").length, done = box.querySelectorAll(".lx-qq.is-done").length;
      score.textContent = done ? right + " of " + cards.length + " right" + (right === cards.length ? ". Well done." : ".") : "";
    }
    cards.forEach(function (q, i) {
      var id = qid + "-" + (q.getAttribute("data-id") || i + 1), ans = q.getAttribute("data-answer");
      var list = q.querySelector(".lx-choices"), det = q.querySelector("details.lx-answer"), stem = q.querySelector(".lx-qtext");
      if (!list || !ans) return;
      if (stem && !stem.id) stem.id = LX.uid("qs");
      var why = det ? whyHTML(det) : "";
      var group = H("div", { class: "lx-qbtns", role: "group", "aria-labelledby": stem ? stem.id : null }, null);
      var fb = H("div", { class: "lx-qfb", "aria-live": "polite" }, null);
      var btns = Array.prototype.map.call(list.querySelectorAll("li"), function (li) {
        var v = li.getAttribute("data-value"), b = H("button", { class: "lx-choice", type: "button", "aria-pressed": "false", text: li.textContent.trim() }, group);
        b.addEventListener("click", function () { LX.progress.answer(id, v); paint(v); });
        return { b: b, v: v };
      });
      function paint(v) {
        btns.forEach(function (x) {
          x.b.setAttribute("aria-pressed", x.v === v ? "true" : "false");
          x.b.classList.toggle("right", !!v && x.v === ans && v === ans);
          x.b.classList.toggle("wrong", !!v && x.v === v && v !== ans);
        });
        q.classList.toggle("is-done", !!v); q.classList.toggle("is-right", v === ans);
        fb.innerHTML = "";
        if (v) H("div", { class: "lx-saw" + (v === ans ? "" : " no"), html: LX.icon(v === ans ? "check" : "question") + "<div><b>" +
          (v === ans ? "Right." : "Not quite.") + "</b> " + why.first + why.rest + "</div>" }, fb);
        tally();
      }
      list.parentNode.replaceChild(group, list);
      group.parentNode.insertBefore(fb, group.nextSibling);
      if (det) det.hidden = true;
      paint(LX.progress.answer(id));
    });
    tally();
  }
  LX.ready(function () { document.querySelectorAll(".lx-myths, .lx-quiz").forEach(setup); });
})();
