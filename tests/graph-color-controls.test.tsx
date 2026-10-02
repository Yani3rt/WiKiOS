// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GraphColorControls } from '../src/client/graph-color-controls';
import { buildGraphColorGroups, type GraphColorPreferences } from '../src/client/graph-color-model';

const sources = {
  first: { topics: ['Writing'], folder: 'Writing' },
  second: { topics: ['Research'], folder: 'Research' },
  third: { topics: [], folder: null },
};
let root: Root;
let host: HTMLDivElement;

function Harness({ mode, initialGroup = null }: { mode: GraphColorPreferences['mode']; initialGroup?: string | null }) {
  const [preferences, setPreferences] = useState<GraphColorPreferences>({ mode, priority: ['Writing', 'Research'] });
  const [activeGroup, setActiveGroup] = useState<string | null>(initialGroup);
  const { groups } = buildGraphColorGroups(sources, preferences);
  return <GraphColorControls preferences={preferences} topics={preferences.priority} groups={groups}
    activeGroup={activeGroup} onChange={setPreferences} onHighlight={setActiveGroup} />;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove(); vi.unstubAllGlobals();
});
const legendButtons = () => [...host.querySelectorAll<HTMLButtonElement>('.graph-color-legend button')];
const allButton = () => legendButtons().find(button => button.textContent === 'All');
const writingButton = () => legendButtons().find(button => button.title === 'Writing: 1 notes')!;

it.each(['topics', 'folders'] as const)('provides an explicit All reset for %s', async mode => {
  await act(async () => root.render(<Harness mode={mode} />));
  expect(allButton()).toBeDefined();
  expect(allButton()!.getAttribute('aria-pressed')).toBe('true');
  await act(async () => writingButton().click());
  expect(writingButton().getAttribute('aria-pressed')).toBe('true');
  expect(allButton()!.getAttribute('aria-pressed')).toBe('false');
  await act(async () => allButton()!.click());
  expect(allButton()!.getAttribute('aria-pressed')).toBe('true');
  expect(legendButtons().filter(button => button.getAttribute('aria-pressed') === 'true')).toEqual([allButton()]);
});

it('can clear a selection restored from a previous visit', async () => {
  await act(async () => root.render(<Harness mode="topics" initialGroup="Writing" />));
  expect(allButton()).toBeDefined();
  expect(writingButton().getAttribute('aria-pressed')).toBe('true');
  await act(async () => allButton()!.click());
  expect(writingButton().getAttribute('aria-pressed')).toBe('false');
  expect(allButton()!.getAttribute('aria-pressed')).toBe('true');
});

it('still clears a group when its selected tag is clicked again', async () => {
  await act(async () => root.render(<Harness mode="topics" initialGroup="Writing" />));
  await act(async () => writingButton().click());
  expect(allButton()?.getAttribute('aria-pressed')).toBe('true');
});

it('does not duplicate All notes when coloring is disabled', async () => {
  await act(async () => root.render(<Harness mode="none" />));
  expect(allButton()).toBeUndefined();
  expect(legendButtons()).toHaveLength(1);
  expect(legendButtons()[0].textContent).toBe('All notes3');
});

const settingsButton = () => host.querySelector<HTMLButtonElement>('[aria-label="Configure topic priority"]')!;
const settingsPanel = () => host.querySelector<HTMLElement>('#graph-topic-priority');
async function openSettings() {
  await act(async () => root.render(<Harness mode="topics" />));
  settingsButton().focus();
  await act(async () => settingsButton().click());
}

it('moves focus inside topic settings when opened and handles Escape before any further interaction', async () => {
  await openSettings();
  expect(settingsPanel()?.contains(document.activeElement)).toBe(true);
  const parentEscape = vi.fn();
  window.addEventListener('keydown', parentEscape);
  try {
    await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(settingsPanel()).toBeNull();
    expect(document.activeElement).toBe(settingsButton());
    expect(parentEscape).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener('keydown', parentEscape);
  }
});

it('restores the settings trigger when closed explicitly', async () => {
  await openSettings();
  const close = host.querySelector<HTMLButtonElement>('[aria-label="Close topic priority"]')!;
  close.focus();
  await act(async () => close.click());
  expect(settingsPanel()).toBeNull();
  expect(document.activeElement).toBe(settingsButton());
});

it('dismisses on an outside pointer without stealing focus already moved outside', async () => {
  await openSettings();
  const all = allButton()!;
  all.focus();
  await act(async () => all.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  expect(settingsPanel()).toBeNull();
  expect(document.activeElement).toBe(all);
});

it('restores the settings trigger on a non-focusable outside pointer target', async () => {
  await openSettings();
  await act(async () => host.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  expect(settingsPanel()).toBeNull();
  expect(document.activeElement).toBe(settingsButton());
});

it('keeps the topic settings open for interactions inside it', async () => {
  await openSettings();
  const input = host.querySelector<HTMLInputElement>('[aria-label="Find topics to add"]')!;
  await act(async () => input.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true })));
  expect(settingsPanel()).not.toBeNull();
});

it('still closes on Escape when removing a focused topic has removed its button', async () => {
  await openSettings();
  const remove = host.querySelector<HTMLButtonElement>('[aria-label="Remove Writing"]')!;
  remove.focus();
  await act(async () => remove.click());
  expect(document.activeElement).toBe(document.body);
  await act(async () => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(settingsPanel()).toBeNull();
  expect(document.activeElement).toBe(settingsButton());
});
