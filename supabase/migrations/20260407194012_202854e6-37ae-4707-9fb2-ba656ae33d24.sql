CREATE POLICY "Providers can insert rendiciones"
ON public.rendiciones_pagadas
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'PROVEEDOR'::app_role)
);