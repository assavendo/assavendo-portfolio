import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
const Portfolio = lazy(() => import("./pages/Portfolio"));
const ExampleDetail = lazy(() => import("./pages/ExampleDetail"));
const DemoPage = lazy(() => import("./pages/DemoPage"));
const Store = lazy(() => import("./pages/Store"));
const ProductDetail = lazy(() => import("./pages/ProductDetail"));
const PaymentReturn = lazy(() => import("./pages/PaymentReturn"));
const Admin = lazy(() => import("./pages/Admin"));
const Legal = lazy(() => import("./pages/Legal"));
import NotFound from "./pages/NotFound";
function Router() {
  return <Suspense fallback={<div className="loading-state" aria-live="polite">Chargement…</div>}>
    <Switch>
      <Route path="/" component={Home} /><Route path="/portfolio" component={Portfolio} />
      <Route path="/problemes/:slug" component={ExampleDetail} /><Route path="/exemples/:slug" component={ExampleDetail} />
      <Route path="/demos/:slug" component={DemoPage} /><Route path="/boutique" component={Store} /><Route path="/produits/:slug" component={ProductDetail} />
      <Route path="/paiement/retour" component={PaymentReturn} /><Route path="/admin" component={Admin} />
      <Route path="/mentions-legales" component={Legal} /><Route path="/confidentialite" component={Legal} /><Route path="/conditions-generales" component={Legal} />
      <Route path="/404" component={NotFound} /><Route component={NotFound} />
    </Switch>
  </Suspense>;
}
export default function App() { return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>; }
