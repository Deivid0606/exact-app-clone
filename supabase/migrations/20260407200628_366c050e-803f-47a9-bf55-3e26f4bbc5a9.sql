CREATE POLICY "Providers can view delivery roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'PROVEEDOR'::app_role) AND role = 'DELIVERY'
);