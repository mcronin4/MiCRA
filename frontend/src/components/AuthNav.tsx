'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import Link from 'next/link';
import LogoutButton from './LogoutButton';
import AuthModal from './auth/AuthModal';

/**
 * Auth navigation component - shows login/signup links or user info with logout.
 * Visible at the top of pages to show auth state.
 */
export default function AuthNav() {
  const { user, loading } = useAuth();
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);
  const [initialView, setInitialView] = useState<'login' | 'signup'>('login');

  if (loading) {
    return (
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-2">
        <div className="max-w-7xl mx-auto flex justify-end">
          <span className="text-sm text-gray-500">Loading...</span>
        </div>
      </div>
    );
  }

  if (user) {
    return (
      <div className="bg-white border-b border-gray-200 px-4 py-2">
        <div className="max-w-7xl mx-auto flex items-center justify-end gap-3">
          <div className="h-8 w-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold shadow-sm ring-2 ring-indigo-200" title={user.email || ''}>
            {(user.user_metadata?.username?.[0] || user.user_metadata?.full_name?.[0] || user.email?.[0] || '?').toUpperCase()}
          </div>
          <LogoutButton />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-blue-50 border-b border-blue-200 px-4 py-2">
      <div className="max-w-7xl mx-auto flex items-center justify-end gap-4">
        <button
          onClick={() => {
            setInitialView('login');
            setAuthModalOpen(true);
          }}
          className="text-sm text-blue-700 hover:text-blue-900 font-medium bg-transparent border-none cursor-pointer"
        >
          Login
        </button>
        <button
          onClick={() => {
            setInitialView('signup');
            setAuthModalOpen(true);
          }}
          className="text-sm bg-blue-600 text-white px-4 py-1 rounded hover:bg-blue-700 font-medium border-none cursor-pointer"
        >
          Sign Up
        </button>
      </div>

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialView={initialView}
      />
    </div>
  );
}
