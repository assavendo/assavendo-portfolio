"use client";
import { useEffect } from "react";
import { clearCart } from "@/app/actions/cart";
/** Vide le panier une fois le retour de paiement affiché (le panier est conservé si le paiement est annulé). */
export function ClearCart() { useEffect(() => { void clearCart(); }, []); return null; }
