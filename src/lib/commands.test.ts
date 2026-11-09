import { describe, expect, it } from "vitest";
import { CommandRegistry, CommandsContext, useRegisterCommands, type TabCommands } from "./commands";
import { createElement, type ReactElement } from "react";
import { renderHook } from "../test/renderHook";

const none = { enabled: false, run: () => {} };
const commands = (extra: Partial<TabCommands> = {}): TabCommands => ({ undo: none, find: none, applyToRight: none, applyToLeft: none, ...extra });

describe("CommandRegistry", () => {
  it("senza nessuno non offre niente", () => {
    expect(new CommandRegistry().current()).toBeNull();
  });

  it("legge lo stato al momento della richiesta, non della registrazione", () => {
    const registry = new CommandRegistry();
    let enabled = false;
    registry.set({}, () => commands({ undo: { enabled, run: () => {} } }));
    expect(registry.current()!.undo.enabled).toBe(false);
    enabled = true;
    expect(registry.current()!.undo.enabled).toBe(true);
  });

  it("chi non è più in primo piano toglie solo i propri comandi", () => {
    const registry = new CommandRegistry();
    const [a, b] = [{}, {}];
    registry.set(a, () => commands());
    registry.set(b, () => commands({ find: { enabled: true, run: () => {} } })); // another tab came to the foreground
    registry.clear(a); // the first one finishes late: it must not remove the other's
    expect(registry.current()!.find.enabled).toBe(true);
    registry.clear(b);
    expect(registry.current()).toBeNull();
  });
});

describe("useRegisterCommands", () => {
  it("registra solo se la vista è in primo piano, usa i valori più recenti e si toglie quando esce", () => {
    const registry = new CommandRegistry();
    const wrapper = (children: ReactElement) => createElement(CommandsContext.Provider, { value: registry }, children);
    let enabled = false;
    const h = renderHook(
      ({ active }: { active: boolean }) => useRegisterCommands(active, () => commands({ undo: { enabled, run: () => {} } })),
      { active: false },
      wrapper,
    );
    expect(registry.current()).toBeNull();
    h.rerender({ active: true });
    expect(registry.current()!.undo.enabled).toBe(false);
    enabled = true; // no redraw: the menu asks and finds the new state
    expect(registry.current()!.undo.enabled).toBe(true);
    h.rerender({ active: false });
    expect(registry.current()).toBeNull();
    h.rerender({ active: true });
    h.unmount();
    expect(registry.current()).toBeNull();
  });
});
