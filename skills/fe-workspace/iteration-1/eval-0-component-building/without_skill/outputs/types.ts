export type OrderStatus = "pending" | "completed" | "cancelled";

export interface Order {
  id: string;
  orderNumber: string;
  customerName: string;
  status: OrderStatus;
  totalAmount: number;
  createdAt: string;
}

export interface OrdersResponse {
  orders: Order[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
}

export const ORDER_STATUS_LABEL: Record<"all" | OrderStatus, string> = {
  all: "전체",
  pending: "대기중",
  completed: "완료",
  cancelled: "취소",
};
