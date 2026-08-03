import { FormField } from "../../components/ui/form-field";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import { useLabels } from "../../app/use-labels";
import {
  type CreateProductFieldKey,
  type HoodCreateFieldKey,
  type HoodCreateFields,
  type MainKauflandCreateFieldKey,
  type MainKauflandCreateFields,
  type MainXljvCreateFieldKey,
  type MainXljvCreateFields,
} from "./create-product-model";

type Labels = Record<string, string>;

type Props = {
  t: Labels;
  ean: string;
  price: string;
  productName: string;
  imagesText: string;
  imageFiles?: File[];
  fieldErrors: Partial<Record<CreateProductFieldKey, string>>;
  allowFileUpload?: boolean;
  onEanChange: (value: string) => void;
  onPriceChange: (value: string) => void;
  onProductNameChange: (value: string) => void;
  onImagesTextChange: (value: string) => void;
  onImageFilesChange?: (files: File[]) => void;
};

export function CreateProductFormPanel(props: Props) {
  const {
    t,
    ean,
    price,
    productName,
    imagesText,
    imageFiles = [],
    fieldErrors,
    allowFileUpload = false,
    onEanChange,
    onPriceChange,
    onProductNameChange,
    onImagesTextChange,
    onImageFilesChange,
  } = props;

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2">
        <FormField label={t.ean} error={fieldErrors.ean}>
          <Input
            value={ean}
            onChange={(event) => onEanChange(event.target.value)}
            placeholder={`${t.enter} ${t.ean}`}
          />
        </FormField>
        <FormField label={t.price} error={fieldErrors.price}>
          <Input
            value={price}
            onChange={(event) => onPriceChange(event.target.value)}
            placeholder={`${t.enter} ${t.price.toLowerCase()}`}
          />
        </FormField>
        <FormField label={t.productName} error={fieldErrors.productName} className="md:col-span-2">
          <Input
            value={productName}
            onChange={(event) => onProductNameChange(event.target.value)}
            placeholder={`${t.enter} ${t.productName.toLowerCase()}`}
          />
        </FormField>
        <FormField label={t.images} className="md:col-span-2">
          <Textarea
            value={imagesText}
            onChange={(event) => onImagesTextChange(event.target.value)}
            placeholder={`${t.oneUrlPerLine}\nhttps://example.com/image1.jpg\nhttps://example.com/image2.jpg`}
            className="min-h-[120px]"
          />
        </FormField>
        {allowFileUpload ? (
          <FormField label={t.createProductImageFiles} className="md:col-span-2">
            <Input
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => onImageFilesChange?.(Array.from(event.target.files ?? []))}
            />
            {imageFiles.length > 0 ? (
              <div className="mt-2 text-xs text-muted-foreground">
                {t.createProductSelectedImageFiles
                  .replace("{count}", String(imageFiles.length))
                  .replace("{files}", imageFiles.map((file) => file.name).join(", "))}
              </div>
            ) : (
              <div className="mt-2 text-xs text-muted-foreground">
                {t.createProductNoLocalImageFiles}
              </div>
            )}
          </FormField>
        ) : null}
      </div>
    </>
  );
}

export function HoodCreateFieldsPanel(props: {
  fields: HoodCreateFields;
  fieldErrors: Partial<Record<HoodCreateFieldKey, string>>;
  onFieldsChange: (fields: HoodCreateFields) => void;
}) {
  const t = useLabels();
  const { fields, fieldErrors, onFieldsChange } = props;
  const updateField = <Key extends HoodCreateFieldKey>(key: Key, value: HoodCreateFields[Key]) => {
    onFieldsChange({ ...fields, [key]: value });
  };

  return (
    <section className="mt-4 space-y-3 rounded-[var(--radius-control)] border border-border/70 bg-muted/20 p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <FormField label={t.quantity} error={fieldErrors.quantity}>
          <Input type="number" min="1" step="1" value={fields.quantity} onChange={(event) => updateField("quantity", event.target.value)} />
        </FormField>
        <FormField label={t.condition}>
          <Input value={fields.condition} onChange={(event) => updateField("condition", event.target.value)} placeholder="new" />
        </FormField>
        <FormField label={t.itemNumber}>
          <Input value={fields.itemNumber} onChange={(event) => updateField("itemNumber", event.target.value)} placeholder={t.createProductDefaultsToEan} />
        </FormField>
        <FormField label={t.descriptionLabel} error={fieldErrors.description} className="md:col-span-2">
          <Textarea value={fields.description} onChange={(event) => updateField("description", event.target.value)} className="min-h-[140px]" />
        </FormField>
      </div>
    </section>
  );
}

