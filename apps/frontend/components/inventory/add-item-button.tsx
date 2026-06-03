"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { readAuth } from "../../app/client-api";
import { useLabels } from "../../app/use-labels";
import { Button } from "../shared/button";
import { Input } from "../shared/input";
import { createKidItem } from "./inventory-api";

export function AddItemButton() {
  const t = useLabels();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kidNumber, setKidNumber] = useState("");
  const [place, setPlace] = useState("");
  const [photo, setPhoto] = useState("");
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  async function handleCreateItem() {
    if (!readAuth()?.token) {
      router.replace("/login");
      return;
    }
    const kid = kidNumber.trim();
    if (!kid) {
      setError(t.kidNumberRequired);
      return;
    }
    try {
      setCreating(true);
      setError("");
      await createKidItem({
        kidNumber: kid,
        place,
        photo,
        photoFiles
      });

      setOpen(false);
      setKidNumber("");
      setPlace("");
      setPhoto("");
      setPhotoFiles([]);
      router.push(`/product-editor?kid=${encodeURIComponent(kid)}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : t.failedCreateItem);
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Button variant="primary" className="wh-discover-button min-w-[126px]" onClick={() => setOpen(true)}>
        {t.addItem}
      </Button>
      {open ? (
        <div className="ui-backdrop-fade ui-modal-backdrop" role="presentation" onClick={() => !creating && setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t.addItem}
            className="ui-modal-enter ui-modal-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="ui-modal-header">
              <div>
                <h3 className="text-lg font-semibold text-[color:var(--text-primary)]">{t.addItem}</h3>
                <p className="mt-1 text-sm text-[color:var(--text-muted)]">{t.createItemHint}</p>
              </div>
            </div>
            <div className="ui-modal-body ui-form-stack">
              <Input
                type="text"
                value={kidNumber}
                onChange={(event) => setKidNumber(event.target.value)}
                placeholder={t.kidNumber}
              />
              <Input
                type="text"
                value={place}
                onChange={(event) => setPlace(event.target.value)}
                placeholder={t.placeOptional}
              />
              <Input
                type="text"
                value={photo}
                onChange={(event) => setPhoto(event.target.value)}
                placeholder={t.photoUrlOptional}
              />
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => setPhotoFiles(event.target.files ? Array.from(event.target.files) : [])}
                className="ui-input block w-full rounded-xl px-3 py-2 text-[color:var(--text-primary)]"
              />
            </div>
            {error ? <p className="ui-form-error mt-3">{error}</p> : null}
            <div className="ui-modal-footer">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={creating}>
                {t.cancel}
              </Button>
              <Button type="button" onClick={() => void handleCreateItem()} disabled={creating}>
                {creating ? t.creating : t.addItem}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

