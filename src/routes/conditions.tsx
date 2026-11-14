import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/conditions")({
  head: () => ({
    meta: [
      { title: "Conditions générales d’utilisation — Mshahara" },
      { name: "description", content: "Conditions d’utilisation de la plateforme Mshahara et de son application mobile." },
    ],
  }),
  component: TermsPage,
});

const SECTIONS: Array<[string, string[]]> = [
  [
    "1. Objet",
    [
      "Les présentes conditions encadrent l’utilisation de Mshahara, plateforme en ligne de gestion des ressources humaines, de la paie et du pointage, et de son application mobile pour les employés.",
      "Créer un compte ou utiliser le service vaut acceptation de ces conditions.",
    ],
  ],
  [
    "2. Comptes",
    [
      "L’entreprise cliente (l’« employeur ») crée son compte, puis les comptes de ses employés. Chaque utilisateur garde ses identifiants confidentiels et signale sans délai toute utilisation non autorisée.",
      "L’employeur est responsable des informations qu’il saisit (salaires, contrats, données des employés) et des accès qu’il accorde.",
    ],
  ],
  [
    "3. Abonnement et paiement",
    [
      "L’accès est payant, par période d’un mois, selon la formule et les prix affichés au moment de la génération du code de paiement. Le montant dépend du nombre d’employés couverts.",
      "Le paiement se fait par M’Vola ou Poketra avec le code fourni. L’accès est activé après vérification du paiement. Le changement de formule se fait au renouvellement.",
      "Sans renouvellement, l’accès est suspendu à la fin de la période. Les données sont conservées et redeviennent accessibles après paiement.",
    ],
  ],
  [
    "4. Calculs de paie",
    [
      "Mshahara calcule les bulletins à partir des paramètres et des données saisis par l’employeur. L’employeur vérifie chaque bulletin avant de le valider et reste seul responsable des salaires versés et de ses obligations sociales et fiscales.",
    ],
  ],
  [
    "5. Pointage",
    [
      "Le pointage mobile utilise la position du téléphone au moment du pointage et, le cas échéant, un QR code affiché sur le site. L’employeur informe ses employés de ce dispositif.",
    ],
  ],
  [
    "6. Utilisation acceptable",
    [
      "Il est interdit de contourner les contrôles du service (position, QR code, appareils autorisés), d’accéder aux données d’une autre entreprise ou de perturber le fonctionnement de la plateforme. Un tel usage peut entraîner la suspension du compte.",
    ],
  ],
  [
    "7. Données personnelles",
    [
      "Le traitement des données est décrit dans la politique de confidentialité, accessible à l’adresse /confidentialite.",
    ],
  ],
  [
    "8. Disponibilité et responsabilité",
    [
      "Mshahara met en œuvre des moyens raisonnables pour assurer la disponibilité et la sécurité du service, sans pouvoir garantir une disponibilité continue. Des interruptions peuvent avoir lieu, notamment pour maintenance.",
    ],
  ],
  [
    "9. Modification des conditions",
    [
      "Ces conditions peuvent évoluer. La version en vigueur est celle publiée sur cette page.",
    ],
  ],
  [
    "10. Contact",
    ["Pour toute question : contact@mshahara.online."],
  ],
];

function TermsPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-10 text-sm leading-relaxed">
      <h1 className="font-display text-3xl font-bold text-primary">Conditions générales d’utilisation</h1>
      {SECTIONS.map(([title, paragraphs]) => (
        <section key={title} className="space-y-2">
          <h2 className="font-display text-xl font-semibold text-primary">{title}</h2>
          {paragraphs.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </section>
      ))}
    </main>
  );
}