export function MainMarketplaceCreateFieldsPanel(props: {
  hoodFields: HoodCreateFields;
  hoodFieldErrors: Partial<Record<HoodCreateFieldKey, string>>;
  onHoodFieldsChange: (fields: HoodCreateFields) => void;
  kauflandFields: MainKauflandCreateFields;
  kauflandFieldErrors: Partial<Record<MainKauflandCreateFieldKey, string>>;
  onKauflandFieldsChange: (fields: MainKauflandCreateFields) => void;
  xljvFields: MainXljvCreateFields;
  xljvFieldErrors: Partial<Record<MainXljvCreateFieldKey, string>>;
  onXljvFieldsChange: (fields: MainXljvCreateFields) => void;
}) {
  const t = useLabels();
  const {
    hoodFields,
    hoodFieldErrors,
    onHoodFieldsChange,
    kauflandFields,
    kauflandFieldErrors,
    onKauflandFieldsChange,
    xljvFields,
    xljvFieldErrors,
    onXljvFieldsChange,
  } = props;
  const updateHoodField = <Key extends HoodCreateFieldKey>(key: Key, value: HoodCreateFields[Key]) => {
    onHoodFieldsChange({ ...hoodFields, [key]: value });
  };
  const updateKauflandField = <Key extends MainKauflandCreateFieldKey>(key: Key, value: MainKauflandCreateFields[Key]) => {
    onKauflandFieldsChange({ ...kauflandFields, [key]: value });
  };
  const updateXljvField = <Key extends MainXljvCreateFieldKey>(key: Key, value: MainXljvCreateFields[Key]) => {
    onXljvFieldsChange({ ...xljvFields, [key]: value });
  };

  return (
    <section className="mt-4 space-y-5 rounded-[var(--radius-control)] border border-border/70 bg-muted/20 p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <FormField label={t.descriptionLabel} error={hoodFieldErrors.description} className="md:col-span-2">
          <Textarea value={hoodFields.description} onChange={(event) => updateHoodField("description", event.target.value)} className="min-h-[140px]" />
        </FormField>
        <FormField label={t.quantity} error={hoodFieldErrors.quantity}>
          <Input type="number" min="1" step="1" value={hoodFields.quantity} onChange={(event) => updateHoodField("quantity", event.target.value)} />
        </FormField>
        <FormField label={t.offerId} help={t.createProductDefaultsToEanHint}>
          <Input value={kauflandFields.idOffer} onChange={(event) => updateKauflandField("idOffer", event.target.value)} placeholder={t.createProductDefaultsToEan} />
        </FormField>
      </div>

      <div className="space-y-3 border-t border-border/70 pt-4">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.createProductJvXlSection}</div>
        <div className="grid gap-3 md:grid-cols-2">
          <FormField label={t.articleNumber}><Input value={xljvFields.artikelnr} onChange={(event) => updateXljvField("artikelnr", event.target.value)} placeholder={t.createProductDefaultsToEan} /></FormField>
          <FormField label="SKU"><Input value={xljvFields.sourceSku} onChange={(event) => updateXljvField("sourceSku", event.target.value)} /></FormField>
          <FormField label="EAN"><Input value={xljvFields.sourceEanField} onChange={(event) => updateXljvField("sourceEanField", event.target.value)} placeholder={t.createProductDefaultsToEan} /></FormField>
          <FormField label={t.dateAvailable} error={xljvFieldErrors.dateAvailable}><Input type="date" value={xljvFields.dateAvailable} onChange={(event) => updateXljvField("dateAvailable", event.target.value)} /></FormField>
          <FormField label={t.stores} error={xljvFieldErrors.storeIds}><Input value={xljvFields.storeIds} onChange={(event) => updateXljvField("storeIds", event.target.value)} placeholder="0" /></FormField>
          <FormField label={t.manufacturerId} error={xljvFieldErrors.manufacturerId}><Input type="number" min="0" value={xljvFields.manufacturerId} onChange={(event) => updateXljvField("manufacturerId", event.target.value)} /></FormField>
          <FormField label={t.stockStatusId} error={xljvFieldErrors.stockStatusId}><Input type="number" min="0" value={xljvFields.stockStatusId} onChange={(event) => updateXljvField("stockStatusId", event.target.value)} /></FormField>
          <FormField label={t.taxClassId} error={xljvFieldErrors.taxClassId}><Input type="number" min="0" value={xljvFields.taxClassId} onChange={(event) => updateXljvField("taxClassId", event.target.value)} /></FormField>
          <FormField label={t.xljvUrlKey} className="md:col-span-2"><Input value={xljvFields.jvUrlKey} onChange={(event) => updateXljvField("jvUrlKey", event.target.value)} /></FormField>
        </div>
      </div>

      <div className="space-y-3 border-t border-border/70 pt-4">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.createProductKauflandAttributes}</div>
        <div className="grid gap-3 md:grid-cols-2">
          <FormField label={t.size} error={kauflandFieldErrors.size}><Input value={kauflandFields.size} onChange={(event) => updateKauflandField("size", event.target.value)} /></FormField>
          <FormField label={t.color} error={kauflandFieldErrors.color}><Input value={kauflandFields.color} onChange={(event) => updateKauflandField("color", event.target.value)} /></FormField>
          <FormField label={t.material} error={kauflandFieldErrors.material}><Input value={kauflandFields.material} onChange={(event) => updateKauflandField("material", event.target.value)} /></FormField>
          <FormField label={t.createProductDeliveryId} error={kauflandFieldErrors.delivery}><Input type="number" min="0" value={kauflandFields.delivery} onChange={(event) => updateKauflandField("delivery", event.target.value)} /></FormField>
          <FormField label={t.height} error={kauflandFieldErrors.height}><Input type="number" step="0.01" value={kauflandFields.height} onChange={(event) => updateKauflandField("height", event.target.value)} /></FormField>
          <FormField label={t.length} error={kauflandFieldErrors.length}><Input type="number" step="0.01" value={kauflandFields.length} onChange={(event) => updateKauflandField("length", event.target.value)} /></FormField>
          <FormField label={t.width} error={kauflandFieldErrors.width}><Input type="number" step="0.01" value={kauflandFields.width} onChange={(event) => updateKauflandField("width", event.target.value)} /></FormField>
          <FormField label={t.createProductAmount} error={kauflandFieldErrors.amount}><Input type="number" min="1" value={kauflandFields.amount} onChange={(event) => updateKauflandField("amount", event.target.value)} /></FormField>
          <FormField label={t.createProductStorefronts} error={kauflandFieldErrors.storefronts} className="md:col-span-2"><Input value={kauflandFields.storefronts} onChange={(event) => updateKauflandField("storefronts", event.target.value)} /></FormField>
        </div>
      </div>

      <div className="space-y-3 border-t border-border/70 pt-4">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">HOOD</div>
        <div className="grid gap-3 md:grid-cols-2">
          <FormField label={t.condition}><Input value={hoodFields.condition} onChange={(event) => updateHoodField("condition", event.target.value)} placeholder="new" /></FormField>
          <FormField label={t.itemNumber}><Input value={hoodFields.itemNumber} onChange={(event) => updateHoodField("itemNumber", event.target.value)} placeholder={t.createProductDefaultsToEan} /></FormField>
        </div>
      </div>
    </section>
  );
}
