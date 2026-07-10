"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { type labels } from "@/app/i18n";
import { useLabels } from "@/app/use-labels";
import { Button, buttonVariants } from "./button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "./card";
import { cn } from "@/lib/utils";

type LabelKey = keyof (typeof labels)["en"];

type RouteErrorStateProps = {
  title?: string;
  titleKey?: LabelKey;
  description?: string;
  descriptionKey?: LabelKey;
  reset: () => void;
  homeHref?: string;
  className?: string;
};

export function RouteErrorState({
  title,
  titleKey,
  description,
  descriptionKey,
  reset,
  homeHref = "/dashboard",
  className
}: RouteErrorStateProps) {
  const t = useLabels();
  const resolvedTitle = titleKey ? t[titleKey] : (title ?? t.somethingWentWrong);
  const resolvedDescription = descriptionKey ? t[descriptionKey] : (description ?? t.tryAgain);

  return (
    <main className={cn("flex min-h-[60vh] items-center justify-center p-4", className)}>
      <Card className="w-full max-w-xl border-border bg-card text-card-foreground shadow-sm">
        <CardHeader className="space-y-2">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <CardTitle>{resolvedTitle}</CardTitle>
          <CardDescription className="text-muted-foreground">{resolvedDescription}</CardDescription>
        </CardHeader>
        <CardContent />
        <CardFooter className="flex flex-wrap gap-2">
          <Button type="button" onClick={reset}>
            {t.tryAgain}
          </Button>
          <Link href={homeHref} className={buttonVariants({ variant: "outline" })}>
            {t.backToDashboard}
          </Link>
        </CardFooter>
      </Card>
    </main>
  );
}


