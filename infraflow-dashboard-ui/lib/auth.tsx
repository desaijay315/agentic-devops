'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { fetchCurrentUser, getLoginUrl, logoutUser, fetchUserPlan, upgradeToProPlan } from './api';

export interface User {
  login: string;
  id: number;
  name: string;
  avatarUrl: string;
  email: string;
}

export interface PlanInfo {
  planType: 'FREE' | 'PRO';
  healCountMonth: number;
  healLimitMonth: number;
  healsRemaining: number;
  hasHealsRemaining: boolean;
  planResetAt: string;
}

interface AuthContextValue {
  user: User | null;
  plan: PlanInfo | null;
  loading: boolean;
  planLoading: boolean;
  login: () => void;
  logout: () => void;
  refreshPlan: () => Promise<void>;
  upgrade: () => Promise<void>;
  showUpgradeModal: boolean;
  openUpgradeModal: () => void;
  closeUpgradeModal: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  plan: null,
  loading: true,
  planLoading: false,
  login: () => {},
  logout: () => {},
  refreshPlan: async () => {},
  upgrade: async () => {},
  showUpgradeModal: false,
  openUpgradeModal: () => {},
  closeUpgradeModal: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [planLoading, setPlanLoading] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  useEffect(() => {
    fetchCurrentUser()
      .then(async (u) => {
        setUser(u);
        if (u) {
          const p = await fetchUserPlan().catch(() => null);
          setPlan(p);
        }
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const refreshPlan = useCallback(async () => {
    if (!user) return;
    setPlanLoading(true);
    try {
      const p = await fetchUserPlan();
      setPlan(p);
    } finally {
      setPlanLoading(false);
    }
  }, [user]);

  const login = () => {
    window.location.href = getLoginUrl();
  };

  const logout = async () => {
    await logoutUser();
    setUser(null);
    setPlan(null);
    window.location.href = '/';
  };

  const upgrade = async () => {
    setPlanLoading(true);
    try {
      const p = await upgradeToProPlan();
      setPlan(p);
      setShowUpgradeModal(false);
    } finally {
      setPlanLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{
      user, plan, loading, planLoading,
      login, logout, refreshPlan, upgrade,
      showUpgradeModal,
      openUpgradeModal: () => setShowUpgradeModal(true),
      closeUpgradeModal: () => setShowUpgradeModal(false),
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
