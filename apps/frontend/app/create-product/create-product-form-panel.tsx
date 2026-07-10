import { Button } from "../../components/ui/button";
import { FormField } from "../../components/ui/form-field";
import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";
import type { CreateProductFieldKey } from "./create-product-model";

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
