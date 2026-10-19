'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type PhonesInputProps = {
  value: string[];
  onChange: (phones: string[]) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Si true, no muestra el Label (útil dentro de FormLabel externo). */
  hideLabel?: boolean;
};

/**
 * Lista de teléfonos de contacto con botón "+" para agregar más.
 * Siempre muestra al menos un campo.
 */
export function PhonesInput({
  value,
  onChange,
  label = 'Teléfono de contacto',
  placeholder = '+54 9 ...',
  disabled = false,
  id = 'phones',
  className,
  hideLabel = false,
}: PhonesInputProps) {
  const phones = value.length > 0 ? value : [''];

  const updateAt = (index: number, nextValue: string) => {
    const next = [...phones];
    next[index] = nextValue;
    onChange(next);
  };

  const removeAt = (index: number) => {
    if (phones.length <= 1) {
      onChange(['']);
      return;
    }
    onChange(phones.filter((_, i) => i !== index));
  };

  const addPhone = () => {
    onChange([...phones, '']);
  };

  return (
    <div className={cn('space-y-2', className)}>
      {!hideLabel && <Label htmlFor={`${id}-0`}>{label}</Label>}
      <div className="space-y-2">
        {phones.map((phone, index) => {
          const isLast = index === phones.length - 1;
          return (
            <div key={index} className="flex items-center gap-2">
              <Input
                id={`${id}-${index}`}
                value={phone}
                onChange={(e) => updateAt(index, e.target.value)}
                placeholder={placeholder}
                disabled={disabled}
                inputMode="tel"
                autoComplete="tel"
              />
              {phones.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeAt(index)}
                  disabled={disabled}
                  aria-label={`Quitar teléfono ${index + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              {isLast && (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-10 w-10 shrink-0"
                  onClick={addPhone}
                  disabled={disabled}
                  aria-label="Agregar teléfono"
                  title="Agregar otro teléfono"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
