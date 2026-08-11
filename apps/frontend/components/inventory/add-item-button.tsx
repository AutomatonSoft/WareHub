"use client";

import { ImagePlus, Loader2, Package2, Palette, Upload, X, type LucideIcon } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { readAuth } from "../../app/client-api-shared";
import { useLabels } from "../../app/use-labels";
import { useToast } from "../shared/toast-provider";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "../ui/select";
import { Textarea } from "../ui/textarea";
import {
  createKidItem,
  patchKidPhotoUrls,
  uploadKidImages,
  CreateKidRequestError,
  type CreateKidFieldErrors,
  type InventoryWorkspace,
  type PlaceSuggestionHints,
} from "./inventory-api";
import { dedupeKidUploadFiles, validateKidUploadFiles } from "./kid-upload-validation";

const ACCOUNT_EMPTY_VALUE = "__empty_account__";
const MAX_KID_NUMBER_LENGTH = 255;
const MAX_PLACE_LENGTH = 255;
const MAX_SECTION_LENGTH = 1;
const MAX_ROOM_LENGTH = 128;
const MAX_TYPE_LENGTH = 128;
const MAX_COMPANY_LENGTH = 128;
const MAX_COLOR_LENGTH = 128;
const MAX_SIZE_LENGTH = 128;
const MAX_MATERIAL_LENGTH = 128;

type CreateKidFormState = {
  kidNumber: string;
  account: "" | "JV" | "XL" | "CH";
  bWare: boolean;
  company: string;
  color: string;
  commentary: string;
  inTransit: boolean;
  material: string;
  place: string;
  section: string;
  price: string;
  quantity: string;
  room: string;
  size: string;
  store: boolean;
  type: string;
  photoFiles: File[];
};

type AddProductButtonProps = {
  onCreated?: () => Promise<unknown> | unknown;
  workspace?: InventoryWorkspace;
};

type SubmitPhase = "creating" | "uploading" | "linking" | null;
type PhotoPreview = {
  file: File;
  url: string;
};

type PlaceConflictDialogState = {
  requestedPlace: string | null;
  currentPlace: string | null;
  sameBaseSubplace: string | null;
  nextFreeBasePlace: string | null;
  customPlace: string;
  customError: string;
};

function createEmptyFormState(): CreateKidFormState {
  return {
    kidNumber: "",
    account: "",
    bWare: false,
    company: "",
    color: "",
    commentary: "",
    inTransit: false,
    material: "",
    place: "",
    section: "",
    price: "",
    quantity: "",
    room: "",
    size: "",
    store: false,
    type: "",
    photoFiles: []
  };
}

function normalizeOptionalText(value: string): string | null {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateForm(state: CreateKidFormState, t: Record<string, string>): CreateKidFieldErrors {
  const errors: CreateKidFieldErrors = {};

  if (!state.kidNumber.trim()) {
    errors.kid_number = t.kidNumberRequired;
  } else if (state.kidNumber.trim().length > MAX_KID_NUMBER_LENGTH) {
    errors.kid_number = t.createKidKidNumberMax.replace("{max}", String(MAX_KID_NUMBER_LENGTH));
  }

  if (state.place.trim().length > MAX_PLACE_LENGTH) {
    errors.place = t.createKidPlaceMax.replace("{max}", String(MAX_PLACE_LENGTH));
  }

  if (state.section.trim().length > MAX_SECTION_LENGTH) {
    errors.section = t.section;
  }

  if (state.room.trim().length > MAX_ROOM_LENGTH) {
    errors.room = t.createKidRoomMax.replace("{max}", String(MAX_ROOM_LENGTH));
  }

  if (state.type.trim().length > MAX_TYPE_LENGTH) {
    errors.type = t.createKidTypeMax.replace("{max}", String(MAX_TYPE_LENGTH));
  }

  if (state.company.trim().length > MAX_COMPANY_LENGTH) {
    errors.company = t.createKidCompanyMax.replace("{max}", String(MAX_COMPANY_LENGTH));
  }

  if (state.color.trim().length > MAX_COLOR_LENGTH) {
    errors.color = t.createKidColorMax.replace("{max}", String(MAX_COLOR_LENGTH));
  }

  if (state.size.trim().length > MAX_SIZE_LENGTH) {
    errors.size = t.createKidSizeMax.replace("{max}", String(MAX_SIZE_LENGTH));
  }

  if (state.material.trim().length > MAX_MATERIAL_LENGTH) {
    errors.material = t.createKidMaterialMax.replace("{max}", String(MAX_MATERIAL_LENGTH));
  }

  if (state.price.trim().length > 0 && Number.isNaN(Number(state.price.trim().replace(",", ".")))) {
    errors.price = t.createKidPriceNumber;
  }

  if (state.quantity.trim().length > 0 && !/^\d+$/.test(state.quantity.trim())) {
    errors.quantity = t.createKidQuantityWhole;
  }

  return errors;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
  className = ""
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`h-auto rounded-[var(--radius-card)] border border-border/70 bg-muted/20 p-4 ${className}`}>
      <div className="mb-3.5 flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-border/80 bg-background text-primary">
          <Icon size={16} />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="text-xs leading-5 text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function CompactField({
  label,
  htmlFor,
  error,
  children
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </label>
      {children}
      <FieldError message={error} />
    </div>
  );
}

