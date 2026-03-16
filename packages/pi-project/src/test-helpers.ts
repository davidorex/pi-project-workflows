/**
 * Shared test helpers for pi-project tests — mock factories for ctx and pi.
 */

/**
 * Create a mock extension context for testing.
 */
export function mockCtx(cwd: string) {
  return {
    cwd,
    hasUI: false,
    ui: {
      setWidget: () => {},
      notify: () => {},
      setStatus: () => {},
    },
  } as any;
}

/**
 * Create a mock pi API for testing.
 */
export function mockPi() {
  const messages: any[] = [];
  return {
    sendMessage: (msg: any, opts: any) => messages.push({ msg, opts }),
    _messages: messages,
  } as any;
}
