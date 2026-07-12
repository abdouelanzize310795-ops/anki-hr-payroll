import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";
import { SectionCard, StatCard, StatusPill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Plus, Search, Filter, Download, UserCheck, UserX, UserCog } from "lucide-react";

export const Route = createFileRoute("/_app/employees")({ component: EmployeesPage });

const employees = [
  { name: "Aisha Bello", role: "Product Manager", dept: "Product", country: "Nigeria", salary: "$4,200", status: "Active" },
  { name: "Kwame Mensah", role: "Senior Developer", dept: "Engineering", country: "Ghana", salary: "$5,800", status: "Active" },
  { name: "Fatou Ndiaye", role: "HR Specialist", dept: "People", country: "Senegal", salary: "$3,100", status: "On Leave" },
  { name: "Thabo Nkosi", role: "Sales Lead", dept: "Sales", country: "South Africa", salary: "$4,600", status: "Active" },
  { name: "Zanele Khumalo", role: "HR Business Partner", dept: "People", country: "South Africa", salary: "$3,900", status: "Active" },
  { name: "Jean-Luc Diop", role: "DevOps Engineer", dept: "Engineering", country: "Senegal", salary: "$5,200", status: "Pending" },
  { name: "Nia Wanjiru", role: "Payroll Analyst", dept: "Finance", country: "Kenya", salary: "$3,400", status: "Active" },
  { name: "Omar Farah", role: "Data Scientist", dept: "Engineering", country: "Egypt", salary: "$5,000", status: "Active" },
];

function EmployeesPage() {
  return (
    <>
      <PageHeader
        badge="People"
        title="Employees"
        description="248 people across 4 countries."
        actions={
          <>
            <Button variant="outline" size="sm"><Download className="mr-1.5 h-4 w-4" />Export</Button>
            <Button size="sm"><Plus className="mr-1.5 h-4 w-4" />Add employee</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Active" value="234" icon={UserCheck} accent="success" />
        <StatCard label="On leave" value="8" icon={UserX} accent="gold" />
        <StatCard label="Onboarding" value="6" icon={UserCog} accent="primary" />
        <StatCard label="Total" value="248" icon={Users} accent="primary" />
      </div>

      <div className="mt-6">
        <SectionCard
          title="Directory"
          action={
            <div className="flex items-center gap-2">
              <div className="relative"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input placeholder="Search people…" className="pl-8 h-9 w-56" /></div>
              <Button variant="outline" size="sm"><Filter className="mr-1.5 h-4 w-4" />Filter</Button>
            </div>
          }
        >
          <Tabs defaultValue="all" className="mb-4">
            <TabsList>
              <TabsTrigger value="all">All 248</TabsTrigger>
              <TabsTrigger value="eng">Engineering</TabsTrigger>
              <TabsTrigger value="sales">Sales</TabsTrigger>
              <TabsTrigger value="people">People</TabsTrigger>
              <TabsTrigger value="finance">Finance</TabsTrigger>
            </TabsList>
          </Tabs>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Salary</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((e) => (
                <TableRow key={e.name}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9"><AvatarFallback className="bg-primary-soft text-primary text-xs">{e.name.split(" ").map(n => n[0]).join("")}</AvatarFallback></Avatar>
                      <div>
                        <div className="font-medium">{e.name}</div>
                        <div className="text-xs text-muted-foreground">{e.role}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{e.dept}</TableCell>
                  <TableCell className="text-muted-foreground">{e.country}</TableCell>
                  <TableCell className="font-medium">{e.salary}</TableCell>
                  <TableCell><StatusPill status={e.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </SectionCard>
      </div>
    </>
  );
}
