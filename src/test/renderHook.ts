import { createElement, type ReactElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { vi } from "vitest";

// Tells React that the environment supports `act` (without it, it warns at every update).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The result of a hook rendered in a test component: `current` is the last value returned. */
export interface HookHandle<R, P> {
  current: R;
  /** Redraws with other props (to test what the hook does when they change). */
  rerender: (props: P) => void;
  unmount: () => void;
}

/**
 * Runs `hook` inside a real component (without DOM, with `react-test-renderer`) and returns its
 * last value. State updates and effects go through `act`, as in the app. `wrap` puts the component inside something
 * else (a context provider).
 */
export function renderHook<R, P>(hook: (props: P) => R, initial: P, wrap: (children: ReactElement) => ReactElement = (c) => c): HookHandle<R, P> {
  const out = {} as HookHandle<R, P>;
  function Probe({ props }: { props: P }) {
    out.current = hook(props);
    return null;
  }
  let renderer!: ReactTestRenderer;
  act(() => {
    renderer = create(wrap(createElement(Probe, { props: initial })));
  });
  out.rerender = (props) => act(() => renderer.update(wrap(createElement(Probe, { props }))));
  out.unmount = () => act(() => renderer.unmount());
  return out;
}

export { act };

/**
 * A minimal "window" for the hooks that listen to the keyboard: an `EventTarget` with the timers, and the classes of the
 * text fields (for `e.target instanceof HTMLInputElement`). `press` sends a key and returns the event,
 * so the test can see whether it was stopped (`defaultPrevented`).
 */
export function stubWindow() {
  const target = new EventTarget();
  vi.stubGlobal("window", Object.assign(target, { setTimeout, clearTimeout, setInterval, clearInterval }));
  vi.stubGlobal("HTMLInputElement", class {});
  vi.stubGlobal("HTMLSelectElement", class {});
  vi.stubGlobal("HTMLTextAreaElement", class {});
  return {
    press(key: string, extra: Record<string, unknown> = {}) {
      const e = Object.assign(new Event("keydown", { cancelable: true }), { key, altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...extra });
      act(() => void target.dispatchEvent(e));
      return e;
    },
  };
}

/** A fake element with the scroll measures, for the hooks that read and write `scrollTop`. */
export class FakePane extends EventTarget {
  scrollTop = 0;
  scrollLeft = 0;
  clientHeight = 400;
  clientWidth = 800;
  scrollHeight = 2000;
  scrollWidth = 1600;
  scrollTo(x: number, y: number) {
    this.scrollLeft = x;
    this.scrollTop = y;
  }
}

/** A fake `ResizeObserver`: `trigger` calls all the observers, like a resize. */
export function stubResizeObserver() {
  const live = new Set<() => void>();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      private cb: () => void;
      constructor(cb: () => void) {
        this.cb = cb;
      }
      observe() {
        live.add(this.cb);
      }
      disconnect() {
        live.delete(this.cb);
      }
    },
  );
  return { trigger: () => act(() => void [...live].forEach((cb) => cb())), count: () => live.size };
}
