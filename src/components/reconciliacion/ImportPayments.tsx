"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@/firebase";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  applySavedColumnMapping,
  detectColumnMapping,
  EMPTY_COLUMN_MAPPING,
  findBestProfile,
  hasPayerMapping,
} from "@/lib/reconciliacion-excel/column-mapping";
import {
  getPaymentsFilePreview,
  parsePaymentsFile,
} from "@/lib/reconciliacion-excel/parser";
import type {
  ColumnMapping,
  MappingProfile,
  PaymentFileKind,
  PaymentRow,
} from "@/lib/reconciliacion-excel/types";
import { PAYMENT_FILE_KIND_LABEL } from "@/lib/reconciliacion-excel/types";
import { Banknote, CreditCard, Loader2, Upload } from "lucide-react";
import { ColumnMappingComponent } from "./ColumnMapping";

type ImportPaymentsProps = {
  schoolId: string;
  onPaymentsLoaded: (payments: PaymentRow[]) => void;
};

const NONE_PROFILE = "__none__";

export function ImportPayments({ schoolId, onPaymentsLoaded }: ImportPaymentsProps) {
  const { user } = useUser();
  const [profiles, setProfiles] = useState<MappingProfile[]>([]);
  const creditRef = useRef<PaymentRow[]>([]);
  const debitRef = useRef<PaymentRow[]>([]);

  const loadProfiles = useCallback(async () => {
    if (!user || !schoolId) return;
    const token = await user.getIdToken();
    const res = await fetch(
      `/api/reconciliacion-excel/column-mappings?schoolId=${encodeURIComponent(schoolId)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return;
    const data = await res.json();
    setProfiles(data.profiles ?? []);
  }, [user, schoolId]);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  const emitPayments = useCallback(
    (credit: PaymentRow[], debit: PaymentRow[]) => {
      onPaymentsLoaded([...credit, ...debit]);
    },
    [onPaymentsLoaded]
  );

  const handleKindLoaded = useCallback(
    (kind: PaymentFileKind, list: PaymentRow[]) => {
      if (kind === "credit") creditRef.current = list;
      else debitRef.current = list;
      emitPayments(creditRef.current, debitRef.current);
    },
    [emitPayments]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Paso 2: Archivos de créditos y débitos</CardTitle>
        <CardDescription>
          Usá el Excel de Rendición DA (Apellido, Nombre, Nro Tarjeta, Importe, Aplicada, Observaciones).
          Si más adelante hay otra columna, agregala y guardá el mapeo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <PaymentFileSlot
            kind="credit"
            schoolId={schoolId}
            profiles={profiles}
            onProfilesChanged={loadProfiles}
            onPaymentsLoaded={handleKindLoaded}
          />
          <PaymentFileSlot
            kind="debit"
            schoolId={schoolId}
            profiles={profiles}
            onProfilesChanged={loadProfiles}
            onPaymentsLoaded={handleKindLoaded}
          />
        </div>
      </CardContent>
    </Card>
  );
}

type PaymentFileSlotProps = {
  kind: PaymentFileKind;
  schoolId: string;
  profiles: MappingProfile[];
  onProfilesChanged: () => Promise<void> | void;
  onPaymentsLoaded: (kind: PaymentFileKind, payments: PaymentRow[]) => void;
};

function PaymentFileSlot({
  kind,
  schoolId,
  profiles,
  onProfilesChanged,
  onPaymentsLoaded,
}: PaymentFileSlotProps) {
  const { user } = useUser();
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>(EMPTY_COLUMN_MAPPING);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [profileName, setProfileName] = useState(
    kind === "credit" ? "Visa Crédito" : "Visa Débito"
  );
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [preview, setPreview] = useState<string[][]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mappingDone, setMappingDone] = useState(false);

  const kindProfiles = profiles.filter((p) => p.kind === kind);
  const inputId = `payments-file-${kind}`;

  const applyProfile = useCallback((profile: MappingProfile, fileHeaders: string[]) => {
    setMapping(applySavedColumnMapping(fileHeaders, profile.mapping));
    setSelectedProfileId(profile.id);
    setProfileName(profile.name);
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;
      setFile(f);
      setError(null);
      setMappingDone(false);
      setPayments([]);
      setLoading(true);
      try {
        const previewData = await getPaymentsFilePreview(f);
        setHeaders(previewData.headers);
        setPreview(previewData.preview);
        setTotalRows(previewData.totalRows);

        const match = findBestProfile(previewData.headers, profiles, kind);
        if (match) {
          applyProfile(match, previewData.headers);
        } else {
          setSelectedProfileId("");
          setMapping(
            previewData.headers.length > 0
              ? detectColumnMapping(previewData.headers)
              : EMPTY_COLUMN_MAPPING
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al leer");
      } finally {
        setLoading(false);
      }
    },
    [applyProfile, kind, profiles]
  );

  const handleSelectProfile = (id: string) => {
    if (id === NONE_PROFILE) {
      setSelectedProfileId("");
      if (headers.length) setMapping(detectColumnMapping(headers));
      return;
    }
    const profile = profiles.find((p) => p.id === id);
    if (profile) applyProfile(profile, headers);
  };

  const handleApplyMapping = useCallback(async () => {
    if (!file || !hasPayerMapping(mapping) || !mapping.amount) return;
    setLoading(true);
    setError(null);
    try {
      const result = await parsePaymentsFile(file, mapping, kind);
      setPayments(result.payments);
      setPreview(result.preview);
      setTotalRows(result.totalRows);
      if (result.error) {
        setError(result.error);
        toast({ variant: "destructive", title: "Error", description: result.error });
      } else {
        onPaymentsLoaded(kind, result.payments);
        setMappingDone(true);
        toast({
          title: `${PAYMENT_FILE_KIND_LABEL[kind]} cargados`,
          description: `${result.payments.length} movimientos listos para conciliar`,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al parsear";
      setError(msg);
      toast({ variant: "destructive", title: "Error", description: msg });
    } finally {
      setLoading(false);
    }
  }, [file, kind, mapping, onPaymentsLoaded, toast]);

  const handleSaveProfile = useCallback(async () => {
    if (!user || !profileName.trim()) {
      toast({ variant: "destructive", title: "Poné un nombre al mapeo" });
      return;
    }
    setSaving(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/reconciliacion-excel/column-mappings?schoolId=${encodeURIComponent(schoolId)}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            id: selectedProfileId || undefined,
            name: profileName.trim(),
            kind,
            mapping,
            headers,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar");
      if (data.profile?.id) setSelectedProfileId(data.profile.id);
      await onProfilesChanged();
      toast({ title: "Mapeo guardado", description: profileName.trim() });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "No se pudo guardar",
        description: err instanceof Error ? err.message : "Error desconocido",
      });
    } finally {
      setSaving(false);
    }
  }, [
    headers,
    kind,
    mapping,
    onProfilesChanged,
    profileName,
    schoolId,
    selectedProfileId,
    toast,
    user,
  ]);

  const busy = loading || saving;
  const KindIcon = kind === "credit" ? CreditCard : Banknote;

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex items-center gap-2">
        <KindIcon className="h-4 w-4" />
        <h3 className="font-medium">{PAYMENT_FILE_KIND_LABEL[kind]}</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Subí la rendición. Los campos se arman con el formato del sistema.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <TooltipProvider>
          <label className="cursor-pointer">
            <input
              id={inputId}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileChange}
              disabled={busy}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="outline" asChild>
                  <span>
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    {file ? file.name : `Seleccionar archivo de ${PAYMENT_FILE_KIND_LABEL[kind].toLowerCase()}`}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Excel Rendición DA de {PAYMENT_FILE_KIND_LABEL[kind].toLowerCase()}.</p>
              </TooltipContent>
            </Tooltip>
          </label>
        </TooltipProvider>
      </div>

      {kindProfiles.length > 0 && headers.length > 0 && (
        <div className="space-y-2">
          <Label>Mapeo guardado</Label>
          <Select value={selectedProfileId || NONE_PROFILE} onValueChange={handleSelectProfile}>
            <SelectTrigger>
              <SelectValue placeholder="Elegir un mapeo guardado…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE_PROFILE}>(formato del sistema)</SelectItem>
              {kindProfiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading && (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          Procesando archivo…
        </p>
      )}

      {headers.length > 0 && (
        <>
          <ColumnMappingComponent headers={headers} mapping={mapping} onChange={setMapping} />

          <div className="space-y-2">
            <Label htmlFor={`profile-name-${kind}`}>Nombre del mapeo</Label>
            <Input
              id={`profile-name-${kind}`}
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              placeholder={kind === "credit" ? "Visa Crédito" : "Visa Débito"}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" onClick={handleSaveProfile} disabled={busy || !profileName.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Guardar
            </Button>
            <Button
              onClick={handleApplyMapping}
              disabled={busy || !hasPayerMapping(mapping) || !mapping.amount}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Aplicar mapeo y cargar
            </Button>
          </div>
        </>
      )}

      {mappingDone && payments.length > 0 && (
        <div>
          <p className="text-sm font-medium mb-2">
            Cargados: {payments.length} · Total filas: {totalRows}
          </p>
          <div className="overflow-x-auto rounded border max-h-32 overflow-y-auto">
            <table className="text-xs min-w-full">
              <tbody>
                {preview.slice(0, 10).map((row, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {row.map((cell, j) => (
                      <td key={j} className="px-2 py-1 whitespace-nowrap">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
