import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/app/AppShell";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ComponentBuilder } from "@/modules/payroll/components/ComponentBuilder";
import { TemplateEditor } from "@/modules/payroll/components/TemplateEditor";

export const Route = createFileRoute("/_app/payroll/template")({ component: PayslipDesignPage });

const appRouteApi = getRouteApi("/_app");

function PayslipDesignPage() {
  const { auth } = appRouteApi.useRouteContext();
  const role = auth.profile?.role ?? "employee";
  const companyId = auth.profile?.company_id ?? null;
  const canManage = role === "employer" || role === "hr";

  return (
    <>
      <PageHeader
        badge="Paie"
        title="Bulletin de paie"
        description="Composez la mise en page de vos bulletins et les rubriques de paie avec leurs règles."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/payroll">
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Retour à la paie
            </Link>
          </Button>
        }
      />
      {!canManage || !companyId ? (
        <p className="text-sm text-muted-foreground">Réservé à l’employeur et aux RH.</p>
      ) : (
        <Tabs defaultValue="layout">
          <TabsList>
            <TabsTrigger value="layout">Mise en page</TabsTrigger>
            <TabsTrigger value="rubrics">Rubriques et règles</TabsTrigger>
          </TabsList>
          <TabsContent value="layout" className="mt-4">
            <TemplateEditor companyId={companyId} />
          </TabsContent>
          <TabsContent value="rubrics" className="mt-4">
            <ComponentBuilder companyId={companyId} />
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}
