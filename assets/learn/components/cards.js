/* cards.js — LX.StepCards: one idea per card; "Next" waits until the reader has done the card's action.
   const cards = LX.StepCards(host, { id: "l3-steps", steps: [
     { text: "One or two sentences that set the task.",          // or a function (act, api) that builds and returns the text
       build: function (act, api) { ... api.done(); api.saw("What the reader just saw."); },
       free: true }                                             // free: Next is open from the start (no action needed)
   ], onStep: function (i) {} });
   cards.go(i) | cards.index() | cards.count   progress dots, "Step n of N", Back and Next; the last card hides Next.
   api.saw(text, bad) shows what the reader saw; text takes glossary marks and **bold**.
   Text budget: card text is one or two sentences; anything longer goes in a Go deeper box inside `act`. */
(function () {
  "use strict";
  var LX = window.LX, H = LX.H;
  LX.StepCards = function (host, o) {
    var card = H("div", { class: "lx-stepcard lx-guard" }, host), N = o.steps.length, i = 0, unlocked = {};
    function render(k) {
      i = k; card.innerHTML = "";
      var top = H("div", { class: "lx-step-top" }, card);
      var dots = H("div", { class: "lx-dots", "aria-hidden": "true" }, top);
      for (var d = 0; d < N; d++) H("i", { class: d < i ? "done" : d === i ? "cur" : "" }, dots);
      H("span", { class: "lx-step-n", text: "Step " + (i + 1) + " of " + N }, top);
      var p = H("p", { class: "lx-step-text", "aria-live": "polite" }, card);
      var act = H("div", { class: "lx-step-act" }, card);
      var sawBox = H("div", { "aria-live": "polite" }, card);
      var foot = H("div", { class: "lx-step-foot" }, card);
      var back = H("button", { class: "lx-btn ghost small", type: "button", text: "Back" }, foot);
      back.disabled = i === 0;
      back.addEventListener("click", function () { render(i - 1); });
      var nx = H("button", { class: "lx-btn small", type: "button", html: "Next" + LX.icon("arrow") }, foot);
      var st = o.steps[i];
      if (st.free) unlocked[i] = true;
      nx.disabled = !unlocked[i]; nx.hidden = i === N - 1;
      nx.addEventListener("click", function () { if (unlocked[i]) { render(i + 1); card.scrollIntoView({ block: "nearest", behavior: LX.reduced() ? "auto" : "smooth" }); } });
      var api = {
        done: function () { unlocked[i] = true; nx.disabled = false; },
        saw: function (t, bad) { sawBox.innerHTML = ""; H("div", { class: "lx-saw" + (bad ? " no" : ""), html: LX.icon(bad ? "question" : "check") + "<div>" + LX.rich(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>") + "</div>" }, sawBox); },
        card: card, index: i
      };
      var txt = typeof st.text === "function" ? st.text(act, api) : st.text;
      if (st.build) { var r = st.build(act, api); if (typeof r === "string" && !txt) txt = r; }
      p.innerHTML = LX.rich(txt || "");
      if (o.onStep) o.onStep(i);
      LX.emit("layout");
    }
    render(0);
    return { el: card, go: function (k) { render(Math.max(0, Math.min(N - 1, k))); }, index: function () { return i; }, count: N };
  };
})();
