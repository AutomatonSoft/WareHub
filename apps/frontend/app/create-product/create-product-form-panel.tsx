import { Button } from "../../components/ui/button";
import { FormField } from "../../components/ui/form-field";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import {
  HOOD_CREATE_CATEGORY_ID,
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
  submitting: boolean;
  allowFileUpload?: boolean;
  onEanChange: (value: string) => void;
  onPriceChange: (value: string) => void;
  onProductNameChange: (value: string) => void;
  onImagesTextChange: (value: string) => void;
  onImageFilesChange?: (files: File[]) => void;
  onSubmit: () => void;
  onReset: () => void;
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
    submitting,
    allowFileUpload = false,
    onEanChange,
    onPriceChange,
    onProductNameChange,
    onImagesTextChange,
    onImageFilesChange,
    onSubmit,
    onReset
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
          <FormField label="Image files" className="md:col-span-2">
            <Input
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => onImageFilesChange?.(Array.from(event.target.files ?? []))}
            />
            {imageFiles.length > 0 ? (
              <div className="mt-2 text-xs text-muted-foreground">
                {imageFiles.length} file(s): {imageFiles.map((file) => file.name).join(", ")}
              </div>
            ) : (
              <div className="mt-2 text-xs text-muted-foreground">
                No local image files selected.
              </div>
            )}
          </FormField>
        ) : null}
      </div>
      <div className="wh-secondary-toolbar mt-4 flex flex-wrap gap-2">
        <Button className="min-w-[170px]" onClick={onSubmit} disabled={submitting}>
          {t.createProduct}
        </Button>
        <Button className="min-w-[170px]" variant="secondary" onClick={onReset}>
          {t.resetFields}
        </Button>
      </div>
    </>
  );
}

