'use client';

import { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import LoginForm from './LoginForm';
import SignupForm from './SignupForm';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialView?: 'login' | 'signup';
}

export default function AuthModal({ isOpen, onClose, initialView = 'login' }: AuthModalProps) {
  const [view, setView] = useState<'login' | 'signup'>(initialView);

  // Reset view when modal opens
  useEffect(() => {
    if (isOpen) {
      setView(initialView);
    }
  }, [isOpen, initialView]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={view === 'login' ? 'Sign In' : 'Create Account'}
    >
      {view === 'login' ? (
        <LoginForm
          onSuccess={onClose}
          onSwitchToSignup={() => setView('signup')}
        />
      ) : (
        <SignupForm
          onSuccess={onClose}
          onSwitchToLogin={() => setView('login')}
        />
      )}
    </Modal>
  );
}
