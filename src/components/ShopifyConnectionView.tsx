import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function ShopifyConnectionView() {
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const testConnection = async () => {
    setTesting(true);
    setStatus('idle');
    setErrorMsg('');
    try {
      const { data, error } = await supabase.functions.invoke('shopify-orders', { body: null });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`✅ Conexión exitosa — ${data?.orders?.length || 0} pedidos encontrados`);
      setStatus('ok');
    } catch (err: any) {
      setErrorMsg(err.message || 'Error desconocido');
      setStatus('error');
      toast.error('❌ Error de conexión con Shopify');
    }
    setTesting(false);
  };

  return (
    <div className="app-card">
      <h3 className="text-lg font-extrabold mb-4">🔗 Conexión a Shopify</h3>

      <div className="space-y-4">
        <div className="p-4 rounded-lg border border-border bg-card/50">
          <h4 className="font-bold mb-2">Estado de la conexión</h4>
          <div className="flex items-center gap-3 mb-3">
            <span className={`inline-block w-3 h-3 rounded-full ${
              status === 'ok' ? 'bg-green-500' : status === 'error' ? 'bg-red-500' : 'bg-muted-foreground'
            }`} />
            <span className="text-sm">
              {status === 'ok' && 'Conectado correctamente'}
              {status === 'error' && 'Error en la conexión'}
              {status === 'idle' && 'No verificado'}
            </span>
          </div>
          {status === 'error' && errorMsg && (
            <p className="text-xs text-red-400 bg-red-500/10 rounded p-2 mb-3">{errorMsg}</p>
          )}
          <button className="nav-btn active" onClick={testConnection} disabled={testing}>
            {testing ? (
              <span className="flex items-center gap-2"><span className="btn-spinner" /> Probando...</span>
            ) : '🔌 Probar conexión'}
          </button>
        </div>

        <div className="p-4 rounded-lg border border-border bg-card/50">
          <h4 className="font-bold mb-2">Configuración</h4>
          <p className="text-sm text-muted-foreground mb-2">
            Las credenciales de Shopify (token y dominio) están configuradas como secretos del backend.
            Para actualizar las credenciales, contactá al administrador del sistema.
          </p>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
            <li><code>SHOPIFY_ADMIN_TOKEN</code> — Token de acceso de la Admin API</li>
            <li><code>SHOPIFY_STORE_DOMAIN</code> — Dominio de la tienda (ej: tienda.myshopify.com)</li>
          </ul>
        </div>

        <div className="p-4 rounded-lg border border-border bg-card/50">
          <h4 className="font-bold mb-2">¿Cómo funciona?</h4>
          <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
            <li>Los pedidos se obtienen automáticamente desde la API de Shopify</li>
            <li>Los vendedores pueden ver los pedidos en "Pedidos Shopify"</li>
            <li>Al confirmar un pedido, se carga automáticamente en el sistema</li>
            <li>Se detectan duplicados para evitar cargar el mismo pedido dos veces</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