export function HoodCreateFieldsPanel(props: {
  fields: HoodCreateFields;
  fieldErrors: Partial<Record<HoodCreateFieldKey, string>>;
  onFieldsChange: (fields: HoodCreateFields) => void;
}) {
  const { fields, fieldErrors, onFieldsChange } = props;
  const updateField = <Key extends HoodCreateFieldKey>(key: Key, value: HoodCreateFields[Key]) => {
    onFieldsChange({ ...fields, [key]: value });
  };

  return (
    <section className="mt-4 space-y-3 rounded-[var(--radius-control)] border border-border/70 bg-muted/20 p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Hood listing details</h2>
        <p className="mt-1 text-xs text-muted-foreground">Required marketplace fields sent only when publishing to Hood.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <FormField label="Hood category ID" help="Fixed for every new Hood listing.">
          <Input value={HOOD_CREATE_CATEGORY_ID} readOnly aria-readonly="true" />
        </FormField>
        <FormField label="Quantity" error={fieldErrors.quantity}>
          <Input type="number" min="1" step="1" value={fields.quantity} onChange={(event) => updateField("quantity", event.target.value)} />
        </FormField>
        <FormField label="Condition">
          <Input value={fields.condition} onChange={(event) => updateField("condition", event.target.value)} placeholder="new" />
        </FormField>
        <FormField label="Item mode">
          <Input value={fields.itemMode} onChange={(event) => updateField("itemMode", event.target.value)} placeholder="shopProduct" />
        </FormField>
        <FormField label="Item number" help="Defaults to EAN when left empty.">
          <Input value={fields.itemNumber} onChange={(event) => updateField("itemNumber", event.target.value)} placeholder="Defaults to EAN" />
        </FormField>
        <FormField label="Description" error={fieldErrors.description} className="md:col-span-2">
          <Textarea value={fields.description} onChange={(event) => updateField("description", event.target.value)} className="min-h-[140px]" />
        </FormField>
        <FormField
          label="Product properties (JSON)"
          help={'Example: [{"name":"Material","value":"Wood"}]'}
          error={fieldErrors.productPropertiesText}
          className="md:col-span-2"
        >
          <Textarea value={fields.productPropertiesText} onChange={(event) => updateField("productPropertiesText", event.target.value)} className="min-h-[120px] font-mono text-xs" />
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
      <div>
        <h2 className="text-sm font-semibold text-foreground">Marketplace listing details</h2>
        <p className="mt-1 text-xs text-muted-foreground">One shared product description is sent to HOOD and Kaufland. Marketplace-only fields are grouped below.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <FormField label="Description" error={hoodFieldErrors.description} className="md:col-span-2">
          <Textarea value={hoodFields.description} onChange={(event) => updateHoodField("description", event.target.value)} className="min-h-[140px]" />
        </FormField>
        <FormField label="Quantity" error={hoodFieldErrors.quantity}>
          <Input type="number" min="1" step="1" value={hoodFields.quantity} onChange={(event) => updateHoodField("quantity", event.target.value)} />
        </FormField>
        <FormField label="Offer ID" help="Defaults to EAN when left empty.">
          <Input value={kauflandFields.idOffer} onChange={(event) => updateKauflandField("idOffer", event.target.value)} placeholder="Defaults to EAN" />
        </FormField>
      </div>

      <div className="space-y-3 border-t border-border/70 pt-4">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">JV and XL source details</div>
        <div className="grid gap-3 md:grid-cols-2">
          <FormField label="Artikel-Nr." help="Defaults to EAN when left empty."><Input value={xljvFields.artikelnr} onChange={(event) => updateXljvField("artikelnr", event.target.value)} placeholder="Defaults to EAN" /></FormField>
          <FormField label="Source SKU"><Input value={xljvFields.sourceSku} onChange={(event) => updateXljvField("sourceSku", event.target.value)} /></FormField>
          <FormField label="Source EAN field" help="Defaults to EAN when left empty."><Input value={xljvFields.sourceEanField} onChange={(event) => updateXljvField("sourceEanField", event.target.value)} placeholder="Defaults to EAN" /></FormField>
          <FormField label="Date available" error={xljvFieldErrors.dateAvailable}><Input type="date" value={xljvFields.dateAvailable} onChange={(event) => updateXljvField("dateAvailable", event.target.value)} /></FormField>
          <FormField label="Store IDs" error={xljvFieldErrors.storeIds} help="Comma-separated."><Input value={xljvFields.storeIds} onChange={(event) => updateXljvField("storeIds", event.target.value)} placeholder="0" /></FormField>
          <FormField label="Manufacturer ID" error={xljvFieldErrors.manufacturerId}><Input type="number" min="0" value={xljvFields.manufacturerId} onChange={(event) => updateXljvField("manufacturerId", event.target.value)} /></FormField>
          <FormField label="Stock status ID" error={xljvFieldErrors.stockStatusId}><Input type="number" min="0" value={xljvFields.stockStatusId} onChange={(event) => updateXljvField("stockStatusId", event.target.value)} /></FormField>
          <FormField label="Tax class ID" error={xljvFieldErrors.taxClassId}><Input type="number" min="0" value={xljvFields.taxClassId} onChange={(event) => updateXljvField("taxClassId", event.target.value)} /></FormField>
          <FormField label="JV URL key" className="md:col-span-2"><Input value={xljvFields.jvUrlKey} onChange={(event) => updateXljvField("jvUrlKey", event.target.value)} /></FormField>
        </div>
      </div>

      <div className="space-y-3 border-t border-border/70 pt-4">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Kaufland attributes</div>
        <div className="grid gap-3 md:grid-cols-2">
          <FormField label="Size" error={kauflandFieldErrors.size}><Input value={kauflandFields.size} onChange={(event) => updateKauflandField("size", event.target.value)} /></FormField>
          <FormField label="Color" error={kauflandFieldErrors.color}><Input value={kauflandFields.color} onChange={(event) => updateKauflandField("color", event.target.value)} /></FormField>
          <FormField label="Material" error={kauflandFieldErrors.material}><Input value={kauflandFields.material} onChange={(event) => updateKauflandField("material", event.target.value)} /></FormField>
          <FormField label="Delivery ID" error={kauflandFieldErrors.delivery}><Input type="number" min="0" value={kauflandFields.delivery} onChange={(event) => updateKauflandField("delivery", event.target.value)} /></FormField>
          <FormField label="Height" error={kauflandFieldErrors.height}><Input type="number" step="0.01" value={kauflandFields.height} onChange={(event) => updateKauflandField("height", event.target.value)} /></FormField>
          <FormField label="Length" error={kauflandFieldErrors.length}><Input type="number" step="0.01" value={kauflandFields.length} onChange={(event) => updateKauflandField("length", event.target.value)} /></FormField>
          <FormField label="Width" error={kauflandFieldErrors.width}><Input type="number" step="0.01" value={kauflandFields.width} onChange={(event) => updateKauflandField("width", event.target.value)} /></FormField>
          <FormField label="Amount" error={kauflandFieldErrors.amount}><Input type="number" min="1" value={kauflandFields.amount} onChange={(event) => updateKauflandField("amount", event.target.value)} /></FormField>
          <FormField label="Storefronts" error={kauflandFieldErrors.storefronts} className="md:col-span-2"><Input value={kauflandFields.storefronts} onChange={(event) => updateKauflandField("storefronts", event.target.value)} /></FormField>
        </div>
      </div>

      <div className="space-y-3 border-t border-border/70 pt-4">
        <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">HOOD attributes</div>
        <div className="grid gap-3 md:grid-cols-2">
          <FormField label="Hood category ID" help="Fixed for every new Hood listing."><Input value={HOOD_CREATE_CATEGORY_ID} readOnly aria-readonly="true" /></FormField>
          <FormField label="Condition"><Input value={hoodFields.condition} onChange={(event) => updateHoodField("condition", event.target.value)} placeholder="new" /></FormField>
          <FormField label="Item mode"><Input value={hoodFields.itemMode} onChange={(event) => updateHoodField("itemMode", event.target.value)} placeholder="shopProduct" /></FormField>
          <FormField label="Item number" help="Defaults to EAN when left empty."><Input value={hoodFields.itemNumber} onChange={(event) => updateHoodField("itemNumber", event.target.value)} placeholder="Defaults to EAN" /></FormField>
          <FormField label="Product properties (JSON)" help={'Example: [{"name":"Material","value":"Wood"}]'} error={hoodFieldErrors.productPropertiesText} className="md:col-span-2">
            <Textarea value={hoodFields.productPropertiesText} onChange={(event) => updateHoodField("productPropertiesText", event.target.value)} className="min-h-[120px] font-mono text-xs" />
          </FormField>
        </div>
      </div>
    </section>
  );
}
