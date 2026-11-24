// One mockup file per screen; the state is in the address: contact.html#overdue. No hash = "default".
// An element with data-state="a b" is shown only in states a and b; elements without it are always shown.
// The state is also set on <html data-state="…"> for the few rules that only change a style.
// The list of states with their names is in <meta name="states">, read by index.html and mockup-shots.sh
(function () {
  function apply() {
    var state = decodeURIComponent(location.hash.slice(1)) || "default";
    document.documentElement.setAttribute("data-state", state);
    var items = document.querySelectorAll("[data-state]:not(html)");
    for (var i = 0; i < items.length; i++) {
      items[i].hidden = items[i].getAttribute("data-state").split(" ").indexOf(state) === -1;
    }
  }
  addEventListener("hashchange", apply);
  apply();
})();
