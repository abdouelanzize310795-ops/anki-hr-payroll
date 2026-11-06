import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/suppression-compte")({
  head: () => ({ meta: [{ title: "Suppression de compte — Mshahara" }] }),
  component: DeleteAccountPage,
});

function DeleteAccountPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-4 px-4 py-10 text-sm leading-relaxed">
      <h1 className="font-display text-3xl font-bold text-primary">Supprimer votre compte Mshahara</h1>
      <p>Pour demander la suppression de votre compte et des données associées :</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>
          Écrivez à <a className="underline" href="mailto:contact@mshahara.online">contact@mshahara.online</a>{" "}
          depuis l’adresse e-mail de votre compte, ou adressez-vous à votre service RH.
        </li>
        <li>Indiquez votre nom, votre entreprise et l’objet « Suppression de compte ».</li>
      </ol>
      <p>
        Le compte de connexion et les données personnelles sont alors supprimés. Les documents que
        l’employeur doit conserver au titre de ses obligations légales, comme les bulletins de paie,
        peuvent être gardés pendant la durée imposée par la loi.
      </p>
    </main>
  );
}
