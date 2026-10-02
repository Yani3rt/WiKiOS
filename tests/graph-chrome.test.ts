// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it } from 'vitest';

const source = readFileSync('src/client/globals.css', 'utf8');
const graphChrome = source.slice(source.indexOf('/* Neural graph chrome'), source.indexOf('@keyframes note-peek-arrive'));

// jsdom has no viewport media evaluation. Resolve only width media queries here,
// then let its CSSOM and selector cascade compute the graph chrome contracts.
function renderChrome(width: number, selected = false) {
  document.body.innerHTML = `<main class="graph-shell"><header class="app-route-header"><a class="app-route-header-brand">Graph</a></header>
    ${selected ? '<aside><h2 id="graph-node-details-title">Selected note</h2></aside>' : ''}
    <section class="graph-color-controls"><div class="graph-color-legend"><button>All</button></div></section>
    <div class="graph-toolbar-stack graph-toolbar-stack--panel-open"><div class="graph-toolbar"><button>−</button><button>Fit</button><button>+</button></div></div></main>`;
  const parsed = document.createElement('style');
  parsed.textContent = `${source.match(/\.app-route-header-brand\s*\{[^}]*\}/)![0]}\n${graphChrome}`;
  document.head.append(parsed);
  const applies = (media: string) => [...media.matchAll(/\((min|max)-width:\s*(\d+)px\)/g)]
    .every(([, bound, value]) => bound === 'min' ? width >= Number(value) : width <= Number(value));
  const resolve = (rules: CSSRuleList): string[] => [...rules].flatMap(rule =>
    rule.type === CSSRule.MEDIA_RULE
      ? applies((rule as CSSMediaRule).conditionText) ? resolve((rule as CSSMediaRule).cssRules) : []
      : [rule.cssText]);
  const applicable = resolve(parsed.sheet!.cssRules).join('\n');
  parsed.textContent = applicable;
  return (selector: string) => getComputedStyle(document.querySelector(selector)!);
}

afterEach(() => { document.head.querySelectorAll('style').forEach(style => style.remove()); document.body.innerHTML = ''; });

it('uses the graph foreground for its brand rather than the shared light-on-dark header token', () => {
  expect(renderChrome(1280)('.app-route-header-brand').color).toBe('var(--graph-foreground)');
});

it.each([390, 660, 1023])('reserves a narrow toolbar lane at compact width %i', width => {
  const style = renderChrome(width);
  expect(style('.graph-toolbar').flexDirection).toBe('column');
  expect(style('.graph-color-controls').maxWidth).toBe('calc(100% - 80px)');
});

it.each([390, 660, 1023])('removes bottom legend competition when a bottom sheet is open at %i', width => {
  expect(renderChrome(width, true)('.graph-color-controls').display).toBe('none');
});

it('keeps desktop color controls visible with room for the horizontal toolbar', () => {
  const style = renderChrome(1024, true);
  expect(style('.graph-color-controls').display).not.toBe('none');
  expect(style('.graph-color-controls').maxWidth).toBe('min(620px, calc(100% - 194px))');
  expect(style('.graph-toolbar').flexDirection).not.toBe('column');
});

it('makes a long compact legend scrollable with a reserved visible scrollbar track', () => {
  const style = renderChrome(660)('.graph-color-legend');
  expect(style.overflowY).toBe('auto');
  expect(style.scrollbarGutter).toBe('stable');
  expect(style.scrollbarColor).toBe('var(--graph-muted) var(--graph-control-hover)');
});
