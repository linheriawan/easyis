<script>
// small jQuery-style DOM helper for client-side use inside a widget's own
// <script> — not itself a widget usage tag, just a utility other widgets
// can reach for.
(function () {
  window.Htme = class Htme {
    constructor(selector) {
      const nodes = document.querySelectorAll(selector);
      const def = (name, fn) => Object.defineProperty(nodes, name, { value: fn, writable: true, configurable: true });
      def('attr', (attr, value) => { nodes.forEach(el => el.setAttribute(attr, value)); return nodes; });
      def('attrs', (obj = {}) => { nodes.forEach(el => Object.entries(obj).forEach(([k, v]) => el.setAttribute(k, v))); return nodes; });
      def('text', (str) => { nodes.forEach(el => el.textContent = str); return nodes; });
      def('html', (str) => { nodes.forEach(el => el.innerHTML = str); return nodes; });
      def('replace', (str) => { nodes.forEach(el => el.outerHTML = str); return nodes; });
      def('appendTo', (parent) => { if (parent) nodes.forEach(el => parent.appendChild(el)); return nodes; });
      return nodes;
    }
  };
})();
</script>
