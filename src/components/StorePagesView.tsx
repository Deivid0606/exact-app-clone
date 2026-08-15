import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import WebPageBuilder, {
  type BuilderProduct,
} from "@/components/WebPageBuilder";
import { toast } from "sonner";

export default function StorePagesView() {
  const { user } = useAuth();
  const email = user?.email?.toLowerCase() || "";

  const [products, setProducts] = useState<BuilderProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProducts = useCallback(async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("products")
      .select(
        "id,title,sku,suggested_price_gs,provider_price_gs,image_url,image_url_2,image_url_3,description,warranty_info,warehouse_city",
      )
      .order("title", { ascending: true });

    setLoading(false);

    if (error) {
      console.error(error);
      toast.error("No se pudieron cargar los productos para crear páginas.");
      return;
    }

    setProducts((data || []) as BuilderProduct[]);
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  if (!email) {
    return (
      <div className="rounded-2xl border border-border p-8 text-center text-muted-foreground">
        No se pudo identificar el correo del vendedor.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-border p-10 text-center">
        Cargando productos y páginas...
      </div>
    );
  }

  return (
    <div>
      <WebPageBuilder products={products} userEmail={email} />
    </div>
  );
}
