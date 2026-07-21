"use client";

import { useLabels } from "../../../app/use-labels";
import { Button } from "../../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../ui/card";
import { ErrorState } from "../../ui/error-state";

type Props = {
  profileStatus: string | null;
  onLogin: () => void;
  onRegister: () => void;
};

export function ProfileAuthRequiredCard({ profileStatus, onLogin, onRegister }: Props) {
  const t = useLabels();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.profileAccess}</CardTitle>
        <CardDescription>{t.notAuthenticatedProfile}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <Button onClick={onLogin}>{t.login}</Button>
          <Button variant="secondary" onClick={onRegister}>{t.register}</Button>
        </div>
        {profileStatus ? <div className="mt-4"><ErrorState title={t.profileAccess} description={profileStatus} /></div> : null}
      </CardContent>
    </Card>
  );
}

