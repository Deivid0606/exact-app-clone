
-- Drop the current permissive SELECT policy for all authenticated
DROP POLICY IF EXISTS "Authenticated can view products" ON public.products;

-- ADMIN: can see all products (already covered by "Admins can manage products" ALL policy)

-- PROVEEDOR: only sees own products
CREATE POLICY "Providers can view own products"
ON public.products FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'PROVEEDOR'::app_role)
  AND provider_email = (SELECT email FROM public.profiles WHERE user_id = auth.uid() LIMIT 1)
);

-- VENDEDOR / DESPACHANTE / DELIVERY: see all non-private products + private products where their email is in private_to_emails
CREATE POLICY "Non-providers can view products"
ON public.products FOR SELECT
TO authenticated
USING (
  NOT has_role(auth.uid(), 'PROVEEDOR'::app_role)
  AND (
    is_private IS NOT TRUE
    OR private_to_emails ILIKE '%' || (SELECT email FROM public.profiles WHERE user_id = auth.uid() LIMIT 1) || '%'
  )
);
