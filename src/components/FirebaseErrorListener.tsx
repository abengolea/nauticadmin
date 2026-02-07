'use client';
import { useEffect } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';

// This component is only active in development. It listens for permission
// errors and throws them, so the Next.js overlay can display them.
export function FirebaseErrorListener() {
  useEffect(() => {
    const handlePermissionError = (error: Error) => {
        if (process.env.NODE_ENV === 'development') {
            // Throwing the error here will cause it to be displayed in the Next.js
            // development error overlay, which is great for debugging security rules.
            throw error;
        } else {
            // In production, you might want to log this to a service like Sentry.
            console.error(error);
        }
    };

    const unsubscribe = errorEmitter.subscribe(handlePermissionError);

    return () => {
      unsubscribe();
    };
  }, []);

  return null; // This component doesn't render anything.
}
