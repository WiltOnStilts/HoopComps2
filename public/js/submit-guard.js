/** Prevent duplicate submissions from double-tap or overlapping async handlers. */

export function createSubmitGuard() {
  let inFlight = false;
  return {
    isBusy() {
      return inFlight;
    },
    async run(fn) {
      if (inFlight) return;
      inFlight = true;
      try {
        await fn();
      } finally {
        inFlight = false;
      }
    },
  };
}

export function dedupeByKey(items, keyFor) {
  const seen = new Set();
  return (items || []).filter((item) => {
    const key = keyFor(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function bindGuardedSubmit({ button, input = null, guard, handler }) {
  const invoke = () => {
    if (guard.isBusy()) return;
    void guard.run(async () => {
      if (button) button.disabled = true;
      try {
        await handler();
      } finally {
        if (button && !guard.isBusy()) button.disabled = false;
      }
    });
  };

  if (button && !button.dataset.guardedSubmit) {
    button.dataset.guardedSubmit = "1";
    button.addEventListener("click", invoke);
  }

  if (input && input.tagName !== "TEXTAREA" && !input.dataset.guardedSubmit) {
    input.dataset.guardedSubmit = "1";
    input.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      invoke();
    });
  }
}
