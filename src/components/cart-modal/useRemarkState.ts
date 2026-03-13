import { useReducer } from "preact/hooks";

export interface RemarkState {
  dineInRemarks: string[];
  dineInCustomRemark: string;
  showDineInPanel: boolean;
  deliveryRemarks: string[];
  deliveryCustomRemark: string;
  showDeliveryPanel: boolean;
}

type RemarkAction =
  | { type: "toggle_dine_panel" }
  | { type: "toggle_delivery_panel" }
  | { type: "toggle_dine_remark"; payload: string }
  | { type: "toggle_delivery_remark"; payload: string }
  | { type: "set_dine_custom"; payload: string }
  | { type: "set_delivery_custom"; payload: string }
  | { type: "reset" };

const initialState: RemarkState = {
  dineInRemarks: [],
  dineInCustomRemark: "",
  showDineInPanel: false,
  deliveryRemarks: [],
  deliveryCustomRemark: "",
  showDeliveryPanel: false,
};

function toggleValue(values: string[], remark: string): string[] {
  if (values.includes(remark)) {
    return values.filter((value) => value !== remark);
  }
  return [...values, remark];
}

function reducer(state: RemarkState, action: RemarkAction): RemarkState {
  switch (action.type) {
    case "toggle_dine_panel":
      return { ...state, showDineInPanel: !state.showDineInPanel };
    case "toggle_delivery_panel":
      return { ...state, showDeliveryPanel: !state.showDeliveryPanel };
    case "toggle_dine_remark":
      return {
        ...state,
        dineInRemarks: toggleValue(state.dineInRemarks, action.payload),
      };
    case "toggle_delivery_remark":
      return {
        ...state,
        deliveryRemarks: toggleValue(state.deliveryRemarks, action.payload),
      };
    case "set_dine_custom":
      return { ...state, dineInCustomRemark: action.payload };
    case "set_delivery_custom":
      return { ...state, deliveryCustomRemark: action.payload };
    case "reset":
      return {
        ...state,
        dineInRemarks: [],
        dineInCustomRemark: "",
        deliveryRemarks: [],
        deliveryCustomRemark: "",
      };
    default:
      return state;
  }
}

export function useRemarkState() {
  return useReducer(reducer, initialState);
}
