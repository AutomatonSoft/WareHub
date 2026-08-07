"use client";

import { Download, QrCode } from "lucide-react";
import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { MOBILE_APK_DOWNLOAD_PATH } from "../../app/mobile-apk-url";
import { buttonVariants } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function MobileAppDownloadDialog({ open, onOpenChange }: Props) {
  const [downloadPageUrl, setDownloadPageUrl] = useState("");

  useEffect(() => {
    setDownloadPageUrl(new URL(MOBILE_APK_DOWNLOAD_PATH, window.location.origin).toString());
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-5 p-6">
        <DialogHeader>
          <DialogTitle>Download WareHub app</DialogTitle>
          <DialogDescription>
            Download the Android app on this device or scan the QR code with your phone.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-3 rounded-[var(--radius-control)] border bg-muted/30 p-5 text-center">
          {downloadPageUrl ? (
            <QRCodeSVG
              value={downloadPageUrl}
              title="QR code for the WareHub Android app download"
              size={184}
              level="M"
              includeMargin
              className="rounded-md bg-background p-2"
            />
          ) : (
            <div className="flex size-[200px] items-center justify-center rounded-md bg-background text-muted-foreground">
              <QrCode aria-hidden="true" />
            </div>
          )}
          <p className="text-xs text-muted-foreground">Scan to open the download page on your phone.</p>
        </div>

        <DialogFooter>
          <a className={buttonVariants({ className: "w-full sm:w-auto" })} href={MOBILE_APK_DOWNLOAD_PATH}>
            <Download data-icon="inline-start" aria-hidden="true" />
            Download Android app
          </a>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
