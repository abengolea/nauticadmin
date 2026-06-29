"use client";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw } from "lucide-react";
import { useUserProfile } from "@/firebase";
import { useToast } from "@/hooks/use-toast";
import type { PlatformUser } from "@/lib/types";

function generatePassword(length = 12): string {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const resetPasswordSchema = z
  .object({
    password: z.string().min(6, "La contraseña debe tener al menos 6 caracteres."),
    passwordConfirm: z.string().min(6, "Confirmá la contraseña."),
  })
  .refine((data) => data.password === data.passwordConfirm, {
    message: "Las contraseñas no coinciden.",
    path: ["passwordConfirm"],
  });

type ResetUserPasswordDialogProps = {
  user: PlatformUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function ResetUserPasswordDialog({ user, open, onOpenChange }: ResetUserPasswordDialogProps) {
  const { user: currentUser } = useUserProfile();
  const { toast } = useToast();

  const form = useForm<z.infer<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: "",
      passwordConfirm: "",
    },
  });

  const { isSubmitting } = form.formState;

  const handleOpenChange = (next: boolean) => {
    if (!next) form.reset();
    onOpenChange(next);
  };

  const handleGeneratePassword = () => {
    const pwd = generatePassword();
    form.setValue("password", pwd, { shouldValidate: true });
    form.setValue("passwordConfirm", pwd, { shouldValidate: true });
  };

  async function onSubmit(values: z.infer<typeof resetPasswordSchema>) {
    if (!user) return;

    const token = await currentUser?.getIdToken?.().catch(() => null);
    if (!token) {
      toast({
        variant: "destructive",
        title: "Error de sesión",
        description: "No se pudo verificar tu sesión.",
      });
      return;
    }

    try {
      const res = await fetch("/api/admin/update-user-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: user.id,
          password: values.password,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Error",
          description: data.error || "No se pudo cambiar la contraseña.",
        });
        return;
      }

      toast({
        title: "Contraseña actualizada",
        description: data.message || `La contraseña de ${user.email} fue cambiada.`,
      });
      form.reset();
      onOpenChange(false);
    } catch (error: unknown) {
      console.error("[ResetUserPasswordDialog] Error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Ocurrió un error inesperado.",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cambiar contraseña</DialogTitle>
          <DialogDescription>
            Establecé una nueva contraseña para <strong>{user?.email}</strong>. El usuario podrá
            ingresar con esta contraseña de inmediato.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nueva contraseña</FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input type="text" placeholder="Mínimo 6 caracteres" {...field} />
                    </FormControl>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={handleGeneratePassword}
                      title="Generar contraseña"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="passwordConfirm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirmar contraseña</FormLabel>
                  <FormControl>
                    <Input type="text" placeholder="Repetí la contraseña" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isSubmitting ? "Guardando..." : "Cambiar contraseña"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
