import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, AuthState } from '../types';

interface AuthContextType extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  confirmPasswordReset: (token: string, newPassword: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Defaults to localhost fastapi port, change in production
const API_URL = 'http://localhost:8000';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: localStorage.getItem('token'),
    isAuthenticated: false,
    isLoading: true,
  });

  useEffect(() => {
    const initAuth = async () => {
      // Check URL for OAuth token
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get('token');
      
      let token = urlToken || localStorage.getItem('token');

      if (urlToken) {
        localStorage.setItem('token', urlToken);
        // Clean URL but keep verified param if present (handled in Login.tsx)
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.delete('token');
        window.history.replaceState({}, document.title, newUrl.toString());
      }

      if (token) {
        try {
          const res = await fetch(`${API_URL}/users/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) {
            const user = await res.json();
            setState({ user, token, isAuthenticated: true, isLoading: false });
          } else {
            logout();
          }
        } catch (error) {
          console.error("Auth server unreachable", error);
          logout();
        }
      } else {
        setState(s => ({ ...s, isLoading: false }));
      }
    };
    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);

    const res = await fetch(`${API_URL}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData,
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || 'Login failed');
    }

    const data = await res.json();
    localStorage.setItem('token', data.access_token);
    
    const userRes = await fetch(`${API_URL}/users/me`, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    const user = await userRes.json();

    setState({
      user,
      token: data.access_token,
      isAuthenticated: true,
      isLoading: false,
    });
  };

  const register = async (email: string, password: string, fullName: string) => {
    const res = await fetch(`${API_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, full_name: fullName }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || 'Registration failed');
    }
    // We do NOT login automatically anymore because email verification is required.
  };

  const requestPasswordReset = async (email: string) => {
    const res = await fetch(`${API_URL}/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || 'Request failed');
    }
  };

  const confirmPasswordReset = async (token: string, newPassword: string) => {
    const res = await fetch(`${API_URL}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, new_password: newPassword }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || 'Reset failed');
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
  };

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout, requestPasswordReset, confirmPasswordReset }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};