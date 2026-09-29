import { describe, it, expect, mock, beforeEach } from "bun:test";

const setNotificationHandlerMock = mock();
const routerReplaceMock = mock();
const routerPushMock = mock();

mock.module("react-native", () => ({
  Platform: { OS: "ios" },
  StyleSheet: { create: (s: any) => s },
  Text: ({ children }: any) => children,
  View: ({ children, testID }: any) => ({ type: "View", props: { children, testID } }),
  TouchableOpacity: ({ onPress, children }: any) => children,
  ActivityIndicator: () => ({ type: "ActivityIndicator" }),
  ScrollView: ({ children }: any) => children,
  SafeAreaView: ({ children }: any) => children,
  RefreshControl: () => null,
}));

mock.module("expo-notifications", () => ({
  setNotificationHandler: setNotificationHandlerMock,
  getPermissionsAsync: async () => ({ granted: true }),
  requestPermissionsAsync: async () => ({ granted: true }),
  getExpoPushTokenAsync: async () => ({ data: "mock-token" }),
  IosAuthorizationStatus: {
    NOT_DETERMINED: 0,
    DENIED: 1,
    AUTHORIZED: 2,
    PROVISIONAL: 3,
    EPHEMERAL: 4,
  },
}));

mock.module("expo-router", () => ({
  Redirect: ({ href }: { href: string }) => ({ type: "Redirect", href }),
  Stack: Object.assign(({ children }: any) => children, { Screen: () => null }),
  Tabs: Object.assign(({ children }: any) => children, { Screen: () => null }),
  router: {
    replace: routerReplaceMock,
    push: routerPushMock,
  },
  usePathname: () => "/",
  useSegments: () => [],
  Link: ({ children }: any) => children,
}));

mock.module("expo-status-bar", () => ({
  StatusBar: () => null,
}));

describe("App Navigation & Notifications Setup", () => {
  beforeEach(() => {
    setNotificationHandlerMock.mockClear();
    routerReplaceMock.mockClear();
    routerPushMock.mockClear();
  });

  it("registers foreground notification handler with sound and alert enabled", async () => {
    await import("../../app/_layout");

    expect(setNotificationHandlerMock).toHaveBeenCalled();
    const handlerConfig = setNotificationHandlerMock.mock.calls[0][0];
    expect(typeof handlerConfig.handleNotification).toBe("function");

    const result = await handlerConfig.handleNotification();
    expect(result).toEqual({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
  });

  it("IndexScreen renders loading spinner while auth is initializing", async () => {
    mock.module("../auth/auth-context", () => ({
      useAuth: () => ({
        isLoading: true,
        isAuthenticated: false,
      }),
    }));

    const { default: IndexScreen } = await import("../../app/index");
    const element = IndexScreen();
    expect(element.props.testID).toBe("loading-spinner");
  });

  it("IndexScreen renders redirect to /today when authenticated", async () => {
    mock.module("../auth/auth-context", () => ({
      useAuth: () => ({
        isLoading: false,
        isAuthenticated: true,
      }),
    }));

    const { default: IndexScreen } = await import("../../app/index");
    const element: any = IndexScreen();
    expect(element.props.href).toBe("/today");
  });

  it("IndexScreen renders redirect to /login when unauthenticated", async () => {
    mock.module("../auth/auth-context", () => ({
      useAuth: () => ({
        isLoading: false,
        isAuthenticated: false,
      }),
    }));

    const { default: IndexScreen } = await import("../../app/index");
    const element: any = IndexScreen();
    expect(element.props.href).toBe("/login");
  });
});
