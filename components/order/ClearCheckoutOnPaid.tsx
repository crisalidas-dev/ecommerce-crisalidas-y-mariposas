"use client";

import { useEffect } from "react";
import { setCart } from "@/components/cart/cartStore";
import { getSnapshot as getFlow, updateFlow } from "@/components/checkout/flowDraftStore";
import { updateDraft } from "@/components/checkout/deliveryDraftStore";
import { emptyCart } from "@/lib/domain/cart";
import { emptyDraft } from "@/lib/domain/checkout/deliveryStep";
import { emptyFlowDraft } from "@/lib/domain/checkout/flowDraft";
import { shouldClearCheckoutState } from "@/lib/domain/checkout/orderPage";

/**
 * Empties the cart and the checkout progress once the server has rendered this
 * order as PAID (only mounted in that case). Idempotent: it clears the attempt
 * it matches on, so a second run finds nothing to do. It only clears when this
 * browser was checking out exactly this order, so reopening an old receipt link
 * never wipes a new cart. Renders nothing.
 */
export function ClearCheckoutOnPaid({ orderId }: { orderId: string }) {
  useEffect(() => {
    const attemptOrderId = getFlow().attempt?.orderId ?? null;
    if (!shouldClearCheckoutState("paid", attemptOrderId, orderId)) return;
    setCart(emptyCart());
    updateFlow(emptyFlowDraft());
    updateDraft(emptyDraft());
  }, [orderId]);

  return null;
}
