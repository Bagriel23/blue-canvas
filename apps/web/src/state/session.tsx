import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

import { ApiClient, ApiError } from "../api/client.js";
import type { SessionInfo } from "../api/types.js";

interface SessionContextValue {
  client: ApiClient;
  session: SessionInfo | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  acceptInvitation: (input: {
    token: string;
    displayName: string;
    password: string;
    locale: string;
  }) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export interface SessionProviderProps {
  client?: ApiClient;
  initialSession?: SessionInfo | null;
  children: ReactNode;
}

export function SessionProvider({
  client,
  initialSession = null,
  children,
}: SessionProviderProps) {
  const apiClient = useMemo(() => client ?? new ApiClient(), [client]);
  const [session, setSession] = useState<SessionInfo | null>(initialSession);
  const [loading, setLoading] = useState<boolean>(initialSession === null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiClient.request<SessionInfo>({
        path: "/api/v1/auth/me",
      });
      apiClient.setCsrfToken(result.data.csrfToken ?? null);
      setSession({ ...result.data, bootstrapRequired: false });
    } catch (raw) {
      if (raw instanceof ApiError && raw.status === 401) {
        setSession(null);
      } else if (raw instanceof ApiError) {
        setError(raw.message);
        setSession(null);
      } else {
        setError("Network error");
        setSession(null);
      }
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  useEffect(() => {
    if (initialSession) return;
    void refresh();
  }, [initialSession, refresh]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await apiClient.request<SessionInfo>({
          method: "POST",
          path: "/api/v1/auth/login",
          body: { email, password },
        });
        apiClient.setCsrfToken(result.data.csrfToken);
        setSession(result.data);
      } catch (raw) {
        if (raw instanceof ApiError) setError(raw.message);
        else setError("Network error");
        throw raw;
      } finally {
        setLoading(false);
      }
    },
    [apiClient],
  );

  const signOut = useCallback(async () => {
    try {
      await apiClient.request({
        method: "POST",
        path: "/api/v1/auth/logout",
      });
    } finally {
      apiClient.setCsrfToken(null);
      setSession(null);
    }
  }, [apiClient]);

  const acceptInvitation = useCallback(
    async (input: {
      token: string;
      displayName: string;
      password: string;
      locale: string;
    }) => {
      setLoading(true);
      setError(null);
      try {
        const result = await apiClient.request<SessionInfo>({
          method: "POST",
          path: "/api/v1/auth/invitations/accept",
          body: input,
        });
        apiClient.setCsrfToken(result.data.csrfToken);
        setSession(result.data);
      } catch (raw) {
        if (raw instanceof ApiError) setError(raw.message);
        else setError("Network error");
        throw raw;
      } finally {
        setLoading(false);
      }
    },
    [apiClient],
  );

  const value = useMemo<SessionContextValue>(
    () => ({
      client: apiClient,
      session,
      loading,
      error,
      refresh,
      signIn,
      signOut,
      acceptInvitation,
    }),
    [
      apiClient,
      session,
      loading,
      error,
      refresh,
      signIn,
      signOut,
      acceptInvitation,
    ],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context)
    throw new Error("useSession must be used within SessionProvider");
  return context;
}
