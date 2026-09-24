const { inline } = require('../../build/text');

module.exports = {
  meta: {
    name: 'diagram',
    purpose: 'diagrama SVG inline, desenhado com as classes do design system',
    props: { svg: 'svg', caption: 'string?' },
    demo: {
      caption: 'Cliente e servidor',
      svg: `<svg class="lx-svg" viewBox="0 0 380 90" role="img" aria-label="Cliente para servidor">
  <rect class="lx-node lx-node--accent" x="8" y="20" width="120" height="48"/>
  <text class="lx-label" x="68" y="49" text-anchor="middle">Cliente</text>
  <path class="lx-edge" d="M130 44 H 246"/>
  <rect class="lx-node" x="248" y="20" width="120" height="48"/>
  <text class="lx-label" x="308" y="49" text-anchor="middle">Servidor</text>
</svg>`
    }
  },

  // No margin or padding here on purpose: a self-padded card wins on specificity
  // and ignores the phone breakpoint.
  css: `
.lx-figure > .lx-card { display: block; }
`,

  render({ svg, caption }) {
    return `  <figure class="lx-figure">
    <div class="lx-card lx-scroll">${svg}</div>
    ${caption ? `<figcaption class="lx-caption">${inline(caption)}</figcaption>` : ''}
  </figure>`;
  }
};