function hasPlaceChoices(suggestions: PlaceSuggestionHints | null): suggestions is PlaceSuggestionHints {
  return Boolean(suggestions && (suggestions.sameBaseSubplace || suggestions.nextFreeBasePlace));
}

function buildPlaceConflictDialogState(suggestions: PlaceSuggestionHints, fallbackPlace: string): PlaceConflictDialogState {
  return {
    requestedPlace: suggestions.requestedPlace,
    currentPlace: suggestions.currentPlace,
    sameBaseSubplace: suggestions.sameBaseSubplace,
    nextFreeBasePlace: suggestions.nextFreeBasePlace,
    customPlace:
      suggestions.sameBaseSubplace ??
      suggestions.nextFreeBasePlace ??
      suggestions.requestedPlace ??
      suggestions.currentPlace ??
      fallbackPlace,
    customError: "",
  };
}

function StatusFlagField({
  label,
  checked,
  onCheckedChange
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex h-10 min-w-0 items-center justify-between gap-2.5 rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm text-foreground transition-colors hover:border-primary/30 hover:bg-muted/20">
      <span className="truncate text-sm font-medium">{label}</span>
      <Checkbox checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} />
    </label>
  );
}

export function AddProductButton({ onCreated, workspace }: AddProductButtonProps) {
  const t = useLabels();
  const { showToast } = useToast();
  const auth = readAuth();
  const canCreateKid =
    auth?.user.status === "approved" &&
    (auth.user.role === "admin" || auth.user.role === "user");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateKidFormState>(() => createEmptyFormState());
  const [fieldErrors, setFieldErrors] = useState<CreateKidFieldErrors>({});
  const [generalError, setGeneralError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [photoPreviews, setPhotoPreviews] = useState<PhotoPreview[]>([]);
  const [placeConflictDialog, setPlaceConflictDialog] = useState<PlaceConflictDialogState | null>(null);

  useEffect(() => {
    const nextPreviews = form.photoFiles.map((file) => ({
      file,
      url: URL.createObjectURL(file)
    }));
    setPhotoPreviews(nextPreviews);

    return () => {
      for (const preview of nextPreviews) {
        URL.revokeObjectURL(preview.url);
      }
    };
  }, [form.photoFiles]);

  if (!canCreateKid) {
    return null;
  }

  function resetForm() {
    setForm(createEmptyFormState());
    setFieldErrors({});
    setGeneralError("");
    setSubmitPhase(null);
    setFileInputKey((current) => current + 1);
    setPlaceConflictDialog(null);
  }

  function closeModal() {
    if (isSubmitting) return;
    setOpen(false);
    resetForm();
  }

  function removePhotoFile(index: number) {
    setForm((current) => ({
      ...current,
      photoFiles: current.photoFiles.filter((_, currentIndex) => currentIndex !== index)
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = validateForm(form, t);
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setGeneralError("");
      return;
    }

    setIsSubmitting(true);
    setFieldErrors({});
    setGeneralError("");
    setPlaceConflictDialog(null);
    setSubmitPhase("creating");

    try {
      const dedupedPhotos = dedupeKidUploadFiles(form.photoFiles);
      const uploadValidationError = validateKidUploadFiles(dedupedPhotos.files);
      if (uploadValidationError) {
        const uploadErrorMessage =
          uploadValidationError === "too_many_files"
            ? t.createKidTooManyPhotos
            : uploadValidationError === "empty_file"
              ? t.createKidEmptyPhoto
              : uploadValidationError === "not_image"
                ? t.createKidOnlyImages
                : uploadValidationError === "unsupported_format"
                  ? t.createKidUnsupportedImageFormat
                  : t.createKidPhotoTooLarge;
        setFieldErrors({ photo_files: uploadErrorMessage });
        setGeneralError(uploadErrorMessage);
        return;
      }

      const created = await createKidItem({
        workspace,
        kidNumber: form.kidNumber.trim(),
        account: form.account || null,
        bWare: form.bWare,
        company: normalizeOptionalText(form.company),
        color: normalizeOptionalText(form.color),
        commentary: normalizeOptionalText(form.commentary),
        inTransit: form.inTransit,
        store: form.store,
        material: normalizeOptionalText(form.material),
        place: normalizeOptionalText(form.place),
        section: normalizeOptionalText(form.section),
        price: normalizeOptionalText(form.price),
        quantity: normalizeOptionalText(form.quantity),
        room: normalizeOptionalText(form.room),
        size: normalizeOptionalText(form.size),
        type: normalizeOptionalText(form.type)
      });

      if (created.id === null) {
        throw new Error(t.createKidSucceededNoId);
      }

      if (dedupedPhotos.files.length > 0) {
        try {
          setSubmitPhase("uploading");
          const uploadedUrls = await uploadKidImages(dedupedPhotos.files, workspace);
          try {
            setSubmitPhase("linking");
            await patchKidPhotoUrls(created.id, uploadedUrls, workspace);
          } catch (error) {
            const message = error instanceof Error ? error.message : t.createKidUnknownPhotoLinkingError;
            throw new Error(t.createKidPhotoLinkingFailed.replace("{message}", message));
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : t.createKidUnknownPhotoUploadError;
          if (message.startsWith(t.createKidPhotoLinkingFailedPrefix)) {
            throw error;
          }
          throw new Error(t.createKidPhotoUploadFailed.replace("{message}", message));
        }
      }

      setOpen(false);
      resetForm();
      showToast(t.createKidCreatedSuccess, "success");
      try {
        await onCreated?.();
      } catch {
        showToast(t.createKidRefreshInfo, "info");
      }
    } catch (error) {
      const requestError = error as Partial<CreateKidRequestError>;
      const rawMessage = requestError.message || t.createKidUnknownCreateError;
      const nextMessage =
        rawMessage.startsWith(t.createKidPhotoUploadFailedPrefix) ||
        rawMessage.startsWith(t.createKidPhotoLinkingFailedPrefix) ||
        rawMessage.startsWith(t.createKidFailedPrefix)
          ? rawMessage
          : t.createKidFailedWithReason.replace("{message}", rawMessage);
      const nextFieldErrors =
        nextMessage.startsWith(t.createKidPhotoUploadFailedPrefix) ||
        nextMessage.startsWith(t.createKidPhotoLinkingFailedPrefix)
          ? {}
          : (requestError.fieldErrors ?? {});
      const nextPlaceSuggestions = requestError.placeSuggestions ?? null;
      if (requestError instanceof CreateKidRequestError && requestError.status === 400 && hasPlaceChoices(nextPlaceSuggestions)) {
        setFieldErrors({});
        setGeneralError("");
        setPlaceConflictDialog(buildPlaceConflictDialogState(nextPlaceSuggestions, form.place.trim()));
        return;
      }
      setFieldErrors(nextFieldErrors);
      setGeneralError(nextMessage);
      showToast(nextMessage, "error");
    } finally {
      setIsSubmitting(false);
      setSubmitPhase(null);
    }
  }

  function applyResolvedPlace(nextPlace: string) {
    const normalized = nextPlace.trim();
    if (!normalized) {
      return;
    }
    setForm((current) => ({ ...current, place: normalized }));
    setFieldErrors((current) => {
      if (!current.place) {
        return current;
      }
      const { place, ...rest } = current;
      return rest;
    });
    setGeneralError("");
    setPlaceConflictDialog(null);
  }

  function submitCustomResolvedPlace() {
    if (!placeConflictDialog) {
      return;
    }
    const normalized = placeConflictDialog.customPlace.trim();
    if (!normalized) {
      setPlaceConflictDialog((current) =>
        current
          ? {
              ...current,
              customError: t.createKidCustomPlaceRequired,
            }
          : current,
      );
      return;
    }
    applyResolvedPlace(normalized);
  }

  const submitPhaseLabel =
    submitPhase === "creating"
      ? t.createKidCreatingRecord
      : submitPhase === "uploading"
        ? t.createKidUploadingPhotos
        : submitPhase === "linking"
          ? t.createKidLinkingPhotos
          : null;

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        {t.addItem}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeModal();
            return;
          }
          setOpen(true);
        }}
      >
        <DialogContent
          className="w-[min(1180px,calc(100vw-24px))] max-h-[94vh] overflow-hidden p-0 sm:max-w-[1180px]"
          showCloseButton={!isSubmitting}
        >
          <DialogHeader className="border-b border-border/70 px-6 py-3.5">
            <DialogTitle className="text-base font-semibold text-foreground">{t.createKidTitle}</DialogTitle>
            <DialogDescription>
              {t.createKidDescription}
            </DialogDescription>
          </DialogHeader>

          <form className="flex max-h-[calc(94vh-81px)] min-h-0 flex-col" onSubmit={(event) => void handleSubmit(event)}>
            <div className="flex-1 space-y-3 overflow-y-auto px-6 pb-20 pt-4">
              <div className="mt-0 grid gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.95fr)] lg:items-start">
                <SectionCard
                  icon={Package2}
                  title={t.createKidIdentityTitle}
                  description={t.createKidIdentityDescription}
                >
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <div className="md:col-span-2 xl:col-span-2">
                      <CompactField label={t.createKidNumberRequiredLabel} htmlFor="create-kid-kid-number" error={fieldErrors.kid_number}>
                        <Input
                          id="create-kid-kid-number"
                          className="h-10 rounded-[var(--radius-control)]"
                          value={form.kidNumber}
                          maxLength={MAX_KID_NUMBER_LENGTH}
                          aria-invalid={fieldErrors.kid_number ? "true" : "false"}
                          onChange={(event) => setForm((current) => ({ ...current, kidNumber: event.target.value }))}
                        />
                      </CompactField>
                    </div>

                    <div className="md:col-span-2 xl:col-span-1">
                      <CompactField label={t.account} htmlFor="create-kid-account" error={fieldErrors.account}>
                        <Select
                          value={form.account || ACCOUNT_EMPTY_VALUE}
                          onValueChange={(value) => {
                            const nextValue = String(value || "");
                            setForm((current) => ({
                              ...current,
                              account: nextValue === ACCOUNT_EMPTY_VALUE ? "" : (nextValue as CreateKidFormState["account"])
                            }));
                          }}
                        >
                          <SelectTrigger
                            id="create-kid-account"
                            className="h-10 w-full min-w-0 rounded-[var(--radius-control)]"
                            aria-invalid={fieldErrors.account ? "true" : "false"}
                          >
                            <span className={`min-w-0 truncate text-left ${form.account ? "text-foreground" : "text-muted-foreground"}`}>
                              {form.account || t.createKidSelectAccount}
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={ACCOUNT_EMPTY_VALUE}>{t.notSelected}</SelectItem>
                            <SelectItem value="JV">JV</SelectItem>
                            <SelectItem value="XL">XL</SelectItem>
                            <SelectItem value="CH">CH</SelectItem>
                          </SelectContent>
                        </Select>
                      </CompactField>
                    </div>

                    <div className="xl:col-span-1">
                      <CompactField label={t.place} htmlFor="create-kid-place" error={fieldErrors.place}>
                        <Input
                          id="create-kid-place"
                          className="h-10 rounded-[var(--radius-control)]"
                          value={form.place}
                          maxLength={MAX_PLACE_LENGTH}
                          aria-invalid={fieldErrors.place ? "true" : "false"}
                          onChange={(event) => {
                            setForm((current) => ({ ...current, place: event.target.value }));
                            setPlaceConflictDialog(null);
                          }}
                        />
                      </CompactField>
                    </div>

                    <div className="xl:col-span-1">
                      <CompactField label={t.section} htmlFor="create-kid-section" error={fieldErrors.section}>
                        <Input
                          id="create-kid-section"
                          className="h-10 rounded-[var(--radius-control)]"
                          value={form.section}
                          maxLength={MAX_SECTION_LENGTH}
                          aria-invalid={fieldErrors.section ? "true" : "false"}
                          onChange={(event) => setForm((current) => ({ ...current, section: event.target.value.toUpperCase() }))}
                        />
                      </CompactField>
                    </div>

                    <div className="xl:col-span-1">
                      <CompactField label={t.company} htmlFor="create-kid-company" error={fieldErrors.company}>
                        <Input
                          id="create-kid-company"
                          className="h-10 rounded-[var(--radius-control)]"
                          value={form.company}
                          maxLength={MAX_COMPANY_LENGTH}
                          aria-invalid={fieldErrors.company ? "true" : "false"}
                          onChange={(event) => setForm((current) => ({ ...current, company: event.target.value }))}
                        />
                      </CompactField>
                    </div>

                    <div className="xl:col-span-1">
                      <CompactField label={t.room} htmlFor="create-kid-room" error={fieldErrors.room}>
                        <Input
                          id="create-kid-room"
                          className="h-10 rounded-[var(--radius-control)]"
                          value={form.room}
                          maxLength={MAX_ROOM_LENGTH}
                          aria-invalid={fieldErrors.room ? "true" : "false"}
                          onChange={(event) => setForm((current) => ({ ...current, room: event.target.value }))}
                        />
                      </CompactField>
                    </div>

                    <div className="xl:col-span-1">
                      <CompactField label={t.type} htmlFor="create-kid-type" error={fieldErrors.type}>
                        <Input
                          id="create-kid-type"
                          className="h-10 rounded-[var(--radius-control)]"
                          value={form.type}
                          maxLength={MAX_TYPE_LENGTH}
                          aria-invalid={fieldErrors.type ? "true" : "false"}
                          onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))}
                        />
                      </CompactField>
                    </div>

                    <div className="xl:col-span-1">
                      <CompactField label={t.price} htmlFor="create-kid-price" error={fieldErrors.price}>
                        <Input
                          id="create-kid-price"
                          className="h-10 rounded-[var(--radius-control)]"
                          inputMode="decimal"
                          value={form.price}
                          aria-invalid={fieldErrors.price ? "true" : "false"}
                          onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
                        />
                      </CompactField>
                    </div>

                    <div className="md:col-span-2 xl:col-span-3">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <StatusFlagField
                          label={t.bWare}
                          checked={form.bWare}
                          onCheckedChange={(checked) => setForm((current) => ({ ...current, bWare: checked }))}
                        />
                        <StatusFlagField
                          label={t.store}
                          checked={form.store}
                          onCheckedChange={(checked) => setForm((current) => ({ ...current, store: checked }))}
                        />
                        <StatusFlagField
                          label={t.inTransit}
                          checked={form.inTransit}
                          onCheckedChange={(checked) => setForm((current) => ({ ...current, inTransit: checked }))}
                        />
                      </div>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard
                  icon={Palette}
                  title={t.createKidAttributesTitle}
                  description={t.createKidAttributesDescription}
                >
                  <div className="grid gap-3 md:grid-cols-2">
                    <CompactField label={t.quantity} htmlFor="create-kid-quantity" error={fieldErrors.quantity}>
                      <Input
                        id="create-kid-quantity"
                        className="h-10 rounded-[var(--radius-control)]"
                        inputMode="numeric"
                        value={form.quantity}
                        aria-invalid={fieldErrors.quantity ? "true" : "false"}
                        onChange={(event) => setForm((current) => ({ ...current, quantity: event.target.value }))}
                      />
                    </CompactField>

                    <CompactField label={t.color} htmlFor="create-kid-color" error={fieldErrors.color}>
                      <Input
                        id="create-kid-color"
                        className="h-10 rounded-[var(--radius-control)]"
                        value={form.color}
                        maxLength={MAX_COLOR_LENGTH}
                        aria-invalid={fieldErrors.color ? "true" : "false"}
                        onChange={(event) => setForm((current) => ({ ...current, color: event.target.value }))}
                      />
                    </CompactField>

                    <CompactField label={t.size} htmlFor="create-kid-size" error={fieldErrors.size}>
                      <Input
                        id="create-kid-size"
                        className="h-10 rounded-[var(--radius-control)]"
                        value={form.size}
                        maxLength={MAX_SIZE_LENGTH}
                        aria-invalid={fieldErrors.size ? "true" : "false"}
                        onChange={(event) => setForm((current) => ({ ...current, size: event.target.value }))}
                      />
                    </CompactField>

                    <CompactField label={t.material} htmlFor="create-kid-material" error={fieldErrors.material}>
                      <Input
                        id="create-kid-material"
                        className="h-10 rounded-[var(--radius-control)]"
                        value={form.material}
                        maxLength={MAX_MATERIAL_LENGTH}
                        aria-invalid={fieldErrors.material ? "true" : "false"}
                        onChange={(event) => setForm((current) => ({ ...current, material: event.target.value }))}
                      />
                    </CompactField>

                    <div className="min-w-0 md:col-span-2">
                      <CompactField label={t.commentary} htmlFor="create-kid-commentary" error={fieldErrors.commentary}>
                        <Textarea
                          id="create-kid-commentary"
                          className="h-[100px] min-h-[90px] max-h-[120px] w-full resize-y rounded-[var(--radius-control)] px-3 py-2.5"
                          value={form.commentary}
                          aria-invalid={fieldErrors.commentary ? "true" : "false"}
                          onChange={(event) => setForm((current) => ({ ...current, commentary: event.target.value }))}
                        />
                      </CompactField>
                    </div>
                  </div>
                </SectionCard>
              </div>

              <SectionCard
                icon={Upload}
                title={t.photos}
                description={t.createKidPhotosDescription}
                className="mt-3"
              >
                <div className="grid gap-3">
                  <CompactField label={t.photos} htmlFor="create-kid-photo" error={fieldErrors.photo ?? fieldErrors.photo_files}>
                    <div className="relative rounded-[var(--radius-card)] border border-dashed border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.94)_100%)] p-2.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
                      {isSubmitting ? (
                        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[var(--radius-card)] bg-background/75 backdrop-blur-[1px]">
                          <div className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-border bg-background px-3 py-2 text-xs font-medium text-foreground shadow-[var(--wh-shadow-card)]">
                            <Loader2 size={14} className="animate-spin text-primary" />
                            <span>{submitPhaseLabel ?? t.createKidProcessing}</span>
                          </div>
                        </div>
                      ) : null}
                      <Input
                        key={fileInputKey}
                        id="create-kid-photo"
                        className="sr-only"
                        type="file"
                        multiple
                        accept="image/*"
                        aria-invalid={fieldErrors.photo ? "true" : "false"}
                        onChange={(event) =>
                          setForm((current) => ({
                            ...current,
                            photoFiles: Array.from(event.target.files ?? [])
                          }))
                        }
                      />
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <div className="inline-flex items-center gap-2 rounded-[var(--radius-pill)] border border-primary/15 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary">
                            <ImagePlus size={14} />
                            <span>{form.photoFiles.length === 0 ? t.createKidNoPhotosYet : t.createKidPhotosSelected.replace("{count}", String(form.photoFiles.length))}</span>
                          </div>
                          <p className="text-xs leading-5 text-muted-foreground">
                            {isSubmitting ? (submitPhaseLabel ?? t.createKidProcessing) : t.createKidUploadPhotosHint}
                          </p>
                        </div>
                        <label
                          htmlFor="create-kid-photo"
                          className="inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] border border-border bg-background px-4 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted/40"
                        >
                          <Upload size={14} className="text-primary" />
                          <span>{t.chooseFile}</span>
                        </label>
                      </div>
                      <div className="mt-3 min-h-[90px] rounded-[calc(var(--radius-card)-6px)] border border-border/70 bg-background/80 p-2.5">
                        {photoPreviews.length > 0 ? (
                          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            {photoPreviews.map((preview, index) => (
                              <div
                                key={`${preview.file.name}-${preview.file.size}-${preview.file.lastModified}`}
                                className="overflow-hidden rounded-[var(--radius-control)] border border-border/70 bg-muted/[0.28]"
                              >
                                <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted/40">
                                  <img
                                    src={preview.url}
                                    alt={preview.file.name}
                                    className="h-full w-full object-cover"
                                  />
                                  <button
                                    type="button"
                                    className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-full border border-border/70 bg-background/90 text-muted-foreground transition-colors hover:border-destructive/30 hover:text-destructive"
                                    aria-label={t.productEditorRemoveImageAria.replace("{index}", preview.file.name)}
                                    onClick={() => removePhotoFile(index)}
                                    disabled={isSubmitting}
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                                <div className="space-y-1 px-3 py-2">
                                  <p className="truncate text-sm font-medium text-foreground" title={preview.file.name}>
                                    {preview.file.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">{formatFileSize(preview.file.size)}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex min-h-[90px] items-center justify-center rounded-[var(--radius-control)] border border-dashed border-border/70 bg-muted/[0.18] px-4 text-center text-sm leading-6 text-muted-foreground">
                            {t.createKidPhotosEmptyHint}
                          </div>
                        )}
                      </div>
                    </div>
                  </CompactField>
                </div>
              </SectionCard>
            </div>

            {generalError ? (
              <div className="border-t border-destructive/20 bg-destructive/5 px-6 py-3">
                <div className="rounded-[var(--radius-control)] border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {generalError}
                </div>
              </div>
            ) : null}

            <DialogFooter className="sticky bottom-0 z-20 flex flex-col-reverse gap-2 border-t border-border/70 bg-background/95 px-6 py-4 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] sm:flex-row sm:items-center sm:justify-end">
              <div className="mr-auto text-xs text-muted-foreground">
                {submitPhaseLabel ?? t.createKidFooterHint}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={closeModal} disabled={isSubmitting}>
                {t.cancel}
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting}>
                {isSubmitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" />
                    {submitPhase === "uploading" ? t.uploading : submitPhase === "linking" ? t.createKidLinkingShort : t.creating}
                  </span>
                ) : t.create}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(placeConflictDialog)} onOpenChange={(nextOpen) => { if (!nextOpen) setPlaceConflictDialog(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t.createKidChoosePlaceTitle}</DialogTitle>
            <DialogDescription>
              {placeConflictDialog
                ? (() => {
                    const occupiedPlace = placeConflictDialog.requestedPlace ?? placeConflictDialog.currentPlace ?? form.place.trim();
                    const quickChoices = [placeConflictDialog.sameBaseSubplace, placeConflictDialog.nextFreeBasePlace].filter(
                      (value, index, items): value is string => Boolean(value) && items.indexOf(value) === index,
                    );
                    if (quickChoices.length === 2) {
                      return t.createKidChoosePlaceTwo.replace("{place}", occupiedPlace).replace("{first}", quickChoices[0]).replace("{second}", quickChoices[1]);
                    }
                    if (quickChoices.length === 1) {
                      return t.createKidChoosePlaceOne.replace("{place}", occupiedPlace).replace("{first}", quickChoices[0]);
                    }
                    return t.createKidChoosePlaceGeneric;
                  })()
                : t.createKidChoosePlaceGeneric}
            </DialogDescription>
          </DialogHeader>
          {placeConflictDialog ? (
            <div className="space-y-4">
              <div className="rounded-[var(--radius-card)] border border-amber-300/60 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
                {placeConflictDialog.currentPlace && !placeConflictDialog.requestedPlace ? (
                  <p>{t.createKidAlreadyExistsPlace.replace("{place}", placeConflictDialog.currentPlace)}</p>
                ) : null}
                {placeConflictDialog.requestedPlace ? (
                  <p>{t.createKidRequestedPlace.replace("{place}", placeConflictDialog.requestedPlace)}</p>
                ) : null}
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {placeConflictDialog.sameBaseSubplace ? (
                  <Button type="button" variant="outline" className="justify-center" onClick={() => applyResolvedPlace(placeConflictDialog.sameBaseSubplace!)}>
                    {placeConflictDialog.sameBaseSubplace}
                  </Button>
                ) : null}
                {placeConflictDialog.nextFreeBasePlace ? (
                  <Button type="button" variant="outline" className="justify-center" onClick={() => applyResolvedPlace(placeConflictDialog.nextFreeBasePlace!)}>
                    {placeConflictDialog.nextFreeBasePlace}
                  </Button>
                ) : null}
              </div>

              <div className="rounded-[var(--radius-card)] border border-border/70 bg-muted/20 p-4">
                <div className="space-y-2">
                  <label htmlFor="create-kid-custom-place" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {t.createKidCustomVariant}
                  </label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      id="create-kid-custom-place"
                      value={placeConflictDialog.customPlace}
                      maxLength={MAX_PLACE_LENGTH}
                      onChange={(event) =>
                        setPlaceConflictDialog((current) =>
                          current
                            ? {
                                ...current,
                                customPlace: event.target.value,
                                customError: "",
                              }
                            : current,
                        )
                      }
                    />
                    <Button type="button" onClick={submitCustomResolvedPlace}>
                      {t.createKidUseThisPlace}
                    </Button>
                  </div>
                  <FieldError message={placeConflictDialog.customError} />
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPlaceConflictDialog(null)}>
              {t.close}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export { AddProductButton as AddItemButton };
