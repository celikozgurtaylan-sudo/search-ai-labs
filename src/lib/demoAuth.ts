import type { Session, User } from "@supabase/supabase-js";

type DemoAccount = {
  username: "demo1" | "demo2" | "alican";
  id: string;
  email: string;
  displayName: string;
  password: string;
};

type StoredDemoSession = {
  username: DemoAccount["username"];
  createdAt: string;
};

const DEMO_AUTH_STORAGE_KEY = "searcho-demo-session";
const DEMO_SESSION_DURATION_SECONDS = 60 * 60 * 24 * 30;

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    username: "demo1",
    id: "demo-user-1",
    email: "demo1@searcho.demo",
    displayName: "demo1",
    password: "123456",
  },
  {
    username: "demo2",
    id: "demo-user-2",
    email: "demo2@searcho.demo",
    displayName: "demo2",
    password: "123456",
  },
  {
    username: "alican",
    id: "demo-user-alican",
    email: "Alican.Kangotan@fibabanka.com.tr",
    displayName: "Alican Kangotan",
    password: "123456",
  },
];

const canUseStorage = () => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

const normalizeIdentifier = (value: string) => value.trim().toLowerCase();

const getDemoAccount = (identifier: string) => {
  const normalized = normalizeIdentifier(identifier);
  return DEMO_ACCOUNTS.find(
    (account) => normalized === normalizeIdentifier(account.username) || normalized === normalizeIdentifier(account.email),
  );
};

const createDemoUser = (account: DemoAccount): User =>
  ({
    id: account.id,
    aud: "authenticated",
    app_metadata: {
      provider: "email",
      providers: ["email"],
    },
    user_metadata: {
      display_name: account.displayName,
      username: account.username,
      is_demo_user: true,
    },
    created_at: "2026-03-26T00:00:00.000Z",
    updated_at: new Date().toISOString(),
    email: account.email,
    phone: "",
    role: "authenticated",
    identities: [],
    factors: [],
    is_anonymous: false,
  }) as User;

const createDemoSession = (account: DemoAccount): Session =>
  ({
    access_token: `demo-access-${account.username}`,
    refresh_token: `demo-refresh-${account.username}`,
    expires_in: DEMO_SESSION_DURATION_SECONDS,
    expires_at: Math.floor(Date.now() / 1000) + DEMO_SESSION_DURATION_SECONDS,
    token_type: "bearer",
    user: createDemoUser(account),
  }) as Session;

const readStoredDemoSession = (): StoredDemoSession | null => {
  if (!canUseStorage()) return null;

  const rawValue = window.localStorage.getItem(DEMO_AUTH_STORAGE_KEY);
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue) as StoredDemoSession;
    if (!parsed?.username) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const isDemoIdentifier = (value: string) => Boolean(getDemoAccount(value));

export const isDemoUser = (user: User | null | undefined) =>
  Boolean(user?.id?.startsWith("demo-user-") || user?.user_metadata?.is_demo_user);

export const getStoredDemoSession = (): Session | null => {
  const stored = readStoredDemoSession();
  if (!stored) return null;

  const account = getDemoAccount(stored.username);
  if (!account) {
    clearStoredDemoSession();
    return null;
  }

  return createDemoSession(account);
};

export const getCurrentDemoUser = (): User | null => getStoredDemoSession()?.user ?? null;

export const signInDemoAccount = (identifier: string, password: string): Session | null => {
  const account = getDemoAccount(identifier);
  if (!account || password !== account.password) return null;

  const session = createDemoSession(account);
  if (canUseStorage()) {
    window.localStorage.setItem(
      DEMO_AUTH_STORAGE_KEY,
      JSON.stringify({
        username: account.username,
        createdAt: new Date().toISOString(),
      } satisfies StoredDemoSession),
    );
  }

  return session;
};

export const clearStoredDemoSession = () => {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(DEMO_AUTH_STORAGE_KEY);
};
