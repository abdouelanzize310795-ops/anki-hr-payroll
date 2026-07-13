-- Allow employers/hr/platform admins to hard-delete hr_documents rows
-- (needed for upload abort cleanup)

CREATE POLICY hr_documents_delete ON public.hr_documents
  FOR DELETE
  TO authenticated
  USING (
    public.can_manage_company(company_id)
    OR public.is_platform_admin()
  );
