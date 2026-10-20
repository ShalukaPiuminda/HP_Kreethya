'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api, getApiErrorMessage } from './api';
import type { AuthUser, FeatureKey, FeatureMap, PermissionAction } from './auth-types';

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  login: (login: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isSuperAdmin: boolean;
  isDeveloper: boolean;
  hasPermission: (module: string, action: PermissionAction) => boolean;
  /** Paid features bought for this system. The developer account always has access. */
  features: FeatureMap;
  featureEnabled: (key: FeatureKey) => boolean;
  refreshFeatures: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [features, setFeatures] = useState<FeatureMap>({});

  const refreshFeatures = useCallback(async () => {
    try {
      const res = await api.get<FeatureMap>('/v1/features');
      setFeatures(res.data ?? {});
    } catch {
      setFeatures({});
    }
  }, []);

  const checkAuth = useCallback(async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await api.getUser();
      if (res.success && res.data) {
        setUser(res.data);
        await refreshFeatures();
      } else {
        api.clearToken();
      }
    } catch {
      api.clearToken();
    } finally {
      setLoading(false);
    }
  }, [refreshFeatures]);

  useEffect(() => {
    const timer = window.setTimeout(checkAuth, 0);
    return () => window.clearTimeout(timer);
  }, [checkAuth]);

  const login = async (loginName: string, password: string) => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.login(loginName, password);
      if (res.success && res.data) {
        setUser(res.data.user);
        await refreshFeatures();
      }
    } catch (error: unknown) {
      setError(getApiErrorMessage(error, 'Login failed.'));
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
      setFeatures({});
    }
  };

  const isDeveloper = !!user?.is_developer;
  const featureEnabled = useCallback(
    (key: FeatureKey) => isDeveloper || !!features[key],
    [features, isDeveloper]
  );

  const hasPermission = useCallback((module: string, action: PermissionAction) => {
    if (user?.is_developer || user?.role?.name === 'Super Admin') return true;
    
    // Fallback if no permissions are loaded
    const perms = user?.role?.permissions;
    if (!perms) return false;

    // Find module permission entry
    const p = perms.find(x => x.module === module);
    if (!p) return false;

    // Return the boolean corresponding to the requested action
    return !!p[action];
  }, [user]);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        login,
        logout,
        isAuthenticated: !!user,
        isSuperAdmin: user?.role?.name === 'Super Admin',
        isDeveloper,
        hasPermission,
        features,
        featureEnabled,
        refreshFeatures,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
