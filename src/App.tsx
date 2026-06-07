import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import AssignOrdersView from "./components/AssignOrdersView.tsx";
import QRScannerView from "./components/QRScannerView.tsx";
import ProductsView from "./components/ProductsView.tsx"; // ✅ AGREGADO

const queryClient = new QueryClient();

/**
 * Corrige URLs abiertas desde scanners QR externos en Android
 * para que funcionen con HashRouter.
 */
const normalizeExternalQRUrl = () => {
  const { pathname, search, hash } = window.location;

  // Ejemplo:
  // https://midominio.com/asignar-pedidos?id=123
  // ↓
  // https://midominio.com/#/asignar-pedidos?id=123
  if (!hash && pathname.includes("/asignar-pedidos") && search.includes("id=")) {
    window.location.replace(
      `${window.location.origin}/#/asignar-pedidos${search}`
    );
    return;
  }

  // Si el QR apunta a /qr?id=123
  if (!hash && pathname.includes("/qr") && search.includes("id=")) {
    window.location.replace(
      `${window.location.origin}/#/asignar-pedidos${search}`
    );
    return;
  }
};

normalizeExternalQRUrl();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />

        <HashRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/asignar-pedidos" element={<AssignOrdersView />} />
            <Route path="/qr" element={<QRScannerView />} />
            <Route path="/products" element={<ProductsView />} /> {/* ✅ AGREGADO */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </HashRouter>

      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
