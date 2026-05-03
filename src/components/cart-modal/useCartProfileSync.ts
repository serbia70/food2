import { useEffect } from "preact/hooks";

import { SHOP_EVENTS } from "../../lib/events";
import { getUserInfo } from "../../lib/userStore";

interface OrderForm {
  name: string;
  phone: string;
  password: string;
  address: string;
  note: string;
}

interface AddressPayload {
  name?: string;
  phone?: string;
  address?: string;
}

interface AddressApiResponse {
  success?: boolean;
  address?: string;
}

type UseCartProfileSyncOptions = {
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
  setStep: (value: number) => void;
  setDeliveryMode: (value: boolean) => void;
  setTableNumber: (value: string) => void;
  setForm: (updater: (prev: OrderForm) => OrderForm) => void;
  setHistoryAddrs: (value: string[]) => void;
};

export function useCartProfileSync({
  isOpen,
  setIsOpen,
  setStep,
  setDeliveryMode,
  setTableNumber,
  setForm,
  setHistoryAddrs,
}: UseCartProfileSyncOptions) {
  useEffect(() => {
    const user = getUserInfo();

    setForm((prev) => ({
      ...prev,
      name: user.name || "",
      phone: user.phone || "",
      password: "",
    }));
    setHistoryAddrs(user.addresses || []);

    const urlParams = new URLSearchParams(window.location.search);
    const tableParam = urlParams.get("table");
    const modeParam = urlParams.get("mode");
    const deliveryDefault = !tableParam && modeParam !== "tables";

    setDeliveryMode(modeParam === "delivery" || deliveryDefault);

    if (tableParam) {
      setTableNumber(tableParam);
    }

    const handleOpenCart = () => {
      setIsOpen(true);
      setStep(1);
    };
    window.addEventListener(SHOP_EVENTS.OPEN_CART, handleOpenCart);
    return () => window.removeEventListener(SHOP_EVENTS.OPEN_CART, handleOpenCart);
  }, [setDeliveryMode, setForm, setHistoryAddrs, setIsOpen, setStep, setTableNumber]);

  useEffect(() => {
    if (!isOpen) return;

    const fetchAddress = async () => {
      const sessionToken = localStorage.getItem("user_session");
      if (!sessionToken) return;

      try {
        const res = await fetch("/api/user/address", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "get", sessionToken }),
        });
        const data: AddressApiResponse = await res.json();
        if (data.success && data.address) {
          let addrObj: AddressPayload = {};
          try {
            addrObj = JSON.parse(data.address) as AddressPayload;
          } catch {
            addrObj = { address: data.address };
          }

          setForm((prev) => ({
            ...prev,
            name: addrObj.name || prev.name,
            phone: addrObj.phone || prev.phone,
            address: addrObj.address || prev.address,
          }));
        }
      } catch (error) {
        console.error("Fetch address error", error);
      }
    };

    fetchAddress();
  }, [isOpen, setForm]);
}
