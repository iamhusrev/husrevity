import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement matchMedia; several components (ThemeContext,
// DateTimePicker, CalendarPage, NotificationDiagnosticsPanel) call it directly.
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
