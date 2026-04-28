"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { create } from "zustand";

import type { OrdersResponse, OrderStatus } from "./types";

const PAGE_SIZE = 10;

interface OrderFilterStore {
  pendingDeleteIds: Set<string>;
  addPendingDelete: (id: string) => void;
  removePendingDelete: (id: string) => void;
}

export const useOrderFilterStore = create<OrderFilterStore>((set) => ({
  pendingDeleteIds: new Set(),
  addPendingDelete: (id) =>
    set((state) => {
      const next = new Set(state.pendingDeleteIds);
      next.add(id);
      return { pendingDeleteIds: next };
    }),
  removePendingDelete: (id) =>
    set((state) => {
      const next = new Set(state.pendingDeleteIds);
      next.delete(id);
      return { pendingDeleteIds: next };
    }),
}));

async function fetchOrders(
  page: number,
  status?: string,
): Promise<OrdersResponse> {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(PAGE_SIZE));
  if (status && status !== "all") {
    params.set("status", status);
  }

  const res = await fetch(`/api/orders?${params.toString()}`);
  if (!res.ok) throw new Error("주문 목록을 불러오지 못했습니다.");
  return res.json();
}

async function deleteOrder(orderId: string): Promise<void> {
  const res = await fetch(`/api/orders/${orderId}`, { method: "DELETE" });
  if (!res.ok) throw new Error("주문 삭제에 실패했습니다.");
}

export function useOrders() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  const page = Number(searchParams.get("page") ?? "1");
  const status = (searchParams.get("status") ?? "all") as
    | "all"
    | OrderStatus;

  const queryKey = ["orders", { page, status }] as const;

  const { data, isLoading, isError, error } = useQuery({
    queryKey,
    queryFn: () => fetchOrders(page, status),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteOrder,
    onMutate: async (orderId) => {
      await queryClient.cancelQueries({ queryKey: ["orders"] });

      const previous =
        queryClient.getQueryData<OrdersResponse>(queryKey);

      queryClient.setQueryData<OrdersResponse>(queryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          orders: old.orders.filter((o) => o.id !== orderId),
          totalCount: old.totalCount - 1,
        };
      });

      return { previous };
    },
    onError: (_err, _orderId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });

  function setStatus(newStatus: "all" | OrderStatus) {
    const params = new URLSearchParams(searchParams.toString());
    if (newStatus === "all") {
      params.delete("status");
    } else {
      params.set("status", newStatus);
    }
    params.set("page", "1");
    router.push(`/orders?${params.toString()}`);
  }

  function setPage(newPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    router.push(`/orders?${params.toString()}`);
  }

  return {
    orders: data?.orders ?? [],
    totalCount: data?.totalCount ?? 0,
    totalPages: data?.totalPages ?? 0,
    currentPage: page,
    status,
    isLoading,
    isError,
    error,
    setStatus,
    setPage,
    deleteOrder: deleteMutation.mutate,
    isDeleting: deleteMutation.isPending,
  };
}
