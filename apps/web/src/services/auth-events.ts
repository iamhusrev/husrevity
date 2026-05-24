type Listener = () => void;

const listeners = new Set<Listener>();

export const authEvents = {
  emitForceLogout() {
    listeners.forEach((l) => l());
  },
  onForceLogout(fn: Listener) {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};
