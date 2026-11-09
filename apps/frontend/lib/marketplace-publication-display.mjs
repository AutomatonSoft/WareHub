export function getPendingPublicationMarketplaces(results) {
  const labels = { otto: "OTTO", kaufland: "Kaufland" };
  return [...new Set((results ?? []).filter(target => target.status !== "failed" && target.data?.publication_state === "pending")
    .map(target => labels[target.marketplace?.toLowerCase()]).filter(Boolean))];
}

export function publicationSubmissionMessage(marketplaces, language) {
  if (!marketplaces.length) return "";
  const names = marketplaces.join(", ");
  return language === "ru"
    ? `${names}: отправлено на проверку, публикация не подтверждена. Результат — в Sofort list.`
    : language === "de" ? `${names}: zur Prüfung gesendet, Veröffentlichung nicht bestätigt. Status in der Sofort-Liste.`
      : `${names}: submitted for validation, publication not confirmed. Check Sofort list.`;
}
