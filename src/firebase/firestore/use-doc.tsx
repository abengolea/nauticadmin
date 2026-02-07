'use client';
import { useState, useEffect } from 'react';
import { onSnapshot, doc, type DocumentData, type FirestoreError } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useMemoFirebase } from '@/firebase';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

// Helper to convert Firestore Timestamps to JS Dates
function processDoc<T>(doc: DocumentData): T {
    const data = doc.data();
    for (const key in data) {
        if (data[key] && typeof data[key].toDate === 'function') {
            data[key] = data[key].toDate();
        }
    }
    return { id: doc.id, ...data } as T;
}


export function useDoc<T extends { id: string }>(path: string) {
    const firestore = useFirestore();
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<FirestoreError | null>(null);
    
    const docRef = useMemoFirebase(() => {
        if (!path) return null;
        return doc(firestore, path);
    }, [firestore, path]);

    useEffect(() => {
        if (!docRef) {
            setLoading(false);
            return;
        }
        const unsubscribe = onSnapshot(docRef, (snapshot) => {
            if (snapshot.exists()) {
                setData(processDoc<T>(snapshot));
            } else {
                setData(null);
            }
            setError(null);
            setLoading(false);
        }, (err: FirestoreError) => {
            const permissionError = new FirestorePermissionError({
                path: path,
                operation: 'get',
            });
            errorEmitter.emit('permission-error', permissionError);
            setError(err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [docRef, path]);

    return { data, loading, error };
}
