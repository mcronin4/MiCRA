"use client";

import FinalReview from '@/components/FinalReview';
import AuthNav from '@/components/AuthNav';

export default function Home() {
  return (
    <>
      <AuthNav />
      <main>
        <FinalReview />
      </main>
    </>
  );
}
