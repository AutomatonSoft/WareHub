import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Datenschutzerklärung | AEA GmbH & Co. KG",
  description: "Datenschutzhinweise für die WareHub eBay-Integration.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-12 text-slate-900 sm:px-8">
      <article className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-600">WareHub</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Datenschutzerklärung</h1>
        <p className="mt-4 text-base leading-7 text-slate-700">
          Diese Hinweise informieren über die Verarbeitung personenbezogener Daten bei der Nutzung der WareHub
          eBay-Integration.
        </p>

        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-semibold">Verantwortlicher</h2>
          <address className="not-italic leading-7 text-slate-700">
            AEA GmbH &amp; Co. KG<br />
            Am Flugplatz 28<br />
            88483 Burgrieden<br />
            Telefon: <a className="underline underline-offset-4" href="tel:+4973929378440">07392 - 93 78 44 0</a><br />
            E-Mail: <a className="underline underline-offset-4" href="mailto:info@jvmoebel.de">info@jvmoebel.de</a>
          </address>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-semibold">Zwecke der Verarbeitung</h2>
          <p className="leading-7 text-slate-700">
            Soweit eine eBay-Verbindung eingerichtet wird, verarbeitet WareHub die für die OAuth-Autorisierung und
            Verwaltung von eBay-Angeboten erforderlichen Daten. Dazu können eBay-Kontoangaben, technische
            Zugriffstokens sowie Daten der verwalteten Angebote gehören.
          </p>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-semibold">Rechtsgrundlagen</h2>
          <p className="leading-7 text-slate-700">
            Die Verarbeitung erfolgt, soweit erforderlich, zur Vertragserfüllung oder Vertragsanbahnung, aufgrund
            einer Einwilligung sowie zur Wahrung berechtigter Interessen an Sicherheit und Betrieb des Dienstes
            gemäß Art. 6 Abs. 1 DSGVO.
          </p>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="text-xl font-semibold">Ihre Rechte</h2>
          <p className="leading-7 text-slate-700">
            Sie können Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Datenübertragbarkeit und
            Widerspruch verlangen. Für Anfragen verwenden Sie bitte die oben genannte E-Mail-Adresse.
          </p>
        </section>

        <section className="mt-10 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          Diese Seite enthält die für die technische eBay-OAuth-Integration erforderlichen Kontaktinformationen.
          Vor dem Einsatz in Production muss der vollständige Datenschutzhinweis rechtlich geprüft und bei Bedarf
          um die tatsächlichen Hosting-, Cookie-, Aufbewahrungs- und Empfängerdaten ergänzt werden.
        </section>
      </article>
    </main>
  );
}
