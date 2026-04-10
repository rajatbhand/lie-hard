'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

interface ControlAccessContextType {
  isAuthenticated: boolean;
  authenticate: (password: string) => Promise<boolean>;
  logout: () => void;
}

const ControlAccessContext = createContext<ControlAccessContextType | undefined>(undefined);

const SESSION_KEY = 'operator_panel_authenticated';

// SHA-256 hash of the correct password — the actual password is never in the bundle
const PASSWORD_HASH = '8c568efcec2be250007e6379c5308067a4c8c748dd71c6af3573f9bbbe9e7ec8';

async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function ControlAccessProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedAuth = sessionStorage.getItem(SESSION_KEY);
      if (storedAuth === 'true') {
        setIsAuthenticated(true);
      }
    }
    setIsInitialized(true);
  }, []);

  const authenticate = async (password: string): Promise<boolean> => {
    const inputHash = await sha256(password);
    if (inputHash === PASSWORD_HASH) {
      setIsAuthenticated(true);
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(SESSION_KEY, 'true');
      }
      return true;
    }
    return false;
  };

  const logout = () => {
    setIsAuthenticated(false);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(SESSION_KEY);
    }
  };

  if (!isInitialized) return null;

  return (
    <ControlAccessContext.Provider value={{ isAuthenticated, authenticate, logout }}>
      {children}
    </ControlAccessContext.Provider>
  );
}

export function useControlAccess() {
  const context = useContext(ControlAccessContext);
  if (context === undefined) {
    throw new Error('useControlAccess must be used within a ControlAccessProvider');
  }
  return context;
}
