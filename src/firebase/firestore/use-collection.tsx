'use client';
import { useState, useEffect } from 'react';
import { onSnapshot, collection, query, where, type Query, type DocumentData, orderBy, limit, type FirestoreError } from 'firebase/firestore';
import { useFirestore } from '@/firebase/provider';
import { useMemoFirebase } from '@/firebase';

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

export function useCollection<T extends { id: string }>(
    path: string, 
    options?: {
        where?: [string, any, any];
        orderBy?: [string, 'asc' | 'desc'];
        limit?: number;
    }
) {
    const firestore = useFirestore();
    const [data, setData] = useState<T[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<FirestoreError | null>(null);

    const collectionQuery = useMemoFirebase(() => {
        if (!path) return null;
        let q: Query<DocumentData> = collection(firestore, path);
        if (options?.where) {
            q = query(q, where(...options.where));
        }
        if (options?.orderBy) {
            q = query(q, orderBy(...options.orderBy));
        }
        if (options?.limit) {
            q = query(q, limit(options.limit));
        }
        return q;
    }, [firestore, path, JSON.stringify(options)]);


    useEffect(() => {
        if (!collectionQuery) {
            setLoading(false);
            return;
        }
        const unsubscribe = onSnapshot(collectionQuery, (snapshot) => {
            const data = snapshot.docs.map(doc => processDoc<T>(doc));
            setData(data);
            setLoading(false);
        }, (err: FirestoreError) => {
            console.error(`Error fetching collection ${path}:`, err);
            setError(err);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [collectionQuery, path]);

    return { data, loading, error };
}
