'use client';

import { useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Camera, FileText, Upload, X } from 'lucide-react';
import { getAuth } from 'firebase/auth';
import { compressImageForUpload } from '@/lib/image-compress';

interface ExpenseCaptureProps {
  schoolId: string;
  onUploadComplete: (
    data: { expenseId: string; storagePath: string },
    options?: { onDialogClosed: () => void }
  ) => void;
  onParseComplete?: (extracted: unknown) => void;
  onParseError?: (error: string) => void;
}

const PARSE_TIMEOUT_MS = 90_000;

export function ExpenseCapture({
  schoolId,
  onUploadComplete,
  onParseComplete,
  onParseError,
}: ExpenseCaptureProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<File[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [totalInBatch, setTotalInBatch] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const isImage = (f: File) => f.type.startsWith('image/');
  const isPdf = (f: File) => f.type === 'application/pdf';
  const isValidFile = (f: File) => isImage(f) || isPdf(f);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const arr = Array.from(newFiles);
    const valid = arr.filter(isValidFile);
    if (valid.length === 0 && arr.length > 0) {
      setError('Solo se permiten imágenes (JPG, PNG, WebP) o PDF');
      return;
    }
    if (valid.length < arr.length) {
      setError('Algunos archivos no son válidos. Se agregaron solo imágenes y PDF.');
    } else {
      setError(null);
    }
    setFiles((prev) => [...prev, ...valid]);
    valid.forEach((f) => {
      if (isImage(f)) {
        const reader = new FileReader();
        reader.onload = () => {
          setPreviews((p) => new Map(p).set(f.name, reader.result as string));
        };
        reader.readAsDataURL(f);
      }
    });
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (list?.length) addFiles(list);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const removeFile = (index: number) => {
    const f = files[index];
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setPreviews((p) => {
      const next = new Map(p);
      next.delete(f.name);
      return next;
    });
    setError(null);
  };

  const clearAll = () => {
    setFiles([]);
    setPreviews(new Map());
    setError(null);
    queueRef.current = [];
    if (inputRef.current) inputRef.current.value = '';
  };

  const processOneFile = useCallback(
    async (file: File, queue: File[], index: number) => {
      const user = getAuth().currentUser;
      if (!user) {
        setError('Debés iniciar sesión');
        return;
      }

      setLoading(true);
      setProgress(10);
      setError(null);
      setCurrentFileIndex(index + 1);
      setTotalInBatch(queue.length);

      try {
        const token = await user.getIdToken();
        setProgress(15);
        const fileToUpload = isImage(file) ? await compressImageForUpload(file) : file;
        const formData = new FormData();
        formData.append('file', fileToUpload);
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
        const hasMore = index + 1 < queue.length;
        const onDialogClosed = hasMore
          ? () => {
              queueRef.current = queue.slice(index + 1);
              setFiles((prev) => prev.slice(1));
              setPreviews((p) => {
                const next = new Map(p);
                next.delete(file.name);
                return next;
              });
              processOneFile(queueRef.current[0]!, queueRef.current, 0);
            }
          : undefined;

        onUploadComplete({ expenseId: data.expenseId, storagePath: data.storagePath }, { onDialogClosed });

        if (onParseComplete) {
          setProgress(70);
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), PARSE_TIMEOUT_MS);
          try {
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
              signal: controller.signal,
            });
            clearTimeout(timeoutId);
            setProgress(95);
            if (parseRes.ok) {
              const parseData = await parseRes.json();
              onParseComplete(parseData);
            } else {
              const errData = await parseRes.json().catch(() => ({}));
              const msg = errData.error || `Error ${parseRes.status} al extraer datos`;
              setError(msg);
              onParseError?.(msg);
              if (hasMore) onDialogClosed?.();
            }
          } catch (parseErr) {
            clearTimeout(timeoutId);
            const msg =
              parseErr instanceof Error
                ? parseErr.name === 'AbortError'
                  ? 'La extracción tardó demasiado. Intentá de nuevo.'
                  : parseErr.message
                : 'Error al extraer datos con IA';
            setError(msg);
            onParseError?.(msg);
            if (hasMore) onDialogClosed?.();
          }
        } else if (hasMore) {
          onDialogClosed?.();
        }

        setProgress(100);
        if (!hasMore) {
          setFiles([]);
          setPreviews(new Map());
          queueRef.current = [];
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error al subir');
      } finally {
        setLoading(false);
        setProgress(0);
        setCurrentFileIndex(0);
        setTotalInBatch(0);
      }
    },
    [schoolId, onUploadComplete, onParseComplete, onParseError]
  );

  const handleUpload = () => {
    if (files.length === 0) return;
    queueRef.current = [...files];
    processOneFile(files[0]!, queueRef.current, 0);
  };

  const handleCapture = () => inputRef.current?.click();

  const totalFiles = files.length;
  const progressLabel =
    totalInBatch > 1 && loading
      ? `Procesando ${currentFileIndex} de ${totalInBatch}...`
      : loading
        ? 'Subiendo y extrayendo datos...'
        : totalFiles > 1
          ? `Subir ${totalFiles} archivos`
          : 'Subir y extraer con IA';

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        multiple
        className="hidden"
        onChange={handleFileChange}
      />

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/50'
        }`}
      >
        <p className="text-sm text-muted-foreground mb-2">
          Arrastrá imágenes o PDFs aquí, o hacé clic para elegir
        </p>
        <Button type="button" variant="outline" onClick={handleCapture} disabled={loading}>
          <Camera className="h-4 w-4 mr-2" />
          Elegir archivos
        </Button>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {files.length} archivo{files.length !== 1 ? 's' : ''} seleccionado{files.length !== 1 ? 's' : ''}
          </p>
          <div className="max-h-48 overflow-y-auto space-y-2 rounded-md border p-2">
            {files.map((f, i) => (
              <div
                key={`${f.name}-${i}`}
                className="flex items-center gap-2 rounded border bg-muted/30 p-2"
              >
                {previews.get(f.name) ? (
                  <img
                    src={previews.get(f.name)}
                    alt=""
                    className="h-12 w-12 object-cover rounded"
                  />
                ) : isPdf(f) ? (
                  <FileText className="h-12 w-12 text-muted-foreground shrink-0" />
                ) : null}
                <span className="flex-1 truncate text-sm">{f.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  onClick={() => removeFile(i)}
                  disabled={loading}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button className="w-full" onClick={handleUpload} disabled={loading}>
            <Upload className="h-4 w-4 mr-2" />
            {progressLabel}
          </Button>
        </div>
      )}

      {loading && <Progress value={progress} className="h-2" />}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
