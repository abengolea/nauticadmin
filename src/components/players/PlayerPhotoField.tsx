"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useStorage } from "@/firebase/provider";
import { uploadPlayerPhoto } from "@/lib/player-photo";
import { useToast } from "@/hooks/use-toast";
import { Camera, Upload, Loader2, Ship, X } from "lucide-react";

interface PlayerPhotoFieldProps {
  value: string;
  onChange: (url: string) => void;
  schoolId: string;
  /** Si no se pasa, el componente guarda el archivo y llama a onFileChange (para jugador nuevo). */
  playerId?: string;
  playerName?: string;
  disabled?: boolean;
  /** Cuando no hay playerId, se llama con el archivo en lugar de subir (para subir después de crear el jugador). Pasar null para limpiar. */
  onFileChange?: (file: File | null) => void;
}

export function PlayerPhotoField({
  value,
  onChange,
  schoolId,
  playerId,
  playerName = "",
  disabled = false,
  onFileChange,
}: PlayerPhotoFieldProps) {
  const isNewPlayer = !playerId;
  const storage = useStorage();
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!cameraOpen) {
      stopStream();
      setCameraError(null);
      return;
    }
    let cancelled = false;
    setCameraError(null);
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user" } })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setCameraError(err.message || "No se pudo acceder a la cámara.");
        }
      });
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [cameraOpen, stopStream]);

  useEffect(() => {
    return () => {
      if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    };
  }, [pendingPreviewUrl]);

  const handleCapture = async () => {
    const video = videoRef.current;
    if (!video || !streamRef.current || video.readyState < 2) return;
    const canvas = canvasRef.current || document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    return new Promise<string | void>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("No se pudo generar la imagen."));
            return;
          }
          const file = new File([blob], "photo.jpg", { type: "image/jpeg" });
          if (isNewPlayer && onFileChange) {
            onFileChange(file);
            setPendingPreviewUrl((prev) => {
              if (prev) URL.revokeObjectURL(prev);
              return URL.createObjectURL(file);
            });
            setCameraOpen(false);
            toast({ title: "Foto guardada", description: "La foto se subirá al crear el cliente." });
            resolve();
            return;
          }
          setUploading(true);
          uploadPlayerPhoto(storage, schoolId, playerId!, file)
            .then((url) => {
              onChange(url);
              setCameraOpen(false);
              toast({ title: "Foto guardada", description: "La foto se subió correctamente." });
              resolve(url);
            })
            .catch((err) => {
              toast({
                variant: "destructive",
                title: "Error al subir",
                description: err.message || "No se pudo subir la foto.",
              });
              reject(err);
            })
            .finally(() => setUploading(false));
        },
        "image/jpeg",
        0.9
      );
    });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({
        variant: "destructive",
        title: "Archivo no válido",
        description: "Seleccioná una imagen (JPG, PNG o WebP).",
      });
      return;
    }
    e.target.value = "";
    if (isNewPlayer && onFileChange) {
      onFileChange(file);
      setPendingPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
      toast({ title: "Foto guardada", description: "La foto se subirá al crear el jugador." });
      return;
    }
    setUploading(true);
    try {
      const url = await uploadPlayerPhoto(storage, schoolId, playerId!, file);
      onChange(url);
      toast({ title: "Foto guardada", description: "La foto se subió correctamente." });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Error al subir",
        description: err instanceof Error ? err.message : "No se pudo subir la foto.",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row items-start gap-4">
        <Avatar className="h-24 w-24 border-2 border-muted">
          <AvatarImage src={pendingPreviewUrl || value || undefined} alt="Foto de la embarcación" />
          <AvatarFallback className="text-2xl">
            <Ship className="h-10 w-10 text-muted-foreground" />
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">Foto de la embarcación</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="default"
              size="sm"
              disabled={disabled || uploading}
              onClick={() => setCameraOpen(true)}
              className="gap-2"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
              Sacar foto
            </Button>
            <Button type="button" variant="outline" size="sm" disabled={disabled || uploading} asChild>
              <label className="cursor-pointer gap-2 flex items-center">
                <Upload className="h-4 w-4" />
                Subir foto
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={handleFileSelect}
                  disabled={disabled || uploading}
                />
              </label>
            </Button>
            {isNewPlayer && pendingPreviewUrl && onFileChange && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                onClick={() => {
                  onFileChange(null);
                  setPendingPreviewUrl((prev) => {
                    if (prev) URL.revokeObjectURL(prev);
                    return null;
                  });
                }}
                className="gap-2 text-muted-foreground"
              >
                <X className="h-4 w-4" />
                Quitar
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Sacá una foto de la embarcación o subí una imagen desde tu dispositivo (máx. 2MB).
          </p>
        </div>
      </div>

      <Dialog open={cameraOpen} onOpenChange={setCameraOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sacar foto</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            {cameraError ? (
              <p className="text-sm text-destructive py-4">{cameraError}</p>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full max-h-[50vh] rounded-lg bg-black object-contain"
                />
                <canvas ref={canvasRef} className="hidden" />
              </>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCameraOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleCapture}
              disabled={!!cameraError || uploading}
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Camera className="h-4 w-4 mr-2" />}
              Capturar y subir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
