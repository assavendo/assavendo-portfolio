export type SupplierIntegrationMode =
  | "native_api"
  | "oauth_api"
  | "partner_api"
  | "restricted_api"
  | "feed"
  | "managed_platform"
  | "directory"
  | "generic_rest";

export type SupplierVerificationStatus =
  | "documented"
  | "approval_required"
  | "partner_required"
  | "managed_only"
  | "directory"
  | "custom";

export type SupplierProviderProfile = {
  key: string;
  name: string;
  short: string;
  integrationMode: SupplierIntegrationMode;
  verificationStatus: SupplierVerificationStatus;
  adapterKey: string;
  officialUrl: string | null;
  docsUrl: string | null;
  capabilities: {
    catalog: boolean;
    inventory: boolean;
    orders: boolean;
    orderStatus: boolean;
    tracking: boolean;
    webhooks: boolean;
    sandbox: boolean;
    repricing: boolean;
    multiSupplier?: boolean;
  };
  credentialFields: string[];
  setupSteps: string[];
  notes: string;
};

export const SUPPLIER_PROVIDERS: SupplierProviderProfile[] = [
  {
    key: "cj_dropshipping",
    name: "CJdropshipping",
    short: "API 2.0 + webhooks",
    integrationMode: "native_api",
    verificationStatus: "documented",
    adapterKey: "cj",
    officialUrl: "https://cjdropshipping.com",
    docsUrl: "https://developers.cjdropshipping.com/en/api/start/",
    capabilities: { catalog:true, inventory:true, orders:true, orderStatus:true, tracking:true, webhooks:true, sandbox:true, repricing:true },
    credentialFields: ["API Key", "Access Token / Refresh Token (server-managed)", "openId for webhook verification"],
    setupSteps: ["Installer l’app API CJ", "Créer la clé API", "Échanger la clé contre les tokens", "Configurer les webhooks signés", "Tester le sandbox puis synchroniser"],
    notes: "Connecteur natif prioritaire. Les appels API utilisent le token CJ et les webhooks HMAC-SHA256.",
  },
  {
    key: "hypersku",
    name: "HyperSKU",
    short: "Open API",
    integrationMode: "native_api",
    verificationStatus: "approval_required",
    adapterKey: "hypersku",
    officialUrl: "https://hypersku.com",
    docsUrl: "https://support.hypersku.com/",
    capabilities: { catalog:true, inventory:true, orders:true, orderStatus:true, tracking:true, webhooks:false, sandbox:false, repricing:true },
    credentialFields: ["Identifiants Open API fournis/validés par HyperSKU"],
    setupSteps: ["Créer le compte", "Demander l’accès Open API", "Récupérer les identifiants", "Tester la lecture catalogue/stock", "Activer les commandes après validation"],
    notes: "L’accès Open API est disponible pour connecter une boutique custom, mais les détails d’authentification doivent venir de HyperSKU.",
  },
  {
    key: "alibaba_dropshipping",
    name: "Alibaba.com Dropshipping",
    short: "Open Platform / OAuth",
    integrationMode: "oauth_api",
    verificationStatus: "approval_required",
    adapterKey: "alibaba",
    officialUrl: "https://www.alibaba.com",
    docsUrl: "https://openapi.alibaba.com/doc/doc.htm",
    capabilities: { catalog:true, inventory:true, orders:true, orderStatus:true, tracking:true, webhooks:true, sandbox:false, repricing:true },
    credentialFields: ["App Key", "App Secret", "Autorisation vendeur/compte", "Permissions API"],
    setupSteps: ["Créer l’application développeur", "Obtenir App Key/Secret", "Demander les permissions", "Autoriser le compte fournisseur", "Valider le flux dropshipping"],
    notes: "L’Open Platform est soumise aux permissions et à l’éligibilité de l’application.",
  },
  {
    key: "syncee",
    name: "Syncee",
    short: "Marketplace / DataFeed",
    integrationMode: "feed",
    verificationStatus: "managed_only",
    adapterKey: "syncee",
    officialUrl: "https://syncee.com",
    docsUrl: "https://help.syncee.com/",
    capabilities: { catalog:true, inventory:true, orders:true, orderStatus:true, tracking:true, webhooks:false, sandbox:false, repricing:true },
    credentialFields: ["Source feed", "URL/FTP/API/SOAP selon le fournisseur", "Identifiants de source si requis"],
    setupSteps: ["Choisir le fournisseur/catalogue", "Identifier le type de feed", "Configurer la fréquence", "Mapper SKU/variantes", "Valider l’ordre et le tracking"],
    notes: "Syncee peut travailler avec CSV/XML/XLS(X)/JSON, URL, stockage cloud, SFTP, SOAP ou API côté fournisseur.",
  },
  {
    key: "spocket",
    name: "Spocket",
    short: "Managed platform",
    integrationMode: "managed_platform",
    verificationStatus: "managed_only",
    adapterKey: "spocket",
    officialUrl: "https://www.spocket.co",
    docsUrl: "https://help.spocket.co/",
    capabilities: { catalog:true, inventory:true, orders:true, orderStatus:true, tracking:true, webhooks:false, sandbox:false, repricing:true },
    credentialFields: ["Connexion plateforme/partenaire approuvé"],
    setupSteps: ["Connecter le compte Spocket", "Vérifier l’intégration disponible pour Assavendo", "Configurer le catalogue", "Mapper les variantes", "Valider les commandes"],
    notes: "Les intégrations publiques documentées sont surtout orientées plateformes e-commerce; une connexion directe custom doit être validée avec Spocket.",
  },
  {
    key: "dsers",
    name: "DSers",
    short: "Partner Open API",
    integrationMode: "partner_api",
    verificationStatus: "approval_required",
    adapterKey: "dsers",
    officialUrl: "https://www.dsers.com",
    docsUrl: "https://help.dsers.com/",
    capabilities: { catalog:true, inventory:true, orders:true, orderStatus:true, tracking:true, webhooks:true, sandbox:true, repricing:true, multiSupplier:true },
    credentialFields: ["Compte développeur / application", "Identifiants API", "Autorisation des comptes source"],
    setupSteps: ["Enregistrer l’application partenaire", "Obtenir l’accès Open API", "Connecter les comptes source", "Configurer le mapping", "Tester le fulfillment"],
    notes: "DSers est une couche d’orchestration utile pour AliExpress, Alibaba.com et 1688.",
  },
  {
    key: "aliexpress",
    name: "AliExpress",
    short: "Open Platform restreinte",
    integrationMode: "restricted_api",
    verificationStatus: "approval_required",
    adapterKey: "aliexpress",
    officialUrl: "https://www.aliexpress.com",
    docsUrl: "https://developer.alibaba.com/docs/doc.htm?treeId=727",
    capabilities: { catalog:true, inventory:true, orders:true, orderStatus:true, tracking:true, webhooks:true, sandbox:false, repricing:true },
    credentialFields: ["App Key", "App Secret", "Autorisation vendeur / permissions Open Platform"],
    setupSteps: ["Créer le compte développeur", "Enregistrer l’application", "Demander les permissions", "Obtenir l’autorisation", "Tester le flux"],
    notes: "Pour le dropshipping opérationnel, DSers est généralement le meilleur chemin d’orchestration si l’accès direct n’est pas accordé.",
  },
  {
    key: "salehoo",
    name: "SaleHoo",
    short: "Directory / feed fournisseur",
    integrationMode: "directory",
    verificationStatus: "directory",
    adapterKey: "salehoo",
    officialUrl: "https://www.salehoo.com",
    docsUrl: "https://support.salehoo.com/",
    capabilities: { catalog:true, inventory:false, orders:false, orderStatus:false, tracking:false, webhooks:false, sandbox:false, repricing:true },
    credentialFields: ["Feed / plugin / CSV / XML selon le fournisseur référencé"],
    setupSteps: ["Trouver un fournisseur compatible", "Vérifier son mode d’intégration", "Configurer le feed", "Mapper SKU", "Configurer le canal de commande"],
    notes: "SaleHoo n’est pas un fournisseur API universel: l’automatisation dépend du fournisseur choisi dans l’annuaire.",
  },
  {
    key: "eprolo",
    name: "EPROLO",
    short: "API sur demande",
    integrationMode: "native_api",
    verificationStatus: "approval_required",
    adapterKey: "eprolo",
    officialUrl: "https://eprolo.com",
    docsUrl: "https://eprolo.com/eprolo-api/",
    capabilities: { catalog:true, inventory:true, orders:true, orderStatus:true, tracking:true, webhooks:false, sandbox:false, repricing:true },
    credentialFields: ["Identifiants API délivrés par EPROLO"],
    setupSteps: ["Créer le compte", "Demander l’API au support", "Récupérer la documentation", "Configurer le connecteur", "Tester le stock et les commandes"],
    notes: "EPROLO indique que l’accès API est demandé auprès du support.",
  },
  {
    key: "wiio",
    name: "Wiio",
    short: "Managed sourcing / fulfillment",
    integrationMode: "managed_platform",
    verificationStatus: "managed_only",
    adapterKey: "wiio",
    officialUrl: "https://wiio.com",
    docsUrl: "https://wiio.com/dropshipping/",
    capabilities: { catalog:true, inventory:true, orders:true, orderStatus:true, tracking:true, webhooks:false, sandbox:false, repricing:true },
    credentialFields: ["Connexion de plateforme ou accès partenaire"],
    setupSteps: ["Créer le compte", "Valider les pays/produits", "Connecter la boutique ou le canal", "Importer et mapper", "Valider le fulfillment"],
    notes: "Wiio documente des intégrations de boutiques et un flux de sourcing/fulfillment géré.",
  },
  {
    key: "1688_via_dsers",
    name: "1688 via DSers",
    short: "Source low-cost via DSers",
    integrationMode: "partner_api",
    verificationStatus: "documented",
    adapterKey: "dsers",
    officialUrl: "https://www.dsers.com",
    docsUrl: "https://www.dsers.com/en/integration/1688-dropshipping-service",
    capabilities: { catalog:true, inventory:true, orders:true, orderStatus:true, tracking:true, webhooks:false, sandbox:false, repricing:true, multiSupplier:true },
    credentialFields: ["Compte DSers"],
    setupSteps: ["Ouvrir DSers", "Choisir 1688 Dropshipping", "Importer le produit", "Mapper les variantes", "Valider la commande et le paiement fournisseur"],
    notes: "Route 1688 dropshipping gérée dans DSers; elle évite d’exiger un compte 1688 séparé pour ce mode.",
  },
  {
    key: "custom_rest",
    name: "Fournisseur personnalisé",
    short: "API REST configurable",
    integrationMode: "generic_rest",
    verificationStatus: "custom",
    adapterKey: "generic_rest",
    officialUrl: null,
    docsUrl: null,
    capabilities: { catalog:true, inventory:true, orders:true, orderStatus:true, tracking:true, webhooks:true, sandbox:false, repricing:true },
    credentialFields: ["Secret API", "En-tête/prefixe configurables"],
    setupSteps: ["Renseigner l’API", "Configurer stock/prix", "Configurer commandes", "Tester", "Mapper les SKUs"],
    notes: "Fallback universel pour tout fournisseur qui expose une API REST exploitable.",
  },
];

export function getSupplierProvider(key: string): SupplierProviderProfile {
  return SUPPLIER_PROVIDERS.find((provider) => provider.key === key) ?? SUPPLIER_PROVIDERS[SUPPLIER_PROVIDERS.length - 1];
}
