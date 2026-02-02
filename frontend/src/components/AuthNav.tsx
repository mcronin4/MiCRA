'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import Link from 'next/link';
import LogoutButton from './LogoutButton';
import AuthModal from './auth/AuthModal';

/**
 * Compact Auth navigation component.
 * Renders a small inline auth control suitable for sidebars or compact headers.
 * Clicking Login/Sign Up opens the existing AuthModal.
 */
export default function AuthNav() {
  const { user, loading } = useAuth();
  const [isAuthModalOpen, setAuthModalOpen] = useState(false);
  const [initialView, setInitialView] = useState<'login' | 'signup'>('login');

  // While loading, render nothing - keeps UI compact and avoids full-width bars
  if (loading) return null;

  // When user is signed in show small avatar + logout button (inline)
  if (user) {
    const displayChar = (
      user.user_metadata?.username?.[0] ||
      user.user_metadata?.full_name?.[0] ||
      user.email?.[0] ||
      '?'
    ).toUpperCase();

    return (
      <div className="flex items-center gap-2 px-2 py-1">
        <div
          className="h-8 w-8 rounded-full bg-indigo-600 flex items-center justify-center text-white font-semibold shadow-sm"
          title={user.email || ''}
        >
          {displayChar}
        </div>
        <div className="hidden sm:block text-sm text-slate-700">{user.user_metadata?.full_name || user.email}</div>
        <LogoutButton />
      </div>
    );
  }

  // Signed-out state (compact)
  return (
    <>
      <div className="flex items-center gap-2 px-2 py-1">
        <button
          onClick={() => {
            setInitialView('login');
            setAuthModalOpen(true);
          }}
          className="text-sm text-slate-700 hover:text-slate-900 font-medium bg-transparent border-none cursor-pointer"
        >
          Login
        </button>
        <button
          onClick={() => {
            setInitialView('signup');
            setAuthModalOpen(true);
          }}
          className="text-sm bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700 font-medium border-none cursor-pointer"
        >
          Sign Up
        </button>
      </div>

      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialView={initialView}
      />
    </>
  );
}
