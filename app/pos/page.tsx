"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/types";
import {
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  X,
  Maximize,
  Minimize,
  ChefHat,
  Tag,
  Package,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowLeft,
} from "lucide-react";
import Link from "next/link";

// ─── Types ──────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  reference: string;
  code: string | null;
  designation: string;
  tva: number;
  prixVente: number;
  prixVenteHT: number;
  quantiteStock: number;
  imageUrl: string | null;
  categoryId: string;
  category?: { id: string; nom: string };
  stockLocations?: Array<{ homeId: string; quantite: number }>;
}

interface Category {
  id: string;
  nom: string;
}

interface Home {
  id: string;
  nom: string;
}

interface CartItem {
  product: Product;
  quantite: number;
  homeId: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getStockDisponible(product: Product, homeId: string): number {
  if (!homeId) return product.quantiteStock;
  const sl = product.stockLocations?.find((s) => s.homeId === homeId);
  return sl?.quantite ?? 0;
}

function getTotalStockDisponible(product: Product, userRole: string, defaultHomeId: string): number {
  if (userRole === "CHAUFFEUR" && defaultHomeId) {
    return getStockDisponible(product, defaultHomeId);
  }
  return product.quantiteStock;
}

function getBestHomeId(product: Product, userRole: string, defaultHomeId: string): string {
  if (userRole === "CHAUFFEUR" && defaultHomeId) return defaultHomeId;
  // Admin: pick the first homeId that has stock
  const sl = product.stockLocations?.find((s) => s.quantite > 0);
  return sl?.homeId ?? "";
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function POSPage() {
  const { toast } = useToast();

  // ── Data state ──
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [homes, setHomes] = useState<Home[]>([]);
  const [passagerId, setPassagerId] = useState<string>("");
  const [userRole, setUserRole] = useState<string>("ADMIN");
  const [defaultHomeId, setDefaultHomeId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);

  // ── UI state ──
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [successAnim, setSuccessAnim] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  // ── Calculations ──
  const calculerSousTotal = useCallback(
    () => cart.reduce((s, item) => s + item.product.prixVente * item.quantite, 0),
    [cart]
  );

  const totalTTC = useCallback(() => calculerSousTotal(), [calculerSousTotal]);

  const totalHT = useCallback(() => {
    const ttc = totalTTC();
    let htAvant = 0;
    let ttcAvant = 0;
    cart.forEach((item) => {
      const tva = (item.product.tva || 0) / 100;
      const pHT = item.product.prixVente / (1 + tva);
      htAvant += item.quantite * pHT;
      ttcAvant += item.quantite * item.product.prixVente;
    });
    if (ttcAvant === 0) return 0;
    return htAvant * (ttc / ttcAvant);
  }, [cart, totalTTC]);

  const totalTVA = useCallback(() => totalTTC() - totalHT(), [totalTTC, totalHT]);

  // ── Fetch helpers ──
  const fetchOrCreatePassager = async () => {
    try {
      const res = await fetch("/api/clients?limit=2000&includeProspects=true");
      const data = await res.json();
      let passager = (data.data || []).find(
        (c: { nom?: string; id?: string }) => c.nom && c.nom.trim().toLowerCase() === "passager"
      );
      if (!passager || !passager.id) {
        const createRes = await fetch("/api/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nom: "Passager",
            telephone: "00000000",
            cin: "00000000",
          }),
        });
        const createdData = await createRes.json();
        passager = createdData.id ? createdData : createdData.data;
      }
      if (passager?.id) {
        setPassagerId(passager.id);
        return passager.id;
      }
      return null;
    } catch {
      toast({ title: "Erreur", description: "Impossible de préparer le client Passager", variant: "destructive" });
      return null;
    }
  };

  const fetchUserRole = async () => {
    try {
      const res = await fetch("/api/users/me");
      if (res.ok) {
        const data = await res.json();
        setUserRole(data.role || "ADMIN");
        if (data.role === "CHAUFFEUR" && data.chauffeur?.vehicule?.homeId) {
          setDefaultHomeId(data.chauffeur.vehicule.homeId);
        }
      }
    } catch {
      /* fallback to ADMIN */
    }
  };

  const fetchProducts = async () => {
    const res = await fetch("/api/products?limit=1000&includeStock=true");
    const data = await res.json();
    setProducts(data.data || []);
  };

  const fetchCategories = async () => {
    const res = await fetch("/api/categories?limit=100");
    const data = await res.json();
    setCategories(data.data || []);
  };

  const fetchHomes = async () => {
    const res = await fetch("/api/homes?limit=100");
    const data = await res.json();
    setHomes(data.data || []);
  };

  useEffect(() => {
    setIsLoading(true);
    Promise.all([
      fetchOrCreatePassager(),
      fetchUserRole(),
      fetchProducts(),
      fetchCategories(),
      fetchHomes(),
    ]).finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fullscreen ──
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // ── Cart operations ──
  const addToCart = (product: Product) => {
    const homeId = getBestHomeId(product, userRole, defaultHomeId);
    const stockDispo = homeId
      ? getStockDisponible(product, homeId)
      : product.quantiteStock;

    if (stockDispo <= 0) {
      toast({ title: "Stock épuisé", description: `${product.designation} n'est plus disponible`, variant: "destructive" });
      return;
    }

    setCart((prev) => {
      const idx = prev.findIndex((i) => i.product.id === product.id);
      if (idx >= 0) {
        const currentQty = prev[idx].quantite;
        if (currentQty >= stockDispo) {
          toast({ title: "Stock insuffisant", description: `Maximum ${stockDispo} disponible(s)`, variant: "destructive" });
          return prev;
        }
        return prev.map((item, i) =>
          i === idx ? { ...item, quantite: item.quantite + 1 } : item
        );
      }
      return [...prev, { product, quantite: 1, homeId }];
    });
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id !== productId) return item;
          const homeId = item.homeId;
          const stockDispo = homeId
            ? getStockDisponible(item.product, homeId)
            : item.product.quantiteStock;
          const newQty = item.quantite + delta;
          if (newQty > stockDispo) {
            toast({ title: "Stock insuffisant", description: `Maximum ${stockDispo} disponible(s)`, variant: "destructive" });
            return item;
          }
          return { ...item, quantite: Math.max(1, newQty) };
        })
        .filter((item) => item.quantite > 0)
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  };

  const clearCart = () => setCart([]);

  const handlePay = async () => {
    let currentPassagerId = passagerId;
    if (!currentPassagerId) {
      currentPassagerId = (await fetchOrCreatePassager()) || "";
    }
    if (!currentPassagerId) {
      toast({ title: "Erreur", description: "Client Passager non initialisé", variant: "destructive" });
      return;
    }
    if (cart.length === 0) return;

    for (const item of cart) {
      const stockDispo = item.homeId
        ? getStockDisponible(item.product, item.homeId)
        : item.product.quantiteStock;
      if (item.quantite > stockDispo) {
        toast({
          title: "Stock insuffisant",
          description: `${item.product.designation}: demandé ${item.quantite}, disponible ${stockDispo}`,
          variant: "destructive",
        });
        return;
      }
      if (!item.homeId) {
        toast({ title: "Erreur", description: `Aucun emplacement trouvé pour ${item.product.designation}`, variant: "destructive" });
        return;
      }
    }

    const total = totalTTC();

    const requestBody = {
      numero: `POS-${Date.now()}`,
      clientId: currentPassagerId,
      factureId: null,
      statut: "EN_ATTENTE",
      lignes: cart.map((item) => ({
        productId: item.product.id,
        homeId: item.homeId,
        quantite: item.quantite,
        prixVente: item.product.prixVente,
      })),
      montantTotal: total,
      montantHT: totalHT(),
      montantTVA: totalTVA(),
      montantPaye: total,
      montantRestant: 0,
      remise: 0,
      typeRemise: "montant",
      modeReglement: "ESPECE",
      montant: total,
      typeReglement: "ESPECE",
    };

    setIsSubmitting(true);
    try {
      const res = await fetch("/api/bon-livraisons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const result = await res.json();

      if (!res.ok) {
        toast({
          title: "Erreur",
          description: result.error || result.message || "Erreur lors de la vente",
          variant: "destructive",
        });
        return;
      }

      setSuccessAnim(true);
      setTimeout(() => setSuccessAnim(false), 1800);
      clearCart();
      toast({ title: "✅ Vente enregistrée", description: `Total encaissé : ${formatCurrency(total)}` });
      searchRef.current?.focus();
    } catch {
      toast({ title: "Erreur", description: "Connexion impossible", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Filtered products ──
  const filteredProducts = products.filter((p) => {
    const inCategory = selectedCategory === "all" || p.categoryId === selectedCategory;
    const q = searchQuery.toLowerCase();
    const inSearch =
      !q ||
      p.designation.toLowerCase().includes(q) ||
      p.reference.toLowerCase().includes(q) ||
      (p.code ?? "").toLowerCase().includes(q);
    const hasStock = getTotalStockDisponible(p, userRole, defaultHomeId) > 0;
    return inCategory && inSearch;
  });

  const cartTotal = cart.length;

  // ─── Render ───────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="pos-loading">
        <Loader2 className="pos-spinner" />
        <p>Chargement du point de vente…</p>
      </div>
    );
  }

  return (
    <div className="pos-root">
      {/* ── Success overlay ── */}
      {successAnim && (
        <div className="pos-success-overlay">
          <CheckCircle2 size={96} />
          <span>Vente enregistrée !</span>
        </div>
      )}

      {/* ═══════════════════════════════════════════════
          HEADER
      ═══════════════════════════════════════════════ */}
      <header className="pos-header">
        <Link href="/bons-livraison" className="pos-header-back">
          <ArrowLeft size={18} />
          <span>Retour</span>
        </Link>

        <div className="pos-header-title">
          <ChefHat size={22} className="pos-header-icon" />
          <h1>Point de vente</h1>
        </div>

        <div className="pos-header-actions">
          <span className="pos-header-badge">
            <Package size={14} />
            {products.length} articles
          </span>
          <button className="pos-fullscreen-btn" onClick={toggleFullscreen} title="Plein écran">
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════
          MAIN
      ═══════════════════════════════════════════════ */}
      <main className="pos-main">

        {/* ──────────────────────────────────────────────
            LEFT PANEL — Products
        ────────────────────────────────────────────── */}
        <section className="pos-panel-left">

          {/* Search bar */}
          <div className="pos-search-bar">
            <Search size={18} className="pos-search-icon" />
            <input
              ref={searchRef}
              type="text"
              placeholder="Rechercher par nom, référence, code…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pos-search-input"
              autoFocus
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery("")} className="pos-search-clear">
                <X size={16} />
              </button>
            )}
          </div>

          {/* Category chips */}
          <div className="pos-categories">
            <button
              className={`pos-chip ${selectedCategory === "all" ? "pos-chip-active" : ""}`}
              onClick={() => setSelectedCategory("all")}
            >
              Tous
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                className={`pos-chip ${selectedCategory === cat.id ? "pos-chip-active" : ""}`}
                onClick={() => setSelectedCategory(cat.id)}
              >
                <Tag size={12} />
                {cat.nom}
              </button>
            ))}
          </div>

          {/* Results count */}
          <div className="pos-results-count">
            <span>{filteredProducts.length} résultat{filteredProducts.length !== 1 ? "s" : ""}</span>
          </div>

          {/* Product grid */}
          {filteredProducts.length === 0 ? (
            <div className="pos-empty-products">
              <AlertCircle size={48} />
              <p>Aucun produit trouvé</p>
            </div>
          ) : (
            <div className="pos-product-grid">
              {filteredProducts.map((product) => {
                const stock = getTotalStockDisponible(product, userRole, defaultHomeId);
                const cartItem = cart.find((i) => i.product.id === product.id);
                const inCart = !!cartItem;
                const outOfStock = stock <= 0;

                return (
                  <button
                    key={product.id}
                    className={`pos-product-card ${outOfStock ? "pos-product-card--out" : ""} ${inCart ? "pos-product-card--in-cart" : ""}`}
                    onClick={() => !outOfStock && addToCart(product)}
                    disabled={outOfStock}
                    title={product.designation}
                  >
                    {/* Image or placeholder */}
                    <div className="pos-product-img">
                      {product.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={product.imageUrl} alt={product.designation} />
                      ) : (
                        <Package size={32} className="pos-product-img-placeholder" />
                      )}
                      {inCart && (
                        <span className="pos-product-qty-badge">{cartItem.quantite}</span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="pos-product-info">
                      <p className="pos-product-name">{product.designation}</p>
                      <p className="pos-product-ref">{product.reference}</p>
                      <div className="pos-product-bottom">
                        <span className="pos-product-price">{formatCurrency(product.prixVente)}</span>
                        <span className={`pos-product-stock ${stock <= 5 ? "pos-product-stock--low" : ""}`}>
                          {outOfStock ? "Épuisé" : `${stock} unité${stock > 1 ? "s" : ""}`}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* ──────────────────────────────────────────────
            RIGHT PANEL — Cart
        ────────────────────────────────────────────── */}
        <section className="pos-panel-right">
          <div className="pos-cart-header">
            <div className="pos-cart-title">
              <ShoppingCart size={20} />
              <span>Panier</span>
              {cartTotal > 0 && <span className="pos-cart-count">{cartTotal}</span>}
            </div>
            {cart.length > 0 && (
              <button className="pos-clear-btn" onClick={clearCart}>
                <Trash2 size={14} />
                Effacer
              </button>
            )}
          </div>

          {/* Cart items */}
          <div className="pos-cart-items">
            {cart.length === 0 ? (
              <div className="pos-cart-empty">
                <ShoppingCart size={52} />
                <p>Le panier est vide</p>
                <span>Cliquez sur un produit pour l'ajouter</span>
              </div>
            ) : (
              cart.map((item) => {
                const stock = item.homeId
                  ? getStockDisponible(item.product, item.homeId)
                  : item.product.quantiteStock;
                return (
                  <div key={item.product.id} className="pos-cart-item">
                    <div className="pos-cart-item-info">
                      <p className="pos-cart-item-name">{item.product.designation}</p>
                      <p className="pos-cart-item-price">{formatCurrency(item.product.prixVente)} / u</p>
                    </div>

                    <div className="pos-cart-item-controls">
                      <button
                        className="pos-qty-btn"
                        onClick={() => updateQuantity(item.product.id, -1)}
                        disabled={item.quantite <= 1}
                      >
                        <Minus size={14} />
                      </button>
                      <span className="pos-qty-value">{item.quantite}</span>
                      <button
                        className="pos-qty-btn"
                        onClick={() => updateQuantity(item.product.id, 1)}
                        disabled={item.quantite >= stock}
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    <div className="pos-cart-item-right">
                      <span className="pos-cart-item-total">
                        {formatCurrency(item.product.prixVente * item.quantite)}
                      </span>
                      <button
                        className="pos-remove-btn"
                        onClick={() => removeFromCart(item.product.id)}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Totals + Pay button */}
          <div className="pos-cart-footer">
            {cart.length > 0 && (
              <div className="pos-totals">
                <div className="pos-totals-row">
                  <span>Sous-total HT</span>
                  <span>{formatCurrency(totalHT())}</span>
                </div>
                <div className="pos-totals-row">
                  <span>TVA</span>
                  <span>{formatCurrency(totalTVA())}</span>
                </div>
                <div className="pos-totals-divider" />
              </div>
            )}

            <div className="pos-total-row">
              <span>Total TTC</span>
              <span className="pos-total-amount">{formatCurrency(totalTTC())}</span>
            </div>

            <button
              className="pos-pay-btn"
              onClick={handlePay}
              disabled={cart.length === 0 || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 size={20} className="pos-btn-spinner" />
                  Traitement…
                </>
              ) : (
                <>
                  <CheckCircle2 size={20} />
                  Payer — {formatCurrency(totalTTC())}
                </>
              )}
            </button>

            <div className="pos-payment-mode">
              <span>💵 Paiement en espèces</span>
            </div>
          </div>
        </section>
      </main>

      {/* ═══════════════════════════════════════════════
          SCOPED STYLES
      ═══════════════════════════════════════════════ */}
      <style>{`
  /* ─── Root & Loading ─────────────────────── */
  .pos-root {
    min-height: 100vh;
    background: #f8fafc;
    color: #0f172a;
    display: flex;
    flex-direction: column;
    font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
    position: relative;
    overflow: hidden;
  }

  .pos-loading {
    min-height: 100vh;
    background: #f8fafc;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    color: #64748b;
    font-size: 15px;
  }

  .pos-spinner {
    width: 40px;
    height: 40px;
    color: #4f46e5;
    animation: spin 1s linear infinite;
  }

  @keyframes spin { to { transform: rotate(360deg); } }

  /* ─── Success overlay ────────────────────── */
  .pos-success-overlay {
    position: fixed;
    inset: 0;
    background: rgba(16, 185, 129, 0.12);
    backdrop-filter: blur(6px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    gap: 16px;
    color: #059669;
    font-size: 24px;
    font-weight: 700;
    animation: fadeInOut 1.8s ease forwards;
  }

  @keyframes fadeInOut {
    0%   { opacity: 0; transform: scale(0.9); }
    20%  { opacity: 1; transform: scale(1); }
    80%  { opacity: 1; }
    100% { opacity: 0; }
  }

  /* ─── Header ─────────────────────────────── */
  .pos-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    height: 58px;
    background: #ffffff;
    border-bottom: 1px solid #e2e8f0;
    flex-shrink: 0;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.05);
  }

  .pos-header-back {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #64748b;
    font-size: 13px;
    text-decoration: none;
    transition: color 0.2s;
    padding: 6px 10px;
    border-radius: 8px;
  }
  .pos-header-back:hover { color: #0f172a; background: #f1f5f9; }

  .pos-header-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.3px;
    background: linear-gradient(135deg, #4f46e5, #7c3aed, #0891b2);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  .pos-header-icon { color: #4f46e5; }

  .pos-header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .pos-header-badge {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: #64748b;
    background: #f1f5f9;
    padding: 4px 10px;
    border-radius: 20px;
    border: 1px solid #e2e8f0;
  }

  .pos-fullscreen-btn {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    background: rgba(79, 70, 229, 0.08);
    border: 1px solid rgba(79, 70, 229, 0.25);
    color: #4f46e5;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s;
  }
  .pos-fullscreen-btn:hover { background: rgba(79, 70, 229, 0.15); }

  /* ─── Main layout ────────────────────────── */
  .pos-main {
    display: flex;
    flex: 1;
    overflow: hidden;
    height: calc(100vh - 58px);
  }

  /* ─── Left panel ─────────────────────────── */
  .pos-panel-left {
    flex: 1 1 68%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 16px;
    gap: 12px;
    border-right: 1px solid #e2e8f0;
    background: #f8fafc;
  }

  /* Search */
  .pos-search-bar {
    display: flex;
    align-items: center;
    background: #ffffff;
    border: 1.5px solid #e2e8f0;
    border-radius: 12px;
    padding: 0 14px;
    gap: 10px;
    transition: border-color 0.2s, box-shadow 0.2s;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  }
  .pos-search-bar:focus-within {
    border-color: #4f46e5;
    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.12);
  }

  .pos-search-icon { color: #94a3b8; flex-shrink: 0; }

  .pos-search-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: #0f172a;
    font-size: 14px;
    padding: 12px 0;
    min-width: 0;
  }
  .pos-search-input::placeholder { color: #94a3b8; }

  .pos-search-clear {
    background: none;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    padding: 4px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    transition: color 0.15s;
  }
  .pos-search-clear:hover { color: #0f172a; }

  /* Category chips */
  .pos-categories {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    scrollbar-width: none;
    flex-shrink: 0;
    padding-bottom: 2px;
  }
  .pos-categories::-webkit-scrollbar { display: none; }

  .pos-chip {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 14px;
    border-radius: 20px;
    border: 1.5px solid #e2e8f0;
    background: #ffffff;
    color: #64748b;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s;
    flex-shrink: 0;
  }
  .pos-chip:hover {
    border-color: rgba(79, 70, 229, 0.5);
    color: #4f46e5;
    background: rgba(79, 70, 229, 0.05);
  }
  .pos-chip-active {
    background: linear-gradient(135deg, #4f46e5, #7c3aed);
    border-color: transparent;
    color: #fff;
    box-shadow: 0 2px 10px rgba(79, 70, 229, 0.3);
  }

  /* Results count */
  .pos-results-count {
    font-size: 12px;
    color: #94a3b8;
    padding-left: 2px;
  }

  /* Empty state */
  .pos-empty-products {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: #cbd5e1;
  }

  /* Product grid */
  .pos-product-grid {
    flex: 1;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 12px;
    align-content: start;
    scrollbar-width: thin;
    scrollbar-color: rgba(79,70,229,0.3) transparent;
    padding-right: 4px;
  }
  .pos-product-grid::-webkit-scrollbar { width: 6px; }
  .pos-product-grid::-webkit-scrollbar-track { background: transparent; }
  .pos-product-grid::-webkit-scrollbar-thumb { background: rgba(79,70,229,0.25); border-radius: 3px; }

  /* Product card */
  .pos-product-card {
    display: flex;
    flex-direction: column;
    background: #ffffff;
    border: 1.5px solid #e2e8f0;
    border-radius: 14px;
    overflow: hidden;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
    text-align: left;
    position: relative;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
  }
  .pos-product-card:hover:not(:disabled) {
    border-color: rgba(79, 70, 229, 0.6);
    transform: translateY(-2px) scale(1.01);
    box-shadow: 0 8px 24px rgba(79, 70, 229, 0.15);
  }
  .pos-product-card:active:not(:disabled) { transform: scale(0.97); }

  .pos-product-card--out {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .pos-product-card--in-cart {
    border-color: rgba(5, 150, 105, 0.6);
    box-shadow: 0 0 0 1px rgba(5, 150, 105, 0.15);
  }

  .pos-product-img {
    height: 110px;
    background: #f1f5f9;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
  }
  .pos-product-img img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .pos-product-img-placeholder { color: #cbd5e1; }

  .pos-product-qty-badge {
    position: absolute;
    top: 6px;
    right: 6px;
    background: #059669;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    width: 22px;
    height: 22px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 2px 8px rgba(5,150,105,0.4);
  }

  .pos-product-info {
    padding: 10px 12px 12px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .pos-product-name {
    font-size: 13px;
    font-weight: 600;
    color: #0f172a;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .pos-product-ref {
    font-size: 10px;
    color: #94a3b8;
    font-family: monospace;
  }

  .pos-product-bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 6px;
    flex-wrap: wrap;
    gap: 4px;
  }

  .pos-product-price {
    font-size: 13px;
    font-weight: 700;
    color: #4f46e5;
  }

  .pos-product-stock {
    font-size: 10px;
    color: #64748b;
    background: #f1f5f9;
    padding: 2px 7px;
    border-radius: 10px;
  }
  .pos-product-stock--low { color: #d97706; background: #fef3c7; }

  /* ─── Right panel ─────────────────────────── */
  .pos-panel-right {
    flex: 0 0 32%;
    min-width: 300px;
    max-width: 420px;
    display: flex;
    flex-direction: column;
    background: #ffffff;
    border-left: 1px solid #e2e8f0;
  }

  /* Cart header */
  .pos-cart-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px 12px;
    border-bottom: 1px solid #e2e8f0;
  }

  .pos-cart-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 15px;
    font-weight: 700;
    color: #0f172a;
  }

  .pos-cart-count {
    background: #4f46e5;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pos-clear-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    color: #dc2626;
    background: rgba(220, 38, 38, 0.08);
    border: 1px solid rgba(220, 38, 38, 0.2);
    border-radius: 8px;
    padding: 5px 11px;
    cursor: pointer;
    transition: all 0.2s;
  }
  .pos-clear-btn:hover { background: rgba(220, 38, 38, 0.15); }

  /* Cart items list */
  .pos-cart-items {
    flex: 1;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(79,70,229,0.3) transparent;
  }
  .pos-cart-items::-webkit-scrollbar { width: 4px; }
  .pos-cart-items::-webkit-scrollbar-thumb { background: rgba(79,70,229,0.25); border-radius: 2px; }

  /* Empty cart */
  .pos-cart-empty {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: #cbd5e1;
    padding: 40px 20px;
    text-align: center;
  }
  .pos-cart-empty p { color: #64748b; font-size: 14px; font-weight: 600; }
  .pos-cart-empty span { color: #94a3b8; font-size: 12px; }

  /* Cart item */
  .pos-cart-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    border-bottom: 1px solid #f1f5f9;
    transition: background 0.15s;
  }
  .pos-cart-item:hover { background: #f8fafc; }

  .pos-cart-item-info {
    flex: 1;
    min-width: 0;
  }

  .pos-cart-item-name {
    font-size: 12px;
    font-weight: 600;
    color: #0f172a;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pos-cart-item-price {
    font-size: 11px;
    color: #94a3b8;
    margin-top: 2px;
  }

  .pos-cart-item-controls {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .pos-qty-btn {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: rgba(79, 70, 229, 0.08);
    border: 1px solid rgba(79, 70, 229, 0.25);
    color: #4f46e5;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s;
    flex-shrink: 0;
  }
  .pos-qty-btn:hover:not(:disabled) { background: rgba(79, 70, 229, 0.18); }
  .pos-qty-btn:disabled { opacity: 0.35; cursor: not-allowed; }

  .pos-qty-value {
    width: 24px;
    text-align: center;
    font-size: 13px;
    font-weight: 700;
    color: #0f172a;
  }

  .pos-cart-item-right {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
    flex-shrink: 0;
  }

  .pos-cart-item-total {
    font-size: 12px;
    font-weight: 700;
    color: #4f46e5;
  }

  .pos-remove-btn {
    width: 22px;
    height: 22px;
    border-radius: 6px;
    background: rgba(220, 38, 38, 0.06);
    border: none;
    color: #94a3b8;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s;
  }
  .pos-remove-btn:hover { background: rgba(220, 38, 38, 0.15); color: #dc2626; }

  /* ─── Footer ─────────────────────────────── */
  .pos-cart-footer {
    padding: 16px;
    border-top: 1px solid #e2e8f0;
    background: #ffffff;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .pos-totals {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .pos-totals-row {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: #64748b;
  }

  .pos-totals-divider {
    border-top: 1px solid #e2e8f0;
    margin: 2px 0;
  }

  .pos-total-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 0;
  }

  .pos-total-row > span:first-child {
    font-size: 14px;
    font-weight: 600;
    color: #64748b;
  }

  .pos-total-amount {
    font-size: 22px;
    font-weight: 800;
    background: linear-gradient(135deg, #4f46e5, #7c3aed);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
  }

  /* Pay button */
  .pos-pay-btn {
    width: 100%;
    padding: 16px;
    border-radius: 14px;
    background: linear-gradient(135deg, #4f46e5, #7c3aed);
    color: #fff;
    font-size: 15px;
    font-weight: 700;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    transition: all 0.2s;
    box-shadow: 0 4px 16px rgba(79, 70, 229, 0.3);
    letter-spacing: 0.2px;
  }
  .pos-pay-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 8px 24px rgba(79, 70, 229, 0.45);
  }
  .pos-pay-btn:active:not(:disabled) { transform: scale(0.98); }
  .pos-pay-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    box-shadow: none;
    transform: none;
  }

  .pos-btn-spinner {
    animation: spin 1s linear infinite;
  }

  .pos-payment-mode {
    text-align: center;
    font-size: 11px;
    color: #94a3b8;
  }

  /* ─── Responsive ─────────────────────────── */
  @media (max-width: 900px) {
    .pos-main { flex-direction: column; height: auto; min-height: calc(100vh - 58px); }
    .pos-panel-left { flex: none; height: 55vh; border-right: none; border-bottom: 1px solid #e2e8f0; }
    .pos-panel-right { flex: none; min-width: unset; max-width: unset; min-height: 45vh; }
  }

  @media (max-width: 600px) {
    .pos-product-grid { grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); }
    .pos-header-title h1 { font-size: 15px; }
  }
`}</style>
    </div>
  );
}
