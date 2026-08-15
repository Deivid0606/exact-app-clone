import { useState } from "react";
import StorePagesView from "@/components/StorePagesView";
import StoreOrdersView, {
  type StoreOrderPrefill,
} from "@/components/StoreOrdersView";
import StoreRealtimeView from "@/components/StoreRealtimeView";
import StorePixelView from "@/components/StorePixelView";

type StoreTab = "pages" | "orders" | "realtime" | "pixel";

export default function StoreView({
  onLoadOrder,
}: {
  onLoadOrder: (prefill: StoreOrderPrefill) => void;
}) {
  const [tab, setTab] = useState<StoreTab>("pages");

  return (
    <div className="space-y-4">
      <div className="rounded-[28px] border border-border bg-background overflow-hidden">
        <div className="px-5 py-5 border-b border-border bg-secondary/10">
          <div className="text-[11px] uppercase tracking-[0.22em] text-primary font-black">
            Ecommerce del vendedor
          </div>
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3 mt-1">
            <div>
              <h2 className="text-3xl font-black tracking-tight">🛍 Mi Tienda</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Tus páginas, pedidos web, métricas y Pixel de Meta en un solo lugar.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                className={`nav-btn ${tab === "pages" ? "active" : ""}`}
                onClick={() => setTab("pages")}
              >
                📄 Mis páginas
              </button>
              <button
                className={`nav-btn ${tab === "orders" ? "active" : ""}`}
                onClick={() => setTab("orders")}
              >
                📦 Pedidos
              </button>
              <button
                className={`nav-btn ${tab === "realtime" ? "active" : ""}`}
                onClick={() => setTab("realtime")}
              >
                📊 Vista en tiempo real
              </button>
              <button
                className={`nav-btn ${tab === "pixel" ? "active" : ""}`}
                onClick={() => setTab("pixel")}
              >
                🎯 Pixel
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5">
          {tab === "pages" && <StorePagesView />}
          {tab === "orders" && <StoreOrdersView onLoadOrder={onLoadOrder} />}
          {tab === "realtime" && <StoreRealtimeView />}
          {tab === "pixel" && <StorePixelView />}
        </div>
      </div>
    </div>
  );
}
