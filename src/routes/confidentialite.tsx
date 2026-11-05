import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/confidentialite")({
  head: () => ({ meta: [{ title: "Politique de confidentialité — Mshahara" }] }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-10 text-sm leading-relaxed">
      <h1 className="font-display text-3xl font-bold text-primary">Politique de confidentialité</h1>
      <p>
        Mshahara est une plateforme de ressources humaines, de paie et de pointage. Son application
        mobile est réservée aux employés dont l’entreprise utilise Mshahara. Les comptes sont créés
        par l’employeur.
      </p>
      <h2 className="font-display text-xl font-semibold text-primary">Données traitées</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Identité et contact : nom, e-mail, téléphone, poste, matricule.</li>
        <li>Travail : contrat, présences, congés, tâches et documents RH.</li>
        <li>Paie : salaire, bulletins de paie et coordonnées bancaires renseignées par l’employeur.</li>
        <li>
          Position précise : relevée uniquement au moment du pointage, pour vérifier la présence sur
          le site. L’application ne suit pas la position en arrière-plan.
        </li>
        <li>Identifiant de l’appareil : pour contrôler les téléphones autorisés à pointer.</li>
      </ul>
      <h2 className="font-display text-xl font-semibold text-primary">Caméra</h2>
      <p>La caméra sert uniquement à scanner le QR code de pointage. Aucune image n’est enregistrée.</p>
      <h2 className="font-display text-xl font-semibold text-primary">Utilisation et partage</h2>
      <p>
        Ces données servent à gérer le pointage, les congés et la paie. Elles sont accessibles à
        l’employeur et aux personnes habilitées de l’entreprise. Elles ne sont ni vendues ni utilisées
        pour de la publicité, et sont chiffrées pendant leur transport (HTTPS).
      </p>
      <h2 className="font-display text-xl font-semibold text-primary">Vos droits</h2>
      <p>
        Pour accéder à vos données, les corriger ou demander leur suppression, adressez-vous à votre
        service RH ou écrivez à{" "}
        <a className="underline" href="mailto:contact@mshahara.online">contact@mshahara.online</a>. Voir
        aussi la page <a className="underline" href="/suppression-compte">suppression de compte</a>.
      </p>
    </main>
  );
}
