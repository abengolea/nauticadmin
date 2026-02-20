'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Camera, Upload, X } from 'lucide-react';
import { getAuth } from 'firebase/auth';

interface ExpenseCaptureProps {
  schoolId: string;
  onUploadComplete: (data: { expenseId: string; storagePath: string }) => void;
  onParseComplete?: (extracted: unknown) => void;
}

export function ExpenseCapture({
  schoolId,
  onUploadComplete,
  onParseComplete,
}: ExpenseCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleCapture = () => {
    inputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith('image/')) {
      setError('Solo se permiten imágenes (JPG, PNG)');
      return;
    }
    setFile(f);
    setError(null);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const clearPreview = () => {
    setFile(null);
    setPreview(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleUpload = async () => {
    if (!file) return;
    const user = getAuth().currentUser;
    if (!user) {
      setError('Debés iniciar sesión');
      return;
    }

    setLoading(true);
    setProgress(10);
    setError(null);

    try {
      const token = await user.getIdToken();
      const formData = new FormData();
      formData.append('file', file);
      formData.append('schoolId', schoolId);

      setProgress(30);
      const res = await fetch('/api/expenses/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      setProgress(60);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Error al subir');
      }

      const data = await res.json();
      onUploadComplete({ expenseId: data.expenseId, storagePath: data.storagePath });

      if (onParseComplete) {
        setProgress(70);
        const parseRes = await fetch('/api/expenses/parse', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            expenseId: data.expenseId,
            schoolId,
            storagePath: data.storagePath,
          }),
        });

        setProgress(95);
        if (parseRes.ok) {
          const parseData = await parseRes.json();
          onParseComplete(parseData);
        }
      }

      setProgress(100);
      clearPreview();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al subir');
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />

      {!preview ? (
        <Button
          type="button"
          variant="outline"
          className="w-full h-32 border-dashed"
          onClick={handleCapture}
          disabled={loading}
        >
          <Camera className="h-8 w-8 mr-2" />
          Sacar foto o elegir imagen
        </Button>
      ) : (
        <div className="relative rounded-lg overflow-hidden border">
          <img
            src={preview}
            alt="Vista previa"
            className="w-full max-h-64 object-contain bg-muted"
          />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute top-2 right-2"
            onClick={clearPreview}
            disabled={loading}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {preview && (
        <Button
          className="w-full"
          onClick={handleUpload}
          disabled={loading}
        >
          <Upload className="h-4 w-4 mr-2" />
          {loading ? 'Subiendo y extrayendo datos...' : 'Subir y extraer con IA'}
        </Button>
      )}

      {loading && <Progress value={progress} className="h-2" />}
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
